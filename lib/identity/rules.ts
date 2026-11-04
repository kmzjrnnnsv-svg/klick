// Identität anbinden (Teil D): Regeln für Ausnahmen, die vier Prüfungen
// und wann daraus ein Wirksamkeitstest bzw. eine Abweichung wird. Rein,
// ohne Server-Importe; die Zeit kommt immer als Eingabe.

import type { IdentityPolicy } from "@/lib/identity/policy";
import {
	type CheckOutcome,
	type CheckReason,
	type CheckResult,
	EXCEPTION_KINDS,
	type ExceptionKind,
	IDENTITY_CHECKS,
	type IdentityCheckKey,
	type ProviderAccount,
	type ProviderCapabilities,
} from "@/lib/identity/types";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ── Datum (ISO-Tag, UTC) ────────────────────────────────────────────────

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
	// Tag 0 des Folgemonats = letzter Tag dieses Monats
	const date = new Date(0);
	date.setUTCFullYear(year, month, 0);
	return date.getUTCDate();
}

function parseIsoDay(iso: string): { y: number; m: number; d: number } | null {
	const match = ISO_DAY.exec(iso);
	if (!match) return null;
	const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
	return { y, m, d };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// Monate addieren; der Tag rückt auf das Monatsende, wenn es ihn nicht gibt
// (31.08. + 6 Monate = 28.02.)
export function addMonthsIso(iso: string, months: number): string | null {
	const p = parseIsoDay(iso);
	if (!p) return null;
	const total = p.y * 12 + (p.m - 1) + months;
	const y = Math.floor(total / 12);
	const m = total - y * 12 + 1;
	const d = Math.min(p.d, daysInMonth(y, m));
	return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

// ── Ausnahmen ───────────────────────────────────────────────────────────

export const EXCEPTION_MAX_MONTHS = 12;
// Admin-Konten ohne MFA o. Ä. sind riskanter: kürzer befristet
export const EXCEPTION_ADMIN_MAX_MONTHS = 6;
export const EXCEPTION_REASON_MIN = 10;

export type ExceptionError =
	| "own_account"
	| "kind_invalid"
	| "reason_short"
	| "expiry_past"
	| "expiry_too_long";

export function exceptionError(input: {
	kind: string;
	reason: string;
	// ISO-Tag YYYY-MM-DD
	expiresAt: string;
	isAdmin: boolean;
	ownAccount: boolean;
	today: string;
}): ExceptionError | null {
	// niemand nimmt das eigene Konto von der Prüfung aus
	if (input.ownAccount) return "own_account";
	if (!(EXCEPTION_KINDS as readonly string[]).includes(input.kind)) {
		return "kind_invalid";
	}
	if (input.reason.trim().length < EXCEPTION_REASON_MIN) return "reason_short";
	const months = input.isAdmin
		? EXCEPTION_ADMIN_MAX_MONTHS
		: EXCEPTION_MAX_MONTHS;
	const latest = addMonthsIso(input.today, months);
	// kein gültiger Tag zählt wie abgelaufen: lieber ablehnen als offen lassen
	if (
		latest === null ||
		parseIsoDay(input.expiresAt) === null ||
		input.expiresAt <= input.today
	) {
		return "expiry_past";
	}
	if (input.expiresAt > latest) return "expiry_too_long";
	return null;
}

// Gilt noch: nicht widerrufen und Ablauf heute oder später; bei mehreren die
// mit dem spätesten Ablauf
export function activeException<
	T extends { expiresAt: string; revokedAt: string | null },
>(list: readonly T[], today: string): T | null {
	let best: T | null = null;
	for (const entry of list) {
		if (entry.revokedAt !== null) continue;
		if (entry.expiresAt.slice(0, 10) < today) continue;
		if (best === null || entry.expiresAt > best.expiresAt) best = entry;
	}
	return best;
}

// ── Prüfungen ───────────────────────────────────────────────────────────

export type CheckAccount = ProviderAccount & {
	// Kennung der Zeile in identity_accounts
	id: string;
	matchedUserId: string | null;
	// in Klick als „ausgeschieden“ markiert (ISO)
	markedLeftAt: string | null;
	// schon auf die gültige Ausnahme gefiltert
	exception: { kind: ExceptionKind; expiresAt: string } | null;
};

export type CheckInput = {
	now: Date;
	// null = keine Quelle verbunden oder nie abgeglichen
	syncedAt: Date | null;
	capabilities: ProviderCapabilities;
	accounts: readonly CheckAccount[];
	policy: IdentityPolicy;
	// aus der Klick-Org entfernte Personen, Zeitpunkt der Entfernung (ISO)
	removedUsers: ReadonlyMap<string, string>;
	// Konten mit Entscheidung „entziehen“ in einer Rezertifizierung (ISO)
	revokedAccounts: ReadonlyMap<string, string>;
	// zuletzt abgeschlossene Rezertifizierung (jede Quelle), ISO oder null
	lastReviewClosedAt: string | null;
};

export const AFFECTED_MAX = 50;

function timeOf(iso: string | null | undefined): number | null {
	if (iso == null) return null;
	const t = Date.parse(iso);
	return Number.isNaN(t) ? null : t;
}

function olderThan(iso: string | null, now: number, ms: number): boolean {
	const t = timeOf(iso);
	return t !== null && now - t > ms;
}

// höchste Rolle ohne Adminrolle wäre ein Fehler des Anbieters: trotzdem Admin
const adminOf = (a: CheckAccount) => a.isAdmin || a.isTopAdmin;

function byName(a: CheckAccount, b: CheckAccount): number {
	const ka = (a.email ?? a.displayName).toLowerCase();
	const kb = (b.email ?? b.displayName).toLowerCase();
	if (ka !== kb) return ka < kb ? -1 : 1;
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

// Gruppen in Reihenfolge, in der Gruppe nach Name; jede Kennung einmal
function affectedIds(...groups: (readonly CheckAccount[])[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const group of groups) {
		for (const account of [...group].sort(byName)) {
			if (seen.has(account.id)) continue;
			seen.add(account.id);
			out.push(account.id);
			if (out.length === AFFECTED_MAX) return out;
		}
	}
	return out;
}

function checkResult(
	key: IdentityCheckKey,
	result: CheckOutcome,
	reasons: CheckReason[],
	affected: string[] = [],
): CheckResult {
	return { key, controlCode: IDENTITY_CHECKS[key], result, reasons, affected };
}

function withExceptions(
	reasons: CheckReason[],
	excepted: number,
): CheckReason[] {
	return excepted > 0
		? [...reasons, { code: "exceptions", count: excepted }]
		: reasons;
}

// Ohne frischen Abgleich sagt der alte Stand nichts über heute
function sourceGate(input: CheckInput): CheckReason | null {
	if (input.syncedAt === null) return { code: "no_source" };
	const age = input.now.getTime() - input.syncedAt.getTime();
	if (age > input.policy.staleHours * HOUR_MS) return { code: "stale" };
	return null;
}

function signInState(
	a: CheckAccount,
	now: number,
	policy: IdentityPolicy,
): "inactive" | "never_signed_in" | null {
	if (a.lastSignInAt !== null) {
		return olderThan(a.lastSignInAt, now, policy.inactiveDays * DAY_MS)
			? "inactive"
			: null;
	}
	// ohne Anlagedatum lässt sich „nie angemeldet“ nicht von „neu“ trennen
	return olderThan(a.createdAt, now, policy.neverSignedInDays * DAY_MS)
		? "never_signed_in"
		: null;
}

function mfaCheck(input: CheckInput, gate: CheckReason | null): CheckResult {
	if (gate) return checkResult("mfa", "not_assessable", [gate]);
	if (!input.capabilities.mfa) {
		return checkResult("mfa", "not_assessable", [{ code: "mfa_unknown" }]);
	}
	// Gäste zählen nicht in die Quote, Gast-Admins aber für „Admin ohne MFA“
	const scope = input.accounts.filter(
		(a) => a.enabled && (a.kind === "member" || adminOf(a)),
	);
	const counted = scope.filter((a) => a.exception === null);
	const excepted = scope.length - counted.length;
	const population = counted.filter(
		(a) => a.kind === "member" && a.mfaRegistered !== null,
	);
	const adminsWithout = counted.filter(
		(a) => adminOf(a) && a.mfaRegistered === false,
	);
	const othersWithout = counted.filter(
		(a) => !adminOf(a) && a.mfaRegistered === false,
	);
	const affected = affectedIds(adminsWithout, othersWithout);
	const adminReason: CheckReason[] =
		adminsWithout.length > 0
			? [{ code: "admin_without_mfa", count: adminsWithout.length }]
			: [];

	if (population.length === 0) {
		// ein Admin ohne MFA ist ein Befund, auch wenn keine Quote entsteht
		if (adminReason.length > 0) {
			return checkResult(
				"mfa",
				"fail",
				withExceptions(adminReason, excepted),
				affected,
			);
		}
		return checkResult(
			"mfa",
			"not_assessable",
			withExceptions([{ code: "no_accounts" }], excepted),
		);
	}

	const registered = population.filter((a) => a.mfaRegistered).length;
	// abgerundet: 100 nur, wenn wirklich alle registriert sind
	const rate = Math.floor((100 * registered) / population.length);
	const failBelow = input.policy.mfaFailBelow;
	const rateReason: CheckReason[] =
		rate < 100
			? [
					{
						code: "mfa_rate",
						value: rate,
						limit: rate < failBelow ? failBelow : 100,
					},
				]
			: [];

	if (adminReason.length > 0 || rate < failBelow) {
		return checkResult(
			"mfa",
			"fail",
			withExceptions([...adminReason, ...rateReason], excepted),
			affected,
		);
	}
	if (rate < 100) {
		return checkResult(
			"mfa",
			"partial",
			withExceptions(rateReason, excepted),
			affected,
		);
	}
	return checkResult(
		"mfa",
		"pass",
		withExceptions([{ code: "mfa_all", count: population.length }], excepted),
	);
}

function privilegedCheck(
	input: CheckInput,
	gate: CheckReason | null,
): CheckResult {
	if (gate) return checkResult("privileged", "not_assessable", [gate]);
	const { capabilities, policy } = input;
	if (!capabilities.roles) {
		return checkResult("privileged", "not_assessable", [
			{ code: "roles_unknown" },
		]);
	}
	const scope = input.accounts.filter((a) => a.enabled && adminOf(a));
	const admins = scope.filter((a) => a.exception === null);
	const excepted = scope.length - admins.length;
	// keine Admins sichtbar ist kein Befund (z. B. nur Gruppen-Rollen)
	if (admins.length === 0) {
		return checkResult(
			"privileged",
			"pass",
			withExceptions([{ code: "no_admins" }], excepted),
		);
	}

	const now = input.now.getTime();
	const guests = admins.filter((a) => a.kind === "guest");
	const withoutMfa = capabilities.mfa
		? admins.filter((a) => a.mfaRegistered === false)
		: [];
	const top = admins.filter((a) => a.isTopAdmin);
	const tooManyTop = top.length > policy.maxTopAdmins;
	const inactive = capabilities.signIn
		? admins.filter((a) => signInState(a, now, policy) !== null)
		: [];

	const fails: CheckReason[] = [];
	if (guests.length > 0)
		fails.push({ code: "guest_admin", count: guests.length });
	if (withoutMfa.length > 0) {
		fails.push({ code: "admin_without_mfa", count: withoutMfa.length });
	}
	const partials: CheckReason[] = [];
	if (tooManyTop) {
		partials.push({
			code: "top_admins",
			value: top.length,
			limit: policy.maxTopAdmins,
		});
	}
	if (inactive.length > 0) {
		partials.push({ code: "admin_inactive", count: inactive.length });
	}

	const result: CheckOutcome =
		fails.length > 0 ? "fail" : partials.length > 0 ? "partial" : "pass";
	const reasons: CheckReason[] =
		result === "pass"
			? [{ code: "admins_ok", count: admins.length }]
			: [...fails, ...partials];
	return checkResult(
		"privileged",
		result,
		withExceptions(reasons, excepted),
		affectedIds(guests, withoutMfa, inactive, tooManyTop ? top : []),
	);
}

// Frühester Hinweis auf ein Ausscheiden; Zeitpunkte in der Zukunft zählen
// noch nicht (geplanter Austritt)
function leaverSince(a: CheckAccount, input: CheckInput): number | null {
	const now = input.now.getTime();
	const candidates = [
		timeOf(a.markedLeftAt),
		a.matchedUserId === null
			? null
			: timeOf(input.removedUsers.get(a.matchedUserId)),
		timeOf(input.revokedAccounts.get(a.id)),
		input.capabilities.leaveDate ? timeOf(a.leaveAt) : null,
	];
	let earliest: number | null = null;
	for (const t of candidates) {
		if (t === null || t > now) continue;
		if (earliest === null || t < earliest) earliest = t;
	}
	return earliest;
}

function leaversCheck(
	input: CheckInput,
	gate: CheckReason | null,
): CheckResult {
	if (gate) return checkResult("leavers", "not_assessable", [gate]);
	const { capabilities, policy } = input;
	const now = input.now.getTime();
	const scope = input.accounts.filter((a) => a.enabled);
	const counted = scope.filter((a) => a.exception === null);
	const excepted = scope.length - counted.length;
	const grace = policy.leaverGraceDays * DAY_MS;

	const leavers: CheckAccount[] = [];
	const inactive: CheckAccount[] = [];
	const never: CheckAccount[] = [];
	for (const a of counted) {
		const since = leaverSince(a, input);
		// wer ausscheidet, gehört in den Austritt, nicht zu „inaktiv“
		if (since !== null) {
			if (now - since > grace) leavers.push(a);
			continue;
		}
		if (!capabilities.signIn || a.kind !== "member") continue;
		const state = signInState(a, now, policy);
		if (state === "inactive") inactive.push(a);
		else if (state === "never_signed_in") never.push(a);
	}

	const findings: CheckReason[] = [];
	if (leavers.length > 0) {
		findings.push({ code: "leaver_active", count: leavers.length });
	}
	if (inactive.length > 0) {
		findings.push({ code: "inactive", count: inactive.length });
	}
	if (never.length > 0) {
		findings.push({ code: "never_signed_in", count: never.length });
	}
	const result: CheckOutcome =
		leavers.length > 0 ? "fail" : findings.length > 0 ? "partial" : "pass";
	const reasons: CheckReason[] =
		result === "pass" ? [{ code: "leavers_ok" }] : findings;
	// ohne Anmeldedaten fehlt „inaktiv“, das allein ist kein Befund
	if (!capabilities.signIn) reasons.push({ code: "sign_in_unknown" });
	return checkResult(
		"leavers",
		result,
		withExceptions(reasons, excepted),
		affectedIds(leavers, inactive, never),
	);
}

// Rezertifizierung hängt nicht an der Quelle: abgeschlossen ist abgeschlossen
function recertCheck(input: CheckInput): CheckResult {
	const closed = timeOf(input.lastReviewClosedAt);
	if (closed === null) {
		return checkResult("recert", "fail", [{ code: "no_review" }]);
	}
	const { recertPassDays, recertFailDays } = input.policy;
	const days = Math.max(0, Math.floor((input.now.getTime() - closed) / DAY_MS));
	if (days > recertFailDays) {
		return checkResult("recert", "fail", [
			{ code: "review_age", value: days, limit: recertFailDays },
		]);
	}
	const result: CheckOutcome = days > recertPassDays ? "partial" : "pass";
	return checkResult("recert", result, [
		{ code: "review_age", value: days, limit: recertPassDays },
	]);
}

// Immer vier Ergebnisse in fester Reihenfolge: mfa, privileged, leavers, recert
export function runIdentityChecks(input: CheckInput): CheckResult[] {
	const gate = sourceGate(input);
	return [
		mfaCheck(input, gate),
		privilegedCheck(input, gate),
		leaversCheck(input, gate),
		recertCheck(input),
	];
}

// ── Folgen: Wirksamkeitstest und Abweichung ─────────────────────────────

// gleiches Ergebnis wird höchstens alle 30 Tage erneut eingetragen
export const TEST_REPEAT_DAYS = 30;
// Abweichung erst nach einer Woche: Zeit, die Ersteinrichtung aufzuräumen
export const NONCONFORMITY_AFTER_DAYS = 7;

export function testDue(input: {
	result: CheckOutcome;
	lastTestResult: CheckOutcome | null;
	lastTestAt: Date | null;
	now: Date;
}): boolean {
	// „nicht bewertbar“ ist kein Testergebnis
	if (input.result === "not_assessable") return false;
	if (input.lastTestAt === null) return true;
	if (input.result !== input.lastTestResult) return true;
	const age = input.now.getTime() - input.lastTestAt.getTime();
	return age >= TEST_REPEAT_DAYS * DAY_MS;
}

export function nonconformityDue(input: {
	result: CheckOutcome;
	connectedAt: Date;
	now: Date;
	openNonconformity: boolean;
}): boolean {
	if (input.result !== "fail" || input.openNonconformity) return false;
	const age = input.now.getTime() - input.connectedAt.getTime();
	return age >= NONCONFORMITY_AFTER_DAYS * DAY_MS;
}
