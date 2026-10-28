// Vertrag und Sperre einer Organisation (Admin-Portal, Teil 2), rein und
// getestet (tests/org-account.test.ts). Zahlungsmodell (lib/marketing/
// billing.ts): Software = Jahresgebühr, fällig erst nach dem bestandenen
// Audit, danach jährlich nach dem Folgeaudit; Berater-Zugänge ab Start.
// Daten in platform_org_accounts (lib/db/org-accounts.ts).
import type { OrgAccountStatus } from "@/db/schema/enums";
import type { PlatformOrgAccount } from "@/db/schema/org-accounts";

export type AccountLike = Pick<
	PlatformOrgAccount,
	| "status"
	| "startedAt"
	| "auditPassedAt"
	| "feeInvoicedFor"
	| "cancelledAt"
	| "suspendedAt"
	| "suspendedReason"
>;

/** Ohne Zeile gilt eine Org als aktiv ohne Vertragsdaten (Bestand vor Teil 2). */
export const DEFAULT_ACCOUNT: AccountLike = {
	status: "active",
	startedAt: null,
	auditPassedAt: null,
	feeInvoicedFor: null,
	cancelledAt: null,
	suspendedAt: null,
	suspendedReason: null,
};

export const accountOrDefault = (a: AccountLike | null | undefined) =>
	a ?? DEFAULT_ACCOUNT;

/** Anzeige-Zustand: Sperre geht vor, gekündigt mit Ende in der Vergangenheit = beendet. */
export type AccountState = OrgAccountStatus | "suspended" | "ended";

export function accountState(
	a: AccountLike | null | undefined,
	now: Date,
): AccountState {
	const acc = accountOrDefault(a);
	if (acc.suspendedAt) return "suspended";
	if (
		acc.status === "cancelled" &&
		acc.cancelledAt &&
		acc.cancelledAt.getTime() <= now.getTime()
	)
		return "ended";
	return acc.status;
}

export const isSuspended = (a: AccountLike | null | undefined) =>
	Boolean(a?.suspendedAt);

export type FeeState =
	/** kein bestandenes Audit: Software kostet noch nichts */
	| { kind: "before_audit" }
	/** Audit bestanden, Jahresgebühr noch nicht berechnet */
	| { kind: "due"; since: Date }
	/** berechnet; die nächste wird mit dem Folgeaudit fällig (erwartet ≈ +12 Monate) */
	| { kind: "invoiced"; auditAt: Date; nextAuditExpected: Date }
	/** Probezeit oder Vertrag beendet: keine Gebühr */
	| { kind: "none" };

const sameDay = (a: Date, b: Date) =>
	a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

export function addMonths(d: Date, months: number): Date {
	const out = new Date(d.getTime());
	const day = out.getUTCDate();
	out.setUTCDate(1);
	out.setUTCMonth(out.getUTCMonth() + months);
	const last = new Date(
		Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
	).getUTCDate();
	out.setUTCDate(Math.min(day, last));
	return out;
}

export function feeState(
	a: AccountLike | null | undefined,
	now: Date,
): FeeState {
	const acc = accountOrDefault(a);
	const state = accountState(acc, now);
	if (state === "trial" || state === "ended") return { kind: "none" };
	if (!acc.auditPassedAt) return { kind: "before_audit" };
	if (acc.feeInvoicedFor && sameDay(acc.feeInvoicedFor, acc.auditPassedAt))
		return {
			kind: "invoiced",
			auditAt: acc.auditPassedAt,
			nextAuditExpected: addMonths(acc.auditPassedAt, 12),
		};
	return { kind: "due", since: acc.auditPassedAt };
}

/** Folgeaudit überfällig (mehr als 12 Monate seit dem letzten bestandenen). */
export function followUpOverdue(
	a: AccountLike | null | undefined,
	now: Date,
): boolean {
	const acc = accountOrDefault(a);
	if (!acc.auditPassedAt || accountState(acc, now) === "ended") return false;
	return addMonths(acc.auditPassedAt, 12).getTime() < now.getTime();
}

export const SUSPEND_REASON_MIN = 10;
