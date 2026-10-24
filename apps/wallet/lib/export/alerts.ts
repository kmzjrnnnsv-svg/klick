import {
	ALERT_SEVERITY,
	type AlertCode,
	type EventData,
} from "@/lib/wallet-link/events";

// Auffälligkeiten für den Export nach Klick (pure). Einmalige Ereignisse
// kommen aus dem Protokoll (der Haken in lib/audit.ts vermerkt sie in
// derselben Transaktion), Zustände des Signers (eingefroren, nicht
// erreichbar) aus dem Abgleich mit dem Anker.

export const ALERT_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
	"wallet.unknown_spend",
	"wallet.signer_head_regressed",
	"wallet.transfer_frozen",
	"wallet.whitelist_blocked",
	"wallet.node_mismatch",
]);

const TITLE: Record<AlertCode, string> = {
	unknown_spend: "Ausgabe ohne Auszahlung aus einem Hot-Konto",
	journal_regressed: "Signer-Journal zurückgesetzt",
	sanctions_hit: "Treffer auf der Sanktionsliste",
	manual_stop: "Alles stoppen: Signer eingefroren",
	signer_frozen: "Signer eingefroren",
	signer_unreachable: "Signer nicht erreichbar",
	node_mismatch: "Knoten weicht ab, Konto angehalten",
};

export type AuditRowForAlert = {
	id: string;
	action: string;
	target: string | null;
	after: unknown;
	at: Date;
};

const idFrom = (target: string | null, prefix: string) =>
	target?.startsWith(prefix) ? target.slice(prefix.length) : null;

const field = (after: unknown, key: string): string | null => {
	if (!after || typeof after !== "object") return null;
	const v = (after as Record<string, unknown>)[key];
	return typeof v === "string" || typeof v === "number" ? String(v) : null;
};

function alert(
	code: AlertCode,
	row: AuditRowForAlert,
	detail: string,
	subject: EventData<"alert.raised">["subject"],
): EventData<"alert.raised"> {
	return {
		alertId: `${code}:${row.id}`,
		code,
		severity: ALERT_SEVERITY[code],
		title: TITLE[code],
		detail: detail.slice(0, 1000),
		subject,
		raisedAt: row.at.toISOString(),
	};
}

export function alertFromAudit(
	row: AuditRowForAlert,
): EventData<"alert.raised"> | null {
	switch (row.action) {
		case "wallet.unknown_spend": {
			const account = idFrom(row.target, "wallet_account:");
			return alert(
				"unknown_spend",
				row,
				`Transaktion ${field(row.after, "txid") ?? "?"} gehört zu keiner Auszahlung.${
					field(row.after, "signerFrozen") === "true"
						? " Der Signer wurde eingefroren."
						: ""
				}`,
				account ? { kind: "account", id: account } : null,
			);
		}
		case "wallet.signer_head_regressed":
			return alert(
				"journal_regressed",
				row,
				"Der Signer meldet einen älteren Journal-Stand als bereits bekannt. Auszahlungen ruhen, bis geklärt ist, welches Journal echt ist.",
				{ kind: "signer", id: idFrom(row.target, "wallet_signer:") ?? "?" },
			);
		case "wallet.transfer_frozen": {
			const transfer = idFrom(row.target, "wallet_transfer:");
			return alert(
				"sanctions_hit",
				row,
				`Eingang ${field(row.after, "amount") ?? "?"} (${field(row.after, "asset") ?? "?"}) in ${field(row.after, "txid") ?? "?"} eingefroren, Liste ${field(row.after, "screeningRef") ?? "?"}.`,
				transfer ? { kind: "transfer", id: transfer } : null,
			);
		}
		case "wallet.whitelist_blocked":
			return alert(
				"sanctions_hit",
				row,
				`Zieladresse ${field(row.after, "address") ?? "?"} (${field(row.after, "network") ?? "?"}) steht auf der Sanktionsliste und wurde nicht aufgenommen.`,
				{
					kind: "destination",
					id: field(row.after, "address") ?? "?",
				},
			);
		case "wallet.node_mismatch": {
			const account = idFrom(row.target, "wallet_account:");
			return alert(
				"node_mismatch",
				row,
				field(row.after, "message") ?? "Knoten leitet andere Adressen ab.",
				account ? { kind: "account", id: account } : null,
			);
		}
		default:
			return null;
	}
}

// Zustände des Signers je Org: eingefroren (von Hand in der App = Alles
// stoppen, sonst am Terminal oder automatisch) und nicht erreichbar (ab der
// Sicherheitsmeldung nach 5 min). Ergebnis: was zu melden bzw. zu erledigen ist.
export type SignerFacts = {
	orgId: string;
	frozen: boolean;
	frozenReason: string | null;
	frozenByApp: boolean;
	unreachableSince: Date | null;
};

// wie die Sicherheitsmeldung im Auszahlungs-Job
export const UNREACHABLE_ALERT_MS = 5 * 60_000;

export type OpenAlert = { alertId: string; code: AlertCode };

export function signerAlertChanges(
	f: SignerFacts,
	open: readonly OpenAlert[],
	now: Date,
): {
	raise: EventData<"alert.raised">[];
	resolve: EventData<"alert.resolved">[];
} {
	const raise: EventData<"alert.raised">[] = [];
	const resolve: EventData<"alert.resolved">[] = [];
	const at = now.toISOString();
	const openFreeze = open.find(
		(a) => a.code === "manual_stop" || a.code === "signer_frozen",
	);
	if (f.frozen && !openFreeze) {
		const code: AlertCode = f.frozenByApp ? "manual_stop" : "signer_frozen";
		raise.push({
			alertId: `${code}:${f.orgId}:${at}`,
			code,
			severity: ALERT_SEVERITY[code],
			title: TITLE[code],
			detail: f.frozenReason
				? `Grund: ${f.frozenReason}`.slice(0, 1000)
				: "Auszahlungen gestoppt.",
			subject: { kind: "signer", id: f.orgId },
			raisedAt: at,
		});
	}
	if (!f.frozen && openFreeze)
		resolve.push({
			alertId: openFreeze.alertId,
			code: openFreeze.code,
			resolvedAt: at,
			note: "Signer aufgetaut",
		});
	const openUnreachable = open.find((a) => a.code === "signer_unreachable");
	const unreachableFor = f.unreachableSince
		? now.getTime() - f.unreachableSince.getTime()
		: 0;
	if (
		f.unreachableSince &&
		unreachableFor >= UNREACHABLE_ALERT_MS &&
		!openUnreachable
	)
		raise.push({
			alertId: `signer_unreachable:${f.orgId}:${f.unreachableSince.toISOString()}`,
			code: "signer_unreachable",
			severity: ALERT_SEVERITY.signer_unreachable,
			title: TITLE.signer_unreachable,
			detail: "Auszahlungen ruhen, bis der Signer wieder antwortet.",
			subject: { kind: "signer", id: f.orgId },
			raisedAt: new Date(
				f.unreachableSince.getTime() + UNREACHABLE_ALERT_MS,
			).toISOString(),
		});
	if (!f.unreachableSince && openUnreachable)
		resolve.push({
			alertId: openUnreachable.alertId,
			code: "signer_unreachable",
			resolvedAt: at,
			note: "Signer antwortet wieder",
		});
	return { raise, resolve };
}
