import { describe, expect, it } from "vitest";
import { DEFAULT_DLP_POLICY } from "@/lib/dlp/policy";
import {
	type ChangeLike,
	canCancelChange,
	canDecideChange,
	changeRoute,
	changeState,
	DECIDER_TENURE_MS,
	dlpRelaxed,
	eligibleDeciders,
	isOpen,
	PERMIT_MS,
	REQUEST_TTL_MS,
	ssoPolicyCritical,
	WAIT_MS,
} from "@/lib/security-changes/rules";

// Vier-Augen (Härtung A4): Weg, Stand, wer entscheidet, was kritisch ist.

const now = new Date("2026-10-26T10:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const base: ChangeLike = {
	kind: "sso_policy",
	status: "pending",
	requestedBy: "a",
	requestedAt: now,
	applyAfter: null,
	permitUntil: null,
};

describe("changeRoute", () => {
	it("zweite Person, wenn es eine andere Entscheider:in gibt", () => {
		const r = changeRoute(["a", "b", "a"], "a", now);
		expect(r.status).toBe("pending");
		expect(r.notify).toEqual(["b"]);
		expect(r.applyAfter).toBeNull();
	});
	it("sonst 24 h Wartezeit, Mitteilung an die anfragende Person", () => {
		const r = changeRoute(["a"], "a", now);
		expect(r.status).toBe("waiting");
		expect(r.applyAfter?.getTime()).toBe(now.getTime() + WAIT_MS);
		expect(r.permitUntil?.getTime()).toBe(now.getTime() + WAIT_MS + PERMIT_MS);
		expect(r.notify).toEqual(["a"]);
	});
	it("auch wenn die anfragende Person gar nicht entscheiden darf", () => {
		expect(changeRoute([], "x", now).status).toBe("waiting");
	});
});

describe("eligibleDeciders", () => {
	it("zählt nur, wer seit mindestens 24 h entscheiden darf", () => {
		expect(
			eligibleDeciders(
				[
					{ userId: "a", since: at(-DECIDER_TENURE_MS) },
					{ userId: "b", since: at(-DECIDER_TENURE_MS + 1) },
					{ userId: "a", since: at(-5 * DECIDER_TENURE_MS) },
				],
				now,
			),
		).toEqual(["a"]);
	});
});

describe("changeState", () => {
	it("offener Antrag verfällt nach 7 Tagen", () => {
		expect(changeState(base, at(REQUEST_TTL_MS - 1))).toBe("pending");
		expect(changeState(base, at(REQUEST_TTL_MS + 1))).toBe("expired");
	});
	it("Wartezeit: „wirkt“ wird fällig, „erlaubt“ gilt 24 h", () => {
		const waiting: ChangeLike = {
			...base,
			status: "waiting",
			applyAfter: at(WAIT_MS),
			permitUntil: at(WAIT_MS + PERMIT_MS),
		};
		expect(changeState(waiting, at(1))).toBe("waiting");
		expect(changeState(waiting, at(WAIT_MS + 1))).toBe("due");
		const permit = { ...waiting, kind: "org_delete" as const };
		expect(changeState(permit, at(WAIT_MS + 1))).toBe("permitted");
		expect(changeState(permit, at(WAIT_MS + PERMIT_MS + 1))).toBe("expired");
	});
	it("Erlaubnis nach Zustimmung gilt bis permitUntil", () => {
		const approved: ChangeLike = {
			...base,
			kind: "full_export",
			status: "approved",
			permitUntil: at(PERMIT_MS),
		};
		expect(changeState(approved, at(1))).toBe("permitted");
		expect(isOpen(approved, at(1))).toBe(true);
		expect(changeState(approved, at(PERMIT_MS + 1))).toBe("expired");
		expect(isOpen(approved, at(PERMIT_MS + 1))).toBe(false);
	});
	it("abgeschlossene Stände bleiben", () => {
		for (const s of ["applied", "rejected", "cancelled", "expired"] as const)
			expect(changeState({ ...base, status: s }, now)).toBe(s);
	});
});

