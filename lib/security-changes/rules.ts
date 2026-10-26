import type {
	SecurityChangeKind,
	SecurityChangeStatus,
} from "@/db/schema/enums";
import type { DlpPolicy } from "@/lib/dlp/policy";

// Vier-Augen für Sicherheitsänderungen (Härtung A4, ADR-028) — rein.
//
// Zwei Arten:
//  - „wirkt“ (APPLY_KINDS): der neue Wert steht im Antrag; mit der Zustimmung
//    der zweiten Person (oder nach der Wartezeit durch den Job) wird er
//    gesetzt. Hat sich der Wert inzwischen geändert, verfällt der Antrag.
//  - „erlaubt“ (PERMIT_KINDS): die Zustimmung gibt der anfragenden Person
//    eine einmalige Erlaubnis für 24 h (Organisation löschen, Vollexport,
//    Zugang zurücksetzen, Token anlegen, SSO-Verbindung entfernen) — die
//    Aktion selbst führt sie danach wie gewohnt aus.
//
// Zweite Person = eine andere Inhaber:in oder bestellte Geschäftsleitung.
// Gibt es niemanden, wirkt der Antrag nach 24 h Wartezeit; alle
// Entscheider:innen werden sofort benachrichtigt und können abbrechen.
// Der Stand wird abgeleitet (changeState), gespeichert ist nur das Ereignis.

export const APPLY_KINDS = [
	"sso_policy",
	"dlp_policy",
] as const satisfies readonly SecurityChangeKind[];
export const PERMIT_KINDS = [
	"org_delete",
	"full_export",
	"member_reset_access",
	"integration_token",
	"sso_provider_remove",
	"owner_add",
] as const satisfies readonly SecurityChangeKind[];

export type ApplyKind = (typeof APPLY_KINDS)[number];
export type PermitKind = (typeof PERMIT_KINDS)[number];

export const isApplyKind = (k: SecurityChangeKind): k is ApplyKind =>
	(APPLY_KINDS as readonly string[]).includes(k);
export const isPermitKind = (k: SecurityChangeKind): k is PermitKind =>
	(PERMIT_KINDS as readonly string[]).includes(k);

const HOUR = 60 * 60 * 1000;
export const WAIT_MS = 24 * HOUR;
export const PERMIT_MS = 24 * HOUR;
export const REQUEST_TTL_MS = 7 * 24 * HOUR;

export type ChangeLike = {
	kind: SecurityChangeKind;
	status: SecurityChangeStatus;
	requestedBy: string | null;
	requestedAt: Date;
	applyAfter: Date | null;
	permitUntil: Date | null;
};

/**
 * Abgeleiteter Stand:
 * - pending: wartet auf die zweite Person (verfällt nach 7 Tagen)
 * - waiting: Wartezeit läuft
 * - due: Wartezeit vorbei, der Job setzt den Wert (nur „wirkt“)
 * - permitted: Erlaubnis gilt, die anfragende Person kann ausführen
 * - applied / rejected / cancelled / expired: abgeschlossen
 */
export type ChangeState =
	| "pending"
	| "waiting"
	| "due"
	| "permitted"
	| "applied"
	| "rejected"
	| "cancelled"
	| "expired";

export function changeState(c: ChangeLike, now: Date): ChangeState {
	const t = now.getTime();
	switch (c.status) {
		case "pending":
			return t - c.requestedAt.getTime() > REQUEST_TTL_MS
				? "expired"
				: "pending";
		case "waiting":
			if (c.applyAfter && t < c.applyAfter.getTime()) return "waiting";
			if (isApplyKind(c.kind)) return "due";
			return c.permitUntil && t < c.permitUntil.getTime()
				? "permitted"
				: "expired";
		case "approved":
			return c.permitUntil && t < c.permitUntil.getTime()
				? "permitted"
				: "expired";
		default:
			return c.status;
	}
}

export const OPEN_STATES: readonly ChangeState[] = [
	"pending",
	"waiting",
	"due",
	"permitted",
];

export const isOpen = (c: ChangeLike, now: Date) =>
	OPEN_STATES.includes(changeState(c, now));

/**
 * Wer als zweite Person zählt: Inhaber:innen und bestellte GL, die das seit
 * mindestens 24 h sind. Sonst könnte eine übernommene Inhaber-Sitzung eine
 * eigene zweite Person einsetzen und sich selbst zustimmen — so wartet sie
 * genauso 24 h wie ohne zweite Person.
 */
export const DECIDER_TENURE_MS = 24 * HOUR;

export function eligibleDeciders(
	candidates: readonly { userId: string; since: Date }[],
	now: Date,
): string[] {
	return [
		...new Set(
			candidates
				.filter((c) => now.getTime() - c.since.getTime() >= DECIDER_TENURE_MS)
				.map((c) => c.userId),
		),
	];
}

