import { describe, expect, it } from "vitest";
import {
	ABSOLUTE_SESSION_MS,
	AuthError,
	checkSessionRules,
	IDLE_SESSION_MS,
	ipFromHeaders,
	isStepUpFresh,
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
				checkSessionRules({ ...ok, user: { twoFactorEnabled: false } }, now),
			),
		).toBe("mfa_enrol");
		expect(
			code(() =>
				checkSessionRules(
					{ ...ok, session: { ...ok.session, mfaVerifiedAt: null } },
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