describe("entscheiden und abbrechen", () => {
	it("nie die eigene Änderung, nur Entscheider:innen, nur offen", () => {
		expect(canDecideChange(base, "a", ["a", "b"], now)).toBe("four_eyes_self");
		expect(canDecideChange(base, "c", ["a", "b"], now)).toBe("forbidden");
		expect(canDecideChange(base, "b", ["a", "b"], now)).toBeNull();
		expect(
			canDecideChange({ ...base, status: "applied" }, "b", ["a", "b"], now),
		).toBe("four_eyes_not_open");
		// Wartezeit: niemand stimmt zu, nur abbrechen
		expect(
			canDecideChange(
				{ ...base, status: "waiting", applyAfter: at(WAIT_MS) },
				"b",
				["a", "b"],
				now,
			),
		).toBe("four_eyes_not_open");
	});
	it("abbrechen: anfragende Person oder Entscheider:in, solange offen", () => {
		expect(canCancelChange(base, "a", [], now)).toBeNull();
		expect(canCancelChange(base, "b", ["b"], now)).toBeNull();
		expect(canCancelChange(base, "c", ["b"], now)).toBe("forbidden");
		expect(
			canCancelChange({ ...base, status: "cancelled" }, "a", [], now),
		).toBe("four_eyes_not_open");
	});
});

describe("was ist kritisch", () => {
	const sso = {
		enforce: false,
		trustIdpMfa: false,
		defaultRole: "employee",
		groupRoles: [{ group: "g1", role: "viewer" }],
	};
	it("SSO: Erzwingen, Firmen-MFA an, Rollen", () => {
		expect(ssoPolicyCritical(sso, sso)).toEqual([]);
		expect(ssoPolicyCritical(sso, { ...sso, enforce: true })).toEqual([
			"enforce_on",
		]);
		expect(
			ssoPolicyCritical({ ...sso, enforce: true }, { ...sso, enforce: false }),
		).toEqual(["enforce_off"]);
		expect(ssoPolicyCritical(sso, { ...sso, trustIdpMfa: true })).toEqual([
			"idp_mfa_on",
		]);
		// Firmen-MFA abschalten ist strenger: ohne zweite Person
		expect(ssoPolicyCritical({ ...sso, trustIdpMfa: true }, sso)).toEqual([]);
		expect(
			ssoPolicyCritical(sso, {
				...sso,
				groupRoles: [{ group: "g1", role: "editor" }],
			}),
		).toEqual(["roles"]);
		expect(
			ssoPolicyCritical(
				{ ...sso, groupClaim: "groups" },
				{ ...sso, groupClaim: "roles" },
			),
		).toEqual(["roles"]);
		expect(ssoPolicyCritical(sso, { ...sso, defaultRole: "viewer" })).toEqual([
			"roles",
		]);
		// Reihenfolge der Gruppen zählt nicht
		const two = {
			...sso,
			groupRoles: [
				{ group: "a", role: "viewer" },
				{ group: "b", role: "editor" },
			],
		};
		expect(
			ssoPolicyCritical(two, {
				...two,
				groupRoles: [...two.groupRoles].reverse(),
			}),
		).toEqual([]);
	});
	it("DLP: nur Lockern braucht die zweite Person", () => {
		const d = DEFAULT_DLP_POLICY;
		expect(dlpRelaxed(d, d)).toEqual([]);
		expect(dlpRelaxed(d, { ...d, secret: "warn" })).toEqual(["secret"]);
		expect(dlpRelaxed(d, { ...d, pii: "allow" })).toEqual(["pii"]);
		expect(dlpRelaxed(d, { ...d, pii: "block" })).toEqual([]);
		expect(dlpRelaxed(d, { ...d, piiThreshold: 500 })).toEqual([
			"piiThreshold",
		]);
		expect(dlpRelaxed(d, { ...d, piiThreshold: 10 })).toEqual([]);
		expect(dlpRelaxed(d, { ...d, egressLimit: 400 })).toEqual(["egress"]);
		expect(dlpRelaxed(d, { ...d, egressWindowMinutes: 1 })).toEqual(["egress"]);
		expect(dlpRelaxed(d, { ...d, egressWindowMinutes: 60 })).toEqual([]);
	});
});
