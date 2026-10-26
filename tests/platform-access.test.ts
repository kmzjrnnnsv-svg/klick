import { describe, expect, it } from "vitest";
import {
	approvedExpiry,
	canDecide,
	canRevoke,
	capSessionExpiry,
	EMERGENCY_MAX_MIN,
	findActiveGrant,
	type GrantLike,
	grantActive,
	grantState,
	initialGrant,
	REQUEST_TTL_MS,
	type RequestInput,
	reportOverdue,
	validateRequest,
	WAIT_MS,
} from "@/lib/platform-access/rules";

// Lockbox (Härtung A3): Antrag → Freigabe → befristeter Zugriff; Notfall und
// Wartezeit als einzige Wege ohne Freigabe.

const now = new Date("2026-10-26T10:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const H = 3_600_000;

const req = (o: Partial<RequestInput> = {}): RequestInput => ({
	scope: "impersonate",
	targetUserId: "u-target",
	reason: "Fehler beim Export nachstellen",
	durationMinutes: 60,
	emergency: null,
	waiting: false,
	...o,
});

const grant = (o: Partial<GrantLike> = {}): GrantLike => ({
	scope: "impersonate",
	targetUserId: "u-target",
	status: "requested",
	requestedBy: "u-admin",
	requestedAt: now,
	applyAfter: null,
	expiresAt: null,
	revokedAt: null,
	emergencyCategory: null,
	reportDueAt: null,
	reportedAt: null,
	...o,
});

describe("validateRequest", () => {
	it("gültiger Antrag", () => {
		expect(validateRequest(req())).toBeNull();
		expect(
			validateRequest(req({ scope: "view", targetUserId: null })),
		).toBeNull();
	});

	it("Person nur bei Zwecken mit Person", () => {
		expect(validateRequest(req({ targetUserId: null }))).toBe(
			"target_required",
		);
		expect(validateRequest(req({ scope: "view" }))).toBe("target_forbidden");
	});

	it("Begründung und Dauer", () => {
		expect(validateRequest(req({ reason: "kurz" }))).toBe("reason");
		expect(validateRequest(req({ durationMinutes: 5 }))).toBe("duration");
		expect(validateRequest(req({ durationMinutes: 24 * 60 + 1 }))).toBe(
			"duration",
		);
		expect(validateRequest(req({ durationMinutes: 30.5 }))).toBe("duration");
	});

	it("Notfall: nur bekannte Gründe, höchstens 4 h, nie mit Wartezeit", () => {
		expect(validateRequest(req({ emergency: "security_incident" }))).toBeNull();
		expect(
			validateRequest(
				req({
					emergency: "legal_order",
					durationMinutes: EMERGENCY_MAX_MIN + 1,
				}),
			),
		).toBe("emergency_duration");
		expect(validateRequest(req({ emergency: "neugier" as never }))).toBe(
			"emergency_category",
		);
		expect(
			validateRequest(
				req({ scope: "reset_access", emergency: "legal_order", waiting: true }),
			),
		).toBe("waiting_and_emergency");
		// Zurücksetzen übergibt das Konto: nie als Notfall
		expect(
			validateRequest(
				req({
					scope: "reset_access",
					targetUserId: "u-1",
					emergency: "security_incident",
				}),
			),
		).toBe("emergency_scope");
	});

	it("Wartezeit nur für Zugang zurücksetzen", () => {
		expect(validateRequest(req({ waiting: true }))).toBe("waiting_scope");
		expect(
			validateRequest(req({ scope: "reset_access", waiting: true })),
		).toBeNull();
	});
});

describe("grantState", () => {
	it("Antrag ist offen und verfällt nach 7 Tagen", () => {
		expect(grantState(grant(), now)).toBe("requested");
		expect(grantState(grant(), at(REQUEST_TTL_MS + 1))).toBe("expired");
	});

	it("freigegeben gilt bis zum Ablauf", () => {
		const g = grant({ status: "approved", expiresAt: at(H) });
		expect(grantActive(g, now)).toBe(true);
		expect(grantState(g, at(H))).toBe("expired");
	});

	it("widerrufen, abgelehnt und abgebrochen gelten nie", () => {
		expect(
			grantState(
				grant({ status: "approved", expiresAt: at(H), revokedAt: now }),
				now,
			),
		).toBe("revoked");
		expect(grantState(grant({ status: "denied" }), now)).toBe("denied");
		expect(grantState(grant({ status: "cancelled" }), now)).toBe("cancelled");
	});

	it("Wartezeit: erst nach 24 h aktiv", () => {
		const fields = initialGrant(
			req({ scope: "reset_access", waiting: true }),
			now,
		);
		const g = grant({ scope: "reset_access", ...fields });
		expect(grantState(g, at(WAIT_MS - 1))).toBe("waiting");
		expect(grantState(g, at(WAIT_MS))).toBe("active");
		expect(grantState(g, at(WAIT_MS + H))).toBe("expired");
	});

	it("Notfall wirkt sofort, Bericht in 24 h", () => {
		const fields = initialGrant(
			req({ emergency: "security_incident", durationMinutes: 600 }),
			now,
		);
		expect(fields.status).toBe("emergency");
		expect(fields.expiresAt).toEqual(at(EMERGENCY_MAX_MIN * 60_000));
		const g = grant(fields);
		expect(grantActive(g, now)).toBe(true);
		expect(reportOverdue(g, at(23 * H))).toBe(false);
		expect(reportOverdue(g, at(25 * H))).toBe(true);
		expect(reportOverdue({ ...g, reportedAt: at(H) }, at(25 * H))).toBe(false);
	});
});

describe("findActiveGrant", () => {
	it("passt Zweck und Person", () => {
		const list = [
			grant({ status: "approved", expiresAt: at(H), targetUserId: "u-other" }),
			grant({
				status: "approved",
				expiresAt: at(H),
				scope: "view",
				targetUserId: null,
			}),
			grant({ status: "approved", expiresAt: at(H) }),
		];
		expect(
			findActiveGrant(
				list,
				{ scope: "impersonate", targetUserId: "u-target" },
				now,
			),
		).toBe(list[2]);
		expect(findActiveGrant(list, { scope: "view" }, now)).toBe(list[1]);
		expect(
			findActiveGrant(
				list,
				{ scope: "reset_access", targetUserId: "u-target" },
				now,
			),
		).toBeNull();
	});

	it("gilt nur der beantragenden Person, Zurücksetzen nur einmal (K7)", () => {
		const imp = grant({ status: "approved", expiresAt: at(H) });
		const want = { scope: "impersonate" as const, targetUserId: "u-target" };
		expect(
			findActiveGrant([imp], { ...want, requestedBy: "u-admin" }, now),
		).toBe(imp);
		expect(
			findActiveGrant([imp], { ...want, requestedBy: "u-other-admin" }, now),
		).toBeNull();
		const reset = grant({
			scope: "reset_access",
			status: "approved",
			expiresAt: at(H),
		});
		const r = { scope: "reset_access" as const, targetUserId: "u-target" };
		expect(findActiveGrant([reset], r, now)).toBe(reset);
		expect(findActiveGrant([{ ...reset, usedAt: now }], r, now)).toBeNull();
		// „als Person anmelden“ bleibt bis zum Ablauf nutzbar
		expect(
			findActiveGrant([{ ...imp, usedAt: now }], want, now),
		).not.toBeNull();
	});
});

describe("Entscheiden und Widerrufen", () => {
	const owner = { userId: "u-owner", mayDecide: true };

	it("nur offene Anträge, nur Inhaber:in oder GL, nie selbst", () => {
		expect(canDecide(grant(), owner, now)).toBeNull();
		expect(canDecide(grant(), { userId: "u-x", mayDecide: false }, now)).toBe(
			"forbidden",
		);
		expect(
			canDecide(grant(), { userId: "u-admin", mayDecide: true }, now),
		).toBe("self");
		expect(
			canDecide(grant(), { userId: "u-target", mayDecide: true }, now),
		).toBe("self");
		expect(
			canDecide(grant({ status: "approved", expiresAt: at(H) }), owner, now),
		).toBe("not_open");
	});

	it("Abbrechen: auch wartend und aktiv; die betroffene Person darf", () => {
		const waiting = grant({
			scope: "reset_access",
			...initialGrant(req({ scope: "reset_access", waiting: true }), now),
		});
		expect(canRevoke(waiting, owner, now)).toBeNull();
		expect(
			canRevoke(
				waiting,
				{ userId: "u-target", mayDecide: false, isTarget: true },
				now,
			),
		).toBeNull();
		expect(canRevoke(waiting, { userId: "u-x", mayDecide: false }, now)).toBe(
			"forbidden",
		);
		expect(canRevoke(grant({ status: "denied" }), owner, now)).toBe("not_open");
	});

	it("Freigabe gilt ab Entscheidung für die beantragte Dauer", () => {
		expect(approvedExpiry({ durationMinutes: 90 }, now)).toEqual(at(1.5 * H));
	});

	it("Impersonation endet spätestens mit der Freigabe", () => {
		expect(capSessionExpiry(at(30 * 60_000), at(10 * 60_000))).toEqual(
			at(10 * 60_000),
		);
		expect(capSessionExpiry(at(10 * 60_000), at(H))).toEqual(at(10 * 60_000));
	});
});
