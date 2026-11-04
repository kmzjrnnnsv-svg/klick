// Identität anbinden (Teil D, I1b): Filter und Zustand eines Kontos für
// /team/konten. Rein, ohne Server-Importe; die Zeit kommt als Eingabe.

import type { IdentityPolicy } from "./policy";
import { IDENTITY_CHECKS, type IdentityCheckKey } from "./types";

// Schalter über der Liste (?ohne_mfa=1&admins=1 …), alle zusammen = und
export const ACCOUNT_CHIPS = [
	"ohne_mfa",
	"admins",
	"gaeste",
	"inaktiv",
	"ausgeschieden",
	"ausnahmen",
] as const;
export type AccountChip = (typeof ACCOUNT_CHIPS)[number];

export const ACCOUNT_STATES = ["aktiv", "deaktiviert", "verschwunden"] as const;
export type AccountStateFilter = (typeof ACCOUNT_STATES)[number];

export const ACCOUNT_MATCH = ["zugeordnet", "ohne"] as const;
export type AccountMatchFilter = (typeof ACCOUNT_MATCH)[number];

export type AccountFilter = {
	chips: AccountChip[];
	state: AccountStateFilter | null;
	match: AccountMatchFilter | null;
	// betroffene Konten einer Prüfung (?pruefung=mfa)
	check: IdentityCheckKey | null;
	q: string | null;
};

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function oneOf<T extends string>(
	list: readonly T[],
	value: string | undefined,
): T | null {
	return value && (list as readonly string[]).includes(value)
		? (value as T)
		: null;
}

export function accountFilterOf(sp: Query): AccountFilter {
	const q = one(sp.q)?.trim().slice(0, 100) ?? "";
	return {
		chips: ACCOUNT_CHIPS.filter((c) => one(sp[c]) === "1"),
		state: oneOf(ACCOUNT_STATES, one(sp.status)),
		match: oneOf(ACCOUNT_MATCH, one(sp.person)),
		check: oneOf(
			Object.keys(IDENTITY_CHECKS) as IdentityCheckKey[],
			one(sp.pruefung),
		),
		q: q.length > 0 ? q : null,
	};
}

// Link auf die Liste mit genau diesem Filter (z. B. vom Control aus)
export function accountsHref(
	filter: Partial<Pick<AccountFilter, "check" | "state">> & {
		chips?: AccountChip[];
	} = {},
): string {
	const p = new URLSearchParams();
	for (const c of filter.chips ?? []) p.set(c, "1");
	if (filter.state) p.set("status", filter.state);
	if (filter.check) p.set("pruefung", filter.check);
	const qs = p.toString();
	return qs ? `/team/konten?${qs}` : "/team/konten";
}

const DAY_MS = 86_400_000;

export type AccountFlags = {
	// in Klick als ausgeschieden markiert oder Austrittsdatum erreicht
	left: boolean;
	inactive: boolean;
	neverSignedIn: boolean;
	missing: boolean;
};

// Kennzeichen je Konto, gleiche Schwellen wie die Prüfungen (rules.ts)
export function accountFlags(
	a: {
		enabled: boolean;
		kind: "member" | "guest";
		lastSignInAt: Date | null;
		createdAtSource: Date | null;
		leaveAt: Date | null;
		markedLeftAt: Date | null;
		missingSince: Date | null;
	},
	now: Date,
	policy: Pick<IdentityPolicy, "inactiveDays" | "neverSignedInDays">,
): AccountFlags {
	const t = now.getTime();
	const left =
		a.markedLeftAt !== null || (a.leaveAt !== null && a.leaveAt.getTime() <= t);
	const inactive =
		a.lastSignInAt !== null &&
		t - a.lastSignInAt.getTime() > policy.inactiveDays * DAY_MS;
	const neverSignedIn =
		a.lastSignInAt === null &&
		a.createdAtSource !== null &&
		t - a.createdAtSource.getTime() > policy.neverSignedInDays * DAY_MS;
	return { left, inactive, neverSignedIn, missing: a.missingSince !== null };
}

// Grenze für „inaktiv“ als Zeitpunkt (für SQL)
export function inactiveBefore(
	now: Date,
	policy: Pick<IdentityPolicy, "inactiveDays">,
): Date {
	return new Date(now.getTime() - policy.inactiveDays * DAY_MS);
}

// Was die Verbindung mit den erteilten Rechten und der Lizenz nicht liefern
// konnte, als Schlüssel für die Hinweise in den Einstellungen
export function missingCapabilities(
	caps: {
		signIn: boolean;
		mfa: boolean;
		roles: boolean;
		leaveDate: boolean;
	} | null,
): ("signIn" | "mfa" | "roles" | "leaveDate")[] {
	if (!caps) return [];
	return (["signIn", "mfa", "roles", "leaveDate"] as const).filter(
		(k) => !caps[k],
	);
}