/** Weg eines neuen Antrags: zweite Person oder 24 h Wartezeit. */
export function changeRoute(
	deciders: readonly string[],
	requester: string,
	now: Date,
): {
	status: "pending" | "waiting";
	applyAfter: Date | null;
	permitUntil: Date | null;
	notify: string[];
} {
	const others = [...new Set(deciders)].filter((id) => id !== requester);
	if (others.length > 0)
		return {
			status: "pending",
			applyAfter: null,
			permitUntil: null,
			notify: others,
		};
	const applyAfter = new Date(now.getTime() + WAIT_MS);
	return {
		status: "waiting",
		applyAfter,
		permitUntil: new Date(applyAfter.getTime() + PERMIT_MS),
		// Wartezeit: die anfragende Person selbst bekommt die Mitteilung
		// (Mail) — bei übernommener Sitzung merkt sie es so
		notify: [requester],
	};
}

export type DecideError = "four_eyes_not_open" | "forbidden" | "four_eyes_self";

/** Zustimmen/ablehnen: nur eine andere Entscheider:in, nur offen. */
export function canDecideChange(
	c: ChangeLike,
	userId: string,
	deciders: readonly string[],
	now: Date,
): DecideError | null {
	if (changeState(c, now) !== "pending") return "four_eyes_not_open";
	if (c.requestedBy === userId) return "four_eyes_self";
	if (!deciders.includes(userId)) return "forbidden";
	return null;
}

/** Abbrechen: anfragende Person oder jede Entscheider:in, solange offen. */
export function canCancelChange(
	c: ChangeLike,
	userId: string,
	deciders: readonly string[],
	now: Date,
): "four_eyes_not_open" | "forbidden" | null {
	if (!isOpen(c, now)) return "four_eyes_not_open";
	if (c.requestedBy !== userId && !deciders.includes(userId))
		return "forbidden";
	return null;
}

// ── Was ist kritisch? ──────────────────────────────────────────────────────

export type SsoPolicyLike = {
	enforce: boolean;
	trustIdpMfa: boolean;
	defaultRole: string;
	groupRoles: readonly { group: string; role: string }[];
	// Claim bzw. SAML-Attribut mit den Gruppen (bestimmt die Rolle mit)
	groupClaim?: string;
};

/**
 * Kritische Teile einer SSO-Regeländerung: Erzwingen ein- oder ausschalten,
 * Firmen-MFA anerkennen, Rollen aus Gruppen bzw. Standardrolle ändern.
 * Leer = ohne zweite Person speichern.
 */
export function ssoPolicyCritical(
	before: SsoPolicyLike,
	after: SsoPolicyLike,
): ("enforce_on" | "enforce_off" | "idp_mfa_on" | "roles")[] {
	const out: ("enforce_on" | "enforce_off" | "idp_mfa_on" | "roles")[] = [];
	if (!before.enforce && after.enforce) out.push("enforce_on");
	if (before.enforce && !after.enforce) out.push("enforce_off");
	if (!before.trustIdpMfa && after.trustIdpMfa) out.push("idp_mfa_on");
	const roles = (p: SsoPolicyLike) =>
		JSON.stringify([
			p.defaultRole,
			p.groupClaim ?? null,
			[...p.groupRoles].map((g) => `${g.group}\u0000${g.role}`).sort(),
		]);
	if (roles(before) !== roles(after)) out.push("roles");
	return out;
}

const SSO_CHANGE_LABEL = {
	enforce_on: "SSO erzwingen",
	enforce_off: "SSO-Pflicht aufheben",
	idp_mfa_on: "Firmen-MFA als zweiten Faktor anerkennen",
	roles: "Rollen aus SSO-Gruppen ändern",
} as const;

/** Lesbare Zusammenfassung für Antrag und Mitteilung. */
export function ssoChangeSummary(
	critical: readonly (keyof typeof SSO_CHANGE_LABEL)[],
): string {
	return `SSO: ${critical.map((k) => SSO_CHANGE_LABEL[k]).join(", ")}`;
}

const DLP_RANK = { allow: 0, raise: 1, warn: 2, block: 3 } as const;
const DLP_RULES = ["secret", "payment", "bank", "tax", "pii"] as const;

/**
 * DLP gelockert? Eine Regel milder, Massen-PII-Schwelle höher, mehr
 * Downloads erlaubt (Grenze höher oder Fenster kürzer). Strenger = sofort.
 */
export function dlpRelaxed(before: DlpPolicy, after: DlpPolicy): string[] {
	const out: string[] = [];
	for (const k of DLP_RULES)
		if (DLP_RANK[after[k]] < DLP_RANK[before[k]]) out.push(k);
	if (after.piiThreshold > before.piiThreshold) out.push("piiThreshold");
	// mehr am Stück oder mehr je Minute = lockerer
	const rate = (p: DlpPolicy) => p.egressLimit / p.egressWindowMinutes;
	if (after.egressLimit > before.egressLimit || rate(after) > rate(before))
		out.push("egress");
	return out;
}
