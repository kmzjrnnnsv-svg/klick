import { describe, expect, it } from "vitest";
import {
	advance,
	approverEligibility,
	eligibleApprovers,
	slaDueAt,
	soloModeAllowed,
} from "@/lib/approvals/rules";

const anna = {
	userId: "anna",
	orgRole: "owner" as const,
	functions: ["management_body" as const],
};
const ben = {
	userId: "ben",
	orgRole: "editor" as const,
	functions: ["compliance" as const],
};
const cara = { userId: "cara", orgRole: "viewer" as const, functions: [] };
const members = [anna, ben, cara];

describe("approverEligibility", () => {
	it("Vier-Augen: Antragsteller:in darf nie entscheiden", () => {
		expect(
			approverEligibility({ order: 1, approverRule: "role:owner" }, anna, {
				requesterUserId: "anna",
			}),
		).toEqual({ eligible: false, reason: "four_eyes" });
	});
	it("Funktionsregel: nur Compliance", () => {
		const step = { order: 2, approverRule: "function:compliance" };
		expect(approverEligibility(step, ben, { requesterUserId: "anna" })).toEqual(
			{ eligible: true, via: "direct" },
		);
		expect(
			approverEligibility(step, cara, { requesterUserId: "anna" }),
		).toEqual({
			eligible: false,
			reason: "rule_not_met",
		});
	});
	it("Rollenregel: owner erfüllt editor", () => {
		expect(
			approverEligibility({ order: 1, approverRule: "role:editor" }, anna, {
				requesterUserId: "ben",
			}).eligible,
		).toBe(true);
		expect(
			approverEligibility({ order: 1, approverRule: "role:owner" }, ben, {
				requesterUserId: "anna",
			}).eligible,
		).toBe(false);
	});
	it("owner_of_entity und not_requester", () => {
		expect(
			approverEligibility({ order: 1, approverRule: "owner_of_entity" }, ben, {
				requesterUserId: "anna",
				entityOwnerUserId: "ben",
			}).eligible,
		).toBe(true);
		expect(
			eligibleApprovers({ order: 1, approverRule: "not_requester" }, members, {
				requesterUserId: "anna",
			}).map((m) => m.userId),
		).toEqual(["ben", "cara"]);
	});
	it("Vertretung: Cara entscheidet für Ben, nicht für den Antragsteller", () => {
		const step = { order: 2, approverRule: "function:compliance" };
		const ctx = {
			requesterUserId: "anna",
			delegations: [{ fromUserId: "ben", toUserId: "cara" }],
		};
		expect(approverEligibility(step, cara, ctx, members)).toEqual({
			eligible: true,
			via: "delegation",
			onBehalfOf: "ben",
		});
		const ctx2 = {
			requesterUserId: "ben",
			delegations: [{ fromUserId: "ben", toUserId: "cara" }],
		};
		expect(approverEligibility(step, cara, ctx2, members).eligible).toBe(false);
	});
});

describe("soloModeAllowed / slaDueAt / advance", () => {
	it("Solo nur bei einer Person, erlaubt und Stufe < 2", () => {
		expect(
			soloModeAllowed({
				memberCount: 1,
				allowSelfApproval: true,
				licenceStage: "0_vorbereitung",
			}),
		).toBe(true);
		expect(
			soloModeAllowed({
				memberCount: 1,
				allowSelfApproval: true,
				licenceStage: "2_casp_zag",
			}),
		).toBe(false);
		expect(
			soloModeAllowed({
				memberCount: 2,
				allowSelfApproval: true,
				licenceStage: "0_vorbereitung",
			}),
		).toBe(false);
		expect(
			soloModeAllowed({
				memberCount: 1,
				allowSelfApproval: false,
				licenceStage: "0_vorbereitung",
			}),
		).toBe(false);
	});
	it("SLA", () => {
		const from = new Date("2026-10-07T00:00:00Z");
		expect(slaDueAt({ order: 1, approverRule: "x", slaDays: 5 }, from)).toEqual(
			new Date("2026-10-12T00:00:00Z"),
		);
		expect(slaDueAt({ order: 1, approverRule: "x" }, from)).toBeNull();
	});
	it("advance: Ablehnung gewinnt, Stufen wandern, letzte Stufe → approved", () => {
		const steps = [
			{ order: 1, approverRule: "owner_of_entity" },
			{ order: 2, approverRule: "function:compliance", minApprovers: 2 },
			{ order: 3, approverRule: "function:management_body" },
		];
		expect(advance(steps, 1, [{ decision: "approved" }])).toEqual({
			status: "pending",
			nextStep: 2,
		});
		expect(advance(steps, 2, [{ decision: "approved" }])).toEqual({
			status: "pending",
			nextStep: 2,
		});
		expect(
			advance(steps, 2, [{ decision: "approved" }, { decision: "approved" }]),
		).toEqual({ status: "pending", nextStep: 3 });
		expect(advance(steps, 3, [{ decision: "approved" }])).toEqual({
			status: "approved",
		});
		expect(
			advance(steps, 2, [{ decision: "approved" }, { decision: "rejected" }]),
		).toEqual({ status: "rejected" });
		expect(advance(steps, 1, [{ decision: "changes_requested" }])).toEqual({
			status: "changes_requested",
		});
	});
});
