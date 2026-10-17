import { describe, expect, it } from "vitest";
import type { ApprovalStep } from "@/db/schema/grc";
import { ENTITY_OWNER_SOURCES } from "@/lib/approvals/entity-owner";
import {
	effectiveStep,
	firstUnfillableStep,
	waitingApprovers,
} from "@/lib/approvals/rules";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";

// document_publish: Eigner:in → Compliance → Geschäftsleitung
const publish: ApprovalStep[] = [
	{ order: 1, approverRule: "owner_of_entity", slaDays: 5 },
	{ order: 2, approverRule: "function:compliance", slaDays: 5 },
	{ order: 3, approverRule: "function:management_body", slaDays: 10 },
];
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
const cara = { userId: "cara", orgRole: "editor" as const, functions: [] };
const members = [anna, ben, cara];
const ids = members.map((m) => m.userId);

describe("effectiveStep (Eigner-Stufe)", () => {
	it("Eigner:in reicht selbst ein → Stufe 1 entfällt, Start bei Compliance", () => {
		expect(
			effectiveStep(publish, 1, {
				requesterUserId: "cara",
				entityOwnerUserId: "cara",
				memberIds: ids,
			}),
		).toEqual({
			order: 2,
			skipped: [{ order: 1, reason: "owner_is_requester" }],
		});
	});
	it("andere Person reicht ein → Eigner:in entscheidet Stufe 1", () => {
		expect(
			effectiveStep(publish, 1, {
				requesterUserId: "ben",
				entityOwnerUserId: "cara",
				memberIds: ids,
			}).order,
		).toBe(1);
	});
	it("ohne Owner oder mit ausgetretener Eigner:in entfällt die Stufe", () => {
		expect(
			effectiveStep(publish, 1, {
				requesterUserId: "ben",
				entityOwnerUserId: null,
				memberIds: ids,
			}).skipped,
		).toEqual([{ order: 1, reason: "no_owner" }]);
		expect(
			effectiveStep(publish, 1, {
				requesterUserId: "ben",
				entityOwnerUserId: "gone",
				memberIds: ids,
			}).skipped,
		).toEqual([{ order: 1, reason: "owner_left" }]);
	});
	it("Workflow nur mit Eigner-Stufe → nichts mehr offen", () => {
		expect(
			effectiveStep([publish[0] as ApprovalStep], 1, {
				requesterUserId: "cara",
				entityOwnerUserId: "cara",
				memberIds: ids,
			}).order,
		).toBeNull();
	});
});

describe("firstUnfillableStep", () => {
	it("alle Stufen besetzt → null", () => {
		expect(
			firstUnfillableStep(publish, 1, members, {
				requesterUserId: "cara",
				entityOwnerUserId: "cara",
			}),
		).toBeNull();
	});
	it("Compliance unbesetzt → Stufe 2 wird gemeldet (nicht erst nach Freigaben)", () => {
		const noCompliance = [anna, cara];
		expect(
			firstUnfillableStep(publish, 1, noCompliance, {
				requesterUserId: "cara",
				entityOwnerUserId: "cara",
			})?.order,
		).toBe(2);
	});
	it("Vier-Augen: einzige Leitungsperson reicht selbst ein → Stufe 3 unbesetzbar", () => {
		expect(
			firstUnfillableStep(publish, 1, members, {
				requesterUserId: "anna",
				entityOwnerUserId: "anna",
			})?.order,
		).toBe(3);
	});
});

describe("Rolle muss entscheiden dürfen", () => {
	it("Lesend mit Funktion zählt nicht als Freigeber:in", () => {
		const viewerGf = {
			userId: "vera",
			orgRole: "viewer" as const,
			functions: ["management_body" as const],
			canDecide: false,
		};
		expect(
			firstUnfillableStep(publish, 2, [ben, viewerGf, cara], {
				requesterUserId: "cara",
				entityOwnerUserId: "cara",
			})?.order,
		).toBe(3);
	});
});

describe("waitingApprovers", () => {
	it("nennt, wer die aktuelle Stufe entscheiden darf", () => {
		const who = waitingApprovers(
			{ status: "pending", currentStep: 2, steps: publish },
			members,
			{ requesterUserId: "cara", entityOwnerUserId: "cara" },
		);
		expect(who.map((m) => m.userId)).toEqual(["ben"]);
		expect(
			waitingApprovers(
				{ status: "approved", currentStep: 2, steps: publish },
				members,
				{ requesterUserId: "cara" },
			),
		).toEqual([]);
	});
});

describe("Workflow-Katalog", () => {
	it("jede owner_of_entity-Stufe hat eine serverseitige Owner-Quelle", () => {
		for (const w of APPROVAL_WORKFLOW_TEMPLATES) {
			if (!w.steps.some((s) => s.approverRule === "owner_of_entity")) continue;
			expect(ENTITY_OWNER_SOURCES[w.entityType], w.kind).toBeDefined();
		}
	});
});
