import { describe, expect, it } from "vitest";
import {
	DEFAULT_IDENTITY_POLICY,
	type IdentityPolicy,
} from "@/lib/identity/policy";
import {
	AFFECTED_MAX,
	activeException,
	addMonthsIso,
	type CheckAccount,
	type CheckInput,
	exceptionError,
	nonconformityDue,
	runIdentityChecks,
	testDue,
} from "@/lib/identity/rules";
import type {
	CheckResult,
	IdentityCheckKey,
	ProviderCapabilities,
} from "@/lib/identity/types";

// Teil D: Ausnahmen, die vier Prüfungen (MFA, Admins, Austritte,
// Rezertifizierung) und wann Test bzw. Abweichung entstehen. Rein.

const NOW = new Date("2026-11-04T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const daysAgo = (n: number) => ago(n * DAY).toISOString();
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

const ALL: ProviderCapabilities = {
	signIn: true,
	mfa: true,
	roles: true,
	leaveDate: true,
};

const account = (
	id: string,
	over: Partial<CheckAccount> = {},
): CheckAccount => ({
	externalId: `ext-${id}`,
	email: `${id}@firma.de`,
	displayName: id,
	kind: "member",
	enabled: true,
	isAdmin: false,
	isTopAdmin: false,
	adminRoles: [],
	mfaRegistered: true,
	lastSignInAt: daysAgo(1),
	createdAt: daysAgo(400),
	leaveAt: null,
	id,
	matchedUserId: null,
	markedLeftAt: null,
	exception: null,
	...over,
});

const admin = (id: string, over: Partial<CheckAccount> = {}) =>
	account(id, { isAdmin: true, adminRoles: ["User Administrator"], ...over });
const topAdmin = (id: string, over: Partial<CheckAccount> = {}) =>
	admin(id, {
		isTopAdmin: true,
		adminRoles: ["Global Administrator"],
		...over,
	});

const EXCEPTION = { kind: "emergency" as const, expiresAt: "2027-01-01" };

const input = (over: Partial<CheckInput> = {}): CheckInput => ({
	now: NOW,
	syncedAt: ago(2 * HOUR),
	capabilities: ALL,
	accounts: [],
	policy: DEFAULT_IDENTITY_POLICY,
	removedUsers: new Map(),
	revokedAccounts: new Map(),
	lastReviewClosedAt: daysAgo(10),
	...over,
});

function check(key: IdentityCheckKey, over: Partial<CheckInput> = {}) {
	const found = runIdentityChecks(input(over)).find((r) => r.key === key);
	if (!found) throw new Error(`Prüfung ${key} fehlt`);
	return found;
}

const codes = (r: CheckResult) => r.reasons.map((x) => x.code);
const reason = (r: CheckResult, code: string) =>
	r.reasons.find((x) => x.code === code);

const members = (n: number, prefix: string, over: Partial<CheckAccount> = {}) =>
	Array.from({ length: n }, (_, i) =>
		account(`${prefix}${String(i).padStart(3, "0")}`, over),
	);

describe("runIdentityChecks", () => {
	it("liefert immer vier Ergebnisse in fester Reihenfolge mit Control", () => {
		const out = runIdentityChecks(input());
		expect(out.map((r) => [r.key, r.controlCode])).toEqual([
			["mfa", "CC-IAM-03"],
			["privileged", "CC-IAM-04"],
			["leavers", "CC-IAM-02"],
			["recert", "CC-IAM-05"],
		]);
	});

	it("ist ohne Quelle nicht bewertbar, außer der Rezertifizierung", () => {
		const out = runIdentityChecks(
			input({
				syncedAt: null,
				accounts: [admin("a", { mfaRegistered: false })],
			}),
		);
		for (const r of out.slice(0, 3)) {
			expect(r.result).toBe("not_assessable");
			expect(r.reasons).toEqual([{ code: "no_source" }]);
			expect(r.affected).toEqual([]);
		}
		expect(out[3]?.result).toBe("pass");
	});

	it("ist mit altem Abgleich nicht bewertbar", () => {
		const stale = runIdentityChecks(input({ syncedAt: ago(72 * HOUR + 1) }));
		for (const r of stale.slice(0, 3)) {
			expect(r.result).toBe("not_assessable");
			expect(r.reasons).toEqual([{ code: "stale" }]);
		}
		expect(stale[3]?.result).toBe("pass");
		// genau 72 Stunden gelten noch
		const fresh = runIdentityChecks(
			input({ syncedAt: ago(72 * HOUR), accounts: [account("a")] }),
		);
		expect(fresh[0]?.result).toBe("pass");
	});

	it("begrenzt betroffene Konten auf 50, jedes einmal", () => {
		const r = check("mfa", {
			accounts: members(60, "m", { mfaRegistered: false }),
		});
		expect(r.affected).toHaveLength(AFFECTED_MAX);
		expect(new Set(r.affected).size).toBe(AFFECTED_MAX);
		expect(r.affected[0]).toBe("m000");
	});
});

describe("Prüfung MFA (CC-IAM-03)", () => {
	it("ist ohne MFA-Daten des Anbieters nicht bewertbar", () => {
		const r = check("mfa", {
			capabilities: { ...ALL, mfa: false },
			accounts: [account("a")],
		});
		expect(r.result).toBe("not_assessable");
		expect(r.reasons).toEqual([{ code: "mfa_unknown" }]);
	});

	it("ist ohne Mitglieder nicht bewertbar", () => {
		const r = check("mfa", {
			accounts: [
				account("g", { kind: "guest", mfaRegistered: false }),
				account("d", { enabled: false }),
				account("u", { mfaRegistered: null }),
			],
		});
		expect(r.result).toBe("not_assessable");
		expect(r.reasons).toEqual([{ code: "no_accounts" }]);
	});

	it("nennt Ausnahmen auch, wenn deshalb niemand übrig bleibt", () => {
		const r = check("mfa", {
			accounts: [account("a", { mfaRegistered: false, exception: EXCEPTION })],
		});
		expect(r.result).toBe("not_assessable");
		expect(r.reasons).toEqual([
			{ code: "no_accounts" },
			{ code: "exceptions", count: 1 },
		]);
	});

	it("besteht, wenn alle Mitglieder MFA haben", () => {
		const r = check("mfa", { accounts: members(3, "m") });
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([{ code: "mfa_all", count: 3 }]);
		expect(r.affected).toEqual([]);
	});

	it("ist teilweise erfüllt ab der Schwelle bis unter 100 %", () => {
		const r = check("mfa", {
			accounts: [...members(19, "m"), account("z", { mfaRegistered: false })],
		});
		expect(r.result).toBe("partial");
		expect(r.reasons).toEqual([{ code: "mfa_rate", value: 95, limit: 100 }]);
		expect(r.affected).toEqual(["z"]);
	});

	it("rundet ab, damit 100 % nur bei allen gilt", () => {
		const r = check("mfa", {
			accounts: [...members(199, "m"), account("z", { mfaRegistered: false })],
		});
		expect(r.result).toBe("partial");
		expect(reason(r, "mfa_rate")).toEqual({
			code: "mfa_rate",
			value: 99,
			limit: 100,
		});
	});

	it("fällt durch unter der Schwelle", () => {
		const r = check("mfa", {
			accounts: [
				...members(18, "m"),
				...members(2, "x", { mfaRegistered: false }),
			],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "mfa_rate", value: 90, limit: 95 }]);
	});

	it("nimmt die Schwelle aus der Richtlinie", () => {
		const policy: IdentityPolicy = {
			...DEFAULT_IDENTITY_POLICY,
			mfaFailBelow: 80,
		};
		const r = check("mfa", {
			policy,
			accounts: [
				...members(18, "m"),
				...members(2, "x", { mfaRegistered: false }),
			],
		});
		expect(r.result).toBe("partial");
	});

	it("fällt durch bei einem Admin ohne MFA trotz hoher Quote", () => {
		const r = check("mfa", {
			accounts: [...members(40, "m"), admin("adm", { mfaRegistered: false })],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([
			{ code: "admin_without_mfa", count: 1 },
			{ code: "mfa_rate", value: 97, limit: 100 },
		]);
	});

	it("fällt durch bei einem Gast-Admin ohne MFA, auch ohne Mitglieder", () => {
		const r = check("mfa", {
			accounts: [admin("gast", { kind: "guest", mfaRegistered: false })],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "admin_without_mfa", count: 1 }]);
		expect(r.affected).toEqual(["gast"]);
	});

	it("zählt Gäste, abgeschaltete und unbekannte Konten nicht in die Quote", () => {
		const r = check("mfa", {
			accounts: [
				...members(2, "m"),
				account("g", { kind: "guest", mfaRegistered: false }),
				account("d", { enabled: false, mfaRegistered: false }),
				account("u", { mfaRegistered: null }),
			],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([{ code: "mfa_all", count: 2 }]);
	});

	it("nimmt Konten mit Ausnahme heraus und zählt sie", () => {
		const r = check("mfa", {
			accounts: [
				...members(2, "m"),
				account("not", { mfaRegistered: false, exception: EXCEPTION }),
				admin("svc", {
					mfaRegistered: false,
					exception: { kind: "service", expiresAt: "2027-01-01" },
				}),
			],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([
			{ code: "mfa_all", count: 2 },
			{ code: "exceptions", count: 2 },
		]);
	});

	it("nennt Admins zuerst, sonst nach Name", () => {
		const r = check("mfa", {
			accounts: [
				...members(10, "m"),
				account("zora", { mfaRegistered: false }),
				account("bert", { mfaRegistered: false }),
				admin("yvo", { mfaRegistered: false }),
				admin("adam", { mfaRegistered: false }),
			],
		});
		expect(r.affected).toEqual(["adam", "yvo", "bert", "zora"]);
	});
});

describe("Prüfung Admins (CC-IAM-04)", () => {
	it("ist ohne Rollen-Daten nicht bewertbar", () => {
		const r = check("privileged", {
			capabilities: { ...ALL, roles: false },
			accounts: [admin("a")],
		});
		expect(r.result).toBe("not_assessable");
		expect(r.reasons).toEqual([{ code: "roles_unknown" }]);
	});

	it("besteht ohne Admins", () => {
		const r = check("privileged", {
			accounts: [account("a"), admin("off", { enabled: false })],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([{ code: "no_admins" }]);
	});

	it("besteht mit gesunden Admins", () => {
		const r = check("privileged", {
			accounts: [topAdmin("t"), admin("a"), account("m")],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([{ code: "admins_ok", count: 2 }]);
		expect(r.affected).toEqual([]);
	});

	it("fällt durch bei einem Gast als Admin", () => {
		const r = check("privileged", {
			accounts: [admin("a"), admin("gast", { kind: "guest" })],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "guest_admin", count: 1 }]);
		expect(r.affected).toEqual(["gast"]);
	});

	it("fällt durch bei einem Admin ohne MFA, nur mit MFA-Daten", () => {
		const accounts = [admin("a", { mfaRegistered: false })];
		const r = check("privileged", { accounts });
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "admin_without_mfa", count: 1 }]);
		const blind = check("privileged", {
			accounts,
			capabilities: { ...ALL, mfa: false },
		});
		expect(blind.result).toBe("pass");
		// unbekannte MFA ist kein Befund
		const unknown = check("privileged", {
			accounts: [admin("a", { mfaRegistered: null })],
		});
		expect(unknown.result).toBe("pass");
	});

	it("ist teilweise erfüllt bei zu vielen höchsten Admins", () => {
		const five = ["t1", "t2", "t3", "t4", "t5"].map((id) => topAdmin(id));
		const r = check("privileged", { accounts: five });
		expect(r.result).toBe("partial");
		expect(r.reasons).toEqual([{ code: "top_admins", value: 5, limit: 4 }]);
		expect(r.affected).toEqual(["t1", "t2", "t3", "t4", "t5"]);
		expect(check("privileged", { accounts: five.slice(0, 4) }).result).toBe(
			"pass",
		);
	});

	it("zählt höchste Admins mit Ausnahme nicht mit", () => {
		const accounts = [
			...["t1", "t2", "t3", "t4"].map((id) => topAdmin(id)),
			topAdmin("notfall", { exception: EXCEPTION }),
		];
		const r = check("privileged", { accounts });
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([
			{ code: "admins_ok", count: 4 },
			{ code: "exceptions", count: 1 },
		]);
	});

	it("nimmt Admins mit Ausnahme ganz heraus", () => {
		const r = check("privileged", {
			accounts: [admin("gast", { kind: "guest", exception: EXCEPTION })],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([
			{ code: "no_admins" },
			{ code: "exceptions", count: 1 },
		]);
	});

	it("ist teilweise erfüllt bei inaktiven Admins", () => {
		const r = check("privileged", {
			accounts: [
				admin("alt", { lastSignInAt: daysAgo(91) }),
				admin("nie", { lastSignInAt: null, createdAt: daysAgo(31) }),
				admin("neu", { lastSignInAt: null, createdAt: daysAgo(10) }),
				admin("ohne", { lastSignInAt: null, createdAt: null }),
				admin("grenze", { lastSignInAt: daysAgo(90) }),
			],
		});
		expect(r.result).toBe("partial");
		expect(r.reasons).toEqual([{ code: "admin_inactive", count: 2 }]);
		expect(r.affected).toEqual(["alt", "nie"]);
	});

	it("prüft Inaktivität nur mit Anmeldedaten", () => {
		const r = check("privileged", {
			capabilities: { ...ALL, signIn: false },
			accounts: [admin("alt", { lastSignInAt: daysAgo(200) })],
		});
		expect(r.result).toBe("pass");
	});

	it("nennt Befunde und Hinweise zusammen, Befunde zuerst", () => {
		const r = check("privileged", {
			accounts: [
				...["t1", "t2", "t3", "t4", "t5"].map((id) => topAdmin(id)),
				admin("alt", { lastSignInAt: daysAgo(200) }),
				admin("gast", { kind: "guest", mfaRegistered: false }),
			],
		});
		expect(r.result).toBe("fail");
		expect(codes(r)).toEqual([
			"guest_admin",
			"admin_without_mfa",
			"top_admins",
			"admin_inactive",
		]);
		expect(r.affected).toEqual(["gast", "alt", "t1", "t2", "t3", "t4", "t5"]);
	});

	it("zählt höchste Rolle ohne Admin-Kennzeichen trotzdem als Admin", () => {
		const r = check("privileged", {
			accounts: [account("t", { isTopAdmin: true, kind: "guest" })],
		});
		expect(r.result).toBe("fail");
		expect(codes(r)).toEqual(["guest_admin"]);
	});
});

describe("Prüfung Austritte (CC-IAM-02)", () => {
	it("besteht ohne Austritte und Inaktive", () => {
		const r = check("leavers", { accounts: members(3, "m") });
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([{ code: "leavers_ok" }]);
	});

	it("fällt durch, wenn ein markiertes Konto nach der Frist noch aktiv ist", () => {
		const r = check("leavers", {
			accounts: [
				account("weg", { markedLeftAt: daysAgo(4) }),
				account("bald", { markedLeftAt: daysAgo(2) }),
				account("aus", { markedLeftAt: daysAgo(30), enabled: false }),
			],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "leaver_active", count: 1 }]);
		expect(r.affected).toEqual(["weg"]);
	});

	it("lässt innerhalb der Frist Zeit zum Abschalten", () => {
		const r = check("leavers", {
			accounts: [account("bald", { markedLeftAt: daysAgo(3) })],
		});
		expect(r.result).toBe("pass");
		const strict = check("leavers", {
			policy: { ...DEFAULT_IDENTITY_POLICY, leaverGraceDays: 0 },
			accounts: [account("bald", { markedLeftAt: ago(HOUR).toISOString() })],
		});
		expect(strict.result).toBe("fail");
	});

	it("erkennt aus Klick entfernte Personen über die Zuordnung", () => {
		const r = check("leavers", {
			accounts: [account("a", { matchedUserId: "u-1" }), account("b")],
			removedUsers: new Map([["u-1", daysAgo(5)]]),
		});
		expect(r.result).toBe("fail");
		expect(r.affected).toEqual(["a"]);
	});

	it("erkennt Konten mit „entziehen“ aus der Rezertifizierung", () => {
		const r = check("leavers", {
			accounts: [account("a"), account("b")],
			revokedAccounts: new Map([["b", daysAgo(10)]]),
		});
		expect(r.result).toBe("fail");
		expect(r.affected).toEqual(["b"]);
	});

	it("nutzt das Austrittsdatum nur, wenn der Anbieter es liefert und es vorbei ist", () => {
		const accounts = [
			account("vorbei", { leaveAt: daysAgo(5) }),
			account("kommt", { leaveAt: inDays(5) }),
		];
		const r = check("leavers", { accounts });
		expect(r.result).toBe("fail");
		expect(r.affected).toEqual(["vorbei"]);
		const blind = check("leavers", {
			accounts,
			capabilities: { ...ALL, leaveDate: false },
		});
		expect(blind.result).toBe("pass");
	});

	it("rechnet ab dem frühesten Hinweis", () => {
		const r = check("leavers", {
			accounts: [
				account("a", { markedLeftAt: daysAgo(1), matchedUserId: "u-1" }),
			],
			removedUsers: new Map([["u-1", daysAgo(5)]]),
		});
		expect(r.result).toBe("fail");
	});

	it("nimmt Konten mit Ausnahme heraus", () => {
		const r = check("leavers", {
			accounts: [
				account("a", { markedLeftAt: daysAgo(10), exception: EXCEPTION }),
			],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([
			{ code: "leavers_ok" },
			{ code: "exceptions", count: 1 },
		]);
	});

	it("ist teilweise erfüllt bei inaktiven und nie angemeldeten Mitgliedern", () => {
		const r = check("leavers", {
			accounts: [
				account("alt", { lastSignInAt: daysAgo(91) }),
				account("nie", { lastSignInAt: null, createdAt: daysAgo(31) }),
				account("neu", { lastSignInAt: null, createdAt: daysAgo(29) }),
				account("gast", { kind: "guest", lastSignInAt: daysAgo(300) }),
			],
		});
		expect(r.result).toBe("partial");
		expect(r.reasons).toEqual([
			{ code: "inactive", count: 1 },
			{ code: "never_signed_in", count: 1 },
		]);
		expect(r.affected).toEqual(["alt", "nie"]);
	});

	it("zählt ein ausgeschiedenes Konto nicht zusätzlich als inaktiv", () => {
		const r = check("leavers", {
			accounts: [
				account("weg", {
					markedLeftAt: daysAgo(10),
					lastSignInAt: daysAgo(200),
				}),
				account("alt", { lastSignInAt: daysAgo(200) }),
			],
		});
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([
			{ code: "leaver_active", count: 1 },
			{ code: "inactive", count: 1 },
		]);
		expect(r.affected).toEqual(["weg", "alt"]);
	});

	it("meldet fehlende Anmeldedaten ohne Befund", () => {
		const r = check("leavers", {
			capabilities: { ...ALL, signIn: false },
			accounts: [account("alt", { lastSignInAt: daysAgo(300) })],
		});
		expect(r.result).toBe("pass");
		expect(r.reasons).toEqual([
			{ code: "leavers_ok" },
			{ code: "sign_in_unknown" },
		]);
	});

	it("prüft Austritte auch ohne Anmeldedaten", () => {
		const r = check("leavers", {
			capabilities: { ...ALL, signIn: false },
			accounts: [account("weg", { markedLeftAt: daysAgo(10) })],
		});
		expect(r.result).toBe("fail");
		expect(codes(r)).toEqual(["leaver_active", "sign_in_unknown"]);
	});
});

describe("Prüfung Rezertifizierung (CC-IAM-05)", () => {
	it("fällt durch ohne abgeschlossene Rezertifizierung", () => {
		const r = check("recert", { lastReviewClosedAt: null });
		expect(r.result).toBe("fail");
		expect(r.reasons).toEqual([{ code: "no_review" }]);
	});

	it.each([
		[10, "pass", 90],
		[90, "pass", 90],
		[91, "partial", 90],
		[120, "partial", 90],
		[121, "fail", 120],
	] as const)("nach %i Tagen: %s", (days, result, limit) => {
		const r = check("recert", { lastReviewClosedAt: daysAgo(days) });
		expect(r.result).toBe(result);
		expect(r.reasons).toEqual([{ code: "review_age", value: days, limit }]);
		expect(r.affected).toEqual([]);
	});

	it("hängt nicht an der Quelle", () => {
		const r = check("recert", {
			syncedAt: null,
			lastReviewClosedAt: daysAgo(5),
		});
		expect(r.result).toBe("pass");
	});

	it("nimmt die Fristen aus der Richtlinie", () => {
		const policy = {
			...DEFAULT_IDENTITY_POLICY,
			recertPassDays: 180,
			recertFailDays: 365,
		};
		expect(
			check("recert", { policy, lastReviewClosedAt: daysAgo(150) }).result,
		).toBe("pass");
		expect(
			check("recert", { policy, lastReviewClosedAt: daysAgo(200) }).result,
		).toBe("partial");
	});
});

describe("Ausnahmen", () => {
	const ok = {
		kind: "emergency",
		reason: "Notfallkonto im Tresor",
		expiresAt: "2027-05-04",
		isAdmin: false,
		ownAccount: false,
		today: "2026-11-04",
	};

	it("nimmt eine gültige Ausnahme an", () => {
		expect(exceptionError(ok)).toBeNull();
	});

	it("lehnt das eigene Konto zuerst ab", () => {
		expect(exceptionError({ ...ok, ownAccount: true, kind: "x" })).toBe(
			"own_account",
		);
	});

	it("lehnt unbekannte Arten ab", () => {
		expect(exceptionError({ ...ok, kind: "vip" })).toBe("kind_invalid");
		expect(exceptionError({ ...ok, kind: "service" })).toBeNull();
		expect(exceptionError({ ...ok, kind: "other" })).toBeNull();
	});

	it("verlangt eine Begründung mit mindestens 10 Zeichen ohne Leerraum am Rand", () => {
		expect(exceptionError({ ...ok, reason: "   kurz      " })).toBe(
			"reason_short",
		);
		expect(exceptionError({ ...ok, reason: "  123456789  " })).toBe(
			"reason_short",
		);
		expect(exceptionError({ ...ok, reason: "  1234567890  " })).toBeNull();
	});

	it("verlangt einen Ablauf nach heute", () => {
		expect(exceptionError({ ...ok, expiresAt: "2026-11-04" })).toBe(
			"expiry_past",
		);
		expect(exceptionError({ ...ok, expiresAt: "2026-10-01" })).toBe(
			"expiry_past",
		);
		expect(exceptionError({ ...ok, expiresAt: "2026-11-05" })).toBeNull();
	});

	it("lehnt ungültige Tage ab", () => {
		expect(exceptionError({ ...ok, expiresAt: "2027-02-30" })).toBe(
			"expiry_past",
		);
		expect(exceptionError({ ...ok, expiresAt: "2027-13-01" })).toBe(
			"expiry_past",
		);
		expect(exceptionError({ ...ok, expiresAt: "morgen" })).toBe("expiry_past");
		expect(exceptionError({ ...ok, expiresAt: "2027-01-01T00:00:00Z" })).toBe(
			"expiry_past",
		);
	});

	it("begrenzt auf 12 Monate, für Admins auf 6", () => {
		expect(exceptionError({ ...ok, expiresAt: "2027-11-04" })).toBeNull();
		expect(exceptionError({ ...ok, expiresAt: "2027-11-05" })).toBe(
			"expiry_too_long",
		);
		const adm = { ...ok, isAdmin: true };
		expect(exceptionError({ ...adm, expiresAt: "2027-05-04" })).toBeNull();
		expect(exceptionError({ ...adm, expiresAt: "2027-05-05" })).toBe(
			"expiry_too_long",
		);
	});

	it("rückt am Monatsende auf den letzten Tag", () => {
		const adm = { ...ok, isAdmin: true, today: "2026-08-31" };
		expect(exceptionError({ ...adm, expiresAt: "2027-02-28" })).toBeNull();
		expect(exceptionError({ ...adm, expiresAt: "2027-03-01" })).toBe(
			"expiry_too_long",
		);
	});

	it("addiert Monate mit Kürzung auf das Monatsende", () => {
		expect(addMonthsIso("2026-08-31", 6)).toBe("2027-02-28");
		expect(addMonthsIso("2027-08-31", 6)).toBe("2028-02-29");
		expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonthsIso("2026-03-31", 1)).toBe("2026-04-30");
		expect(addMonthsIso("2026-12-15", 1)).toBe("2027-01-15");
		expect(addMonthsIso("2026-11-04", 12)).toBe("2027-11-04");
		expect(addMonthsIso("2026-02-30", 1)).toBeNull();
		expect(addMonthsIso("04.11.2026", 1)).toBeNull();
	});

	describe("activeException", () => {
		const e = (expiresAt: string, revokedAt: string | null = null) => ({
			expiresAt,
			revokedAt,
		});

		it("liefert null ohne gültige Ausnahme", () => {
			expect(activeException([], "2026-11-04")).toBeNull();
			expect(
				activeException(
					[e("2026-11-03"), e("2027-01-01", "2026-10-01T10:00:00Z")],
					"2026-11-04",
				),
			).toBeNull();
		});

		it("zählt den Ablauftag selbst noch mit", () => {
			const today = e("2026-11-04");
			expect(activeException([today], "2026-11-04")).toBe(today);
		});

		it("nimmt die mit dem spätesten Ablauf", () => {
			const early = e("2026-12-01");
			const late = e("2027-03-01");
			const revoked = e("2027-09-01", "2026-11-01T00:00:00Z");
			expect(activeException([early, revoked, late], "2026-11-04")).toBe(late);
		});
	});
});

describe("testDue", () => {
	const base = {
		result: "pass" as const,
		lastTestResult: "pass" as const,
		lastTestAt: ago(5 * DAY),
		now: NOW,
	};

	it("trägt beim ersten Lauf ein", () => {
		expect(testDue({ ...base, lastTestAt: null, lastTestResult: null })).toBe(
			true,
		);
	});

	it("trägt bei geändertem Ergebnis ein", () => {
		expect(testDue({ ...base, result: "fail" })).toBe(true);
		expect(testDue({ ...base, result: "partial" })).toBe(true);
	});

	it("wiederholt gleiches Ergebnis erst nach 30 Tagen", () => {
		expect(testDue(base)).toBe(false);
		expect(testDue({ ...base, lastTestAt: ago(30 * DAY - 1) })).toBe(false);
		expect(testDue({ ...base, lastTestAt: ago(30 * DAY) })).toBe(true);
	});

	it("trägt „nicht bewertbar“ nie ein", () => {
		expect(
			testDue({
				...base,
				result: "not_assessable",
				lastTestAt: null,
				lastTestResult: null,
			}),
		).toBe(false);
		expect(testDue({ ...base, result: "not_assessable" })).toBe(false);
		expect(
			testDue({ ...base, result: "not_assessable", lastTestAt: ago(90 * DAY) }),
		).toBe(false);
	});
});

describe("nonconformityDue", () => {
	const base = {
		result: "fail" as const,
		connectedAt: ago(7 * DAY),
		now: NOW,
		openNonconformity: false,
	};

	it("eröffnet nach einer Woche bei „nicht bestanden“", () => {
		expect(nonconformityDue(base)).toBe(true);
	});

	it("wartet die erste Woche nach dem Verbinden ab", () => {
		expect(nonconformityDue({ ...base, connectedAt: ago(7 * DAY - 1) })).toBe(
			false,
		);
	});

	it("eröffnet keine zweite und nur bei „nicht bestanden“", () => {
		expect(nonconformityDue({ ...base, openNonconformity: true })).toBe(false);
		expect(nonconformityDue({ ...base, result: "partial" })).toBe(false);
		expect(nonconformityDue({ ...base, result: "not_assessable" })).toBe(false);
		expect(nonconformityDue({ ...base, result: "pass" })).toBe(false);
	});
});
