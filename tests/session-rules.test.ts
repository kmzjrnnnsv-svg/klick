import { describe, expect, it } from "vitest";
import {
	ABSOLUTE_SESSION_MS,
	AuthError,
	checkSessionRules,
	effectiveMfaVerifiedAt,
	IDLE_SESSION_MS,
	ipFromHeaders,
	isStepUpFresh,
	mfaFactors,
	normalizeRole,
	STEP_UP_MS,
} from "@/lib/auth/session-rules";

const now = Date.parse("2026-10-06T12:00:00Z");
const ok = {
	session: {
		createdAt: new Date(now - 60_000),
		mfaVerifiedAt: new Date(now - 30_000),
		lastActiveAt: new Date(now - 10_000),
	},
	user: { twoFactorEnabled: true, banned: false },
};
const code = (fn: () => void) => {
	try {
		fn();
		return null;
	} catch (e) {
		return e instanceof AuthError ? e.code : "other";
	}
};

describe("checkSessionRules", () => {
	it("lässt eine frische, MFA-verifizierte Sitzung durch", () => {
		expect(code(() => checkSessionRules(ok, now))).toBeNull();
	});
	it("absolute Grenze 12 h", () => {
		const s = {
			...ok,
			session: {
				...ok.session,
				createdAt: new Date(now - ABSOLUTE_SESSION_MS - 1),
				lastActiveAt: new Date(now),
			},
		};
		expect(code(() => checkSessionRules(s, now))).toBe("session_expired");
	});
	it("Idle 30 min", () => {
		const s = {
			...ok,
			session: {
				...ok.session,
				lastActiveAt: new Date(now - IDLE_SESSION_MS - 1),
			},
		};
		expect(code(() => checkSessionRules(s, now))).toBe("session_expired");
	});
	it("ohne lastActiveAt zählt createdAt als letzte Aktivität", () => {
		const s = {
			...ok,
			session: {
				...ok.session,
				lastActiveAt: null,
				createdAt: new Date(now - IDLE_SESSION_MS - 1),
			},
		};
		expect(code(() => checkSessionRules(s, now))).toBe("session_expired");
	});
	it("MFA-Pflicht: Enrolment, dann Verifikation", () => {
		expect(
			code(() =>
				checkSessionRules(
					{
						session: { ...ok.session, mfaVerifiedAt: null },
						user: { twoFactorEnabled: false },
					},
					now,
				),
			),
		).toBe("mfa_enrol");
		// Firmen-MFA (SSO, je Org eingeschaltet): bestätigt ohne eigenen Faktor
		expect(
			code(() =>
				checkSessionRules({ ...ok, user: { twoFactorEnabled: false } }, now),
			),
		).toBeNull();
		expect(
			code(() =>
				checkSessionRules(
					{ ...ok, session: { ...ok.session, mfaVerifiedAt: null } },
					now,
				),
			),
		).toBe("mfa_required");
	});
	it("Passkey (mit Nutzerverifikation) erfüllt die MFA-Pflicht", () => {
		expect(
			code(() =>
				checkSessionRules(
					{ ...ok, user: { twoFactorEnabled: false, hasPasskey: true } },
					now,
				),
			),
		).toBeNull();
		// Faktor vorhanden, aber in dieser Sitzung nicht bestätigt
		expect(
			code(() =>
				checkSessionRules(
					{
						session: { ...ok.session, mfaVerifiedAt: null },
						user: { twoFactorEnabled: false, hasPasskey: true },
					},
					now,
				),
			),
		).toBe("mfa_required");
	});
	it("gesperrte Nutzer:innen sind forbidden", () => {
		expect(
			code(() =>
				checkSessionRules(
					{ ...ok, user: { twoFactorEnabled: true, banned: true } },
					now,
				),
			),
		).toBe("forbidden");
	});
});

describe("effectiveMfaVerifiedAt", () => {
	const at = new Date("2026-10-26T10:00:00Z");
	it("eigener Faktor gilt in jeder Org", () => {
		expect(
			effectiveMfaVerifiedAt({ mfaVerifiedAt: at, activeOrganizationId: "b" }),
		).toBe(at);
	});
	it("Firmen-MFA nur in der Org des Anbieters (S1)", () => {
		const s = { mfaVerifiedAt: at, mfaOrgId: "a" };
		expect(effectiveMfaVerifiedAt({ ...s, activeOrganizationId: "a" })).toBe(
			at,
		);
		expect(
			effectiveMfaVerifiedAt({ ...s, activeOrganizationId: "b" }),
		).toBeNull();
		expect(
			effectiveMfaVerifiedAt({ ...s, activeOrganizationId: null }),
		).toBeNull();
		expect(effectiveMfaVerifiedAt({ mfaVerifiedAt: null })).toBeNull();
	});
});

describe("isStepUpFresh", () => {
	it("frisch innerhalb 10 min, danach nicht", () => {
		expect(
			isStepUpFresh(
				{ stepUpAt: new Date(now - STEP_UP_MS + 1000), mfaVerifiedAt: null },
				now,
			),
		).toBe(true);
		expect(
			isStepUpFresh(
				{ stepUpAt: new Date(now - STEP_UP_MS - 1000), mfaVerifiedAt: null },
				now,
			),
		).toBe(false);
		expect(
			isStepUpFresh(
				{ stepUpAt: null, mfaVerifiedAt: new Date(now - 1000) },
				now,
			),
		).toBe(true);
	});
});

describe("normalizeRole", () => {
	it("nimmt die höchste bekannte Rolle", () => {
		expect(normalizeRole("viewer,editor")).toBe("editor");
		expect(normalizeRole("admin")).toBe("owner");
		expect(normalizeRole("member")).toBe("viewer");
		expect(normalizeRole(null)).toBe("viewer");
		expect(normalizeRole("auditor")).toBe("auditor");
		expect(normalizeRole("consultant")).toBe("consultant");
		expect(normalizeRole("consultant,auditor")).toBe("consultant");
		expect(normalizeRole("consultant,editor")).toBe("editor");
	});
});

describe("ipFromHeaders", () => {
	it("bevorzugt X-Real-IP, sonst erstes X-Forwarded-For-Glied", () => {
		expect(
			ipFromHeaders(
				new Headers({
					"x-real-ip": "1.1.1.1",
					"x-forwarded-for": "2.2.2.2, 3.3.3.3",
				}),
			),
		).toBe("1.1.1.1");
		expect(
			ipFromHeaders(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })),
		).toBe("2.2.2.2");
		expect(ipFromHeaders(new Headers())).toBeNull();
	});
});

describe("mfaFactors", () => {
	it("nennt Passkey und TOTP, leer ohne Faktor", () => {
		expect(mfaFactors({ twoFactorEnabled: false, passkeys: 0 })).toEqual([]);
		expect(mfaFactors({ twoFactorEnabled: true })).toEqual(["TOTP"]);
		expect(mfaFactors({ twoFactorEnabled: true, passkeys: 2 })).toEqual([
			"Passkey",
			"TOTP",
		]);
	});
});
