import { describe, expect, it } from "vitest";
import type { ApprovalStep } from "@/db/schema/grc";
import {
	expandEveryone,
	planRoute,
	resolveEntityApprover,
	stepVacant,
} from "@/lib/approvals/route";
import { advance, canDecideNow } from "@/lib/approvals/rules";

// Bestellung durch die Geschäftsleitung: alle Mitglieder stimmen zu; wer
// selbst zur GL gehört und einträgt, zählt als erste Zustimmung. Unbesetzte
// Funktionen entfallen, die GL nie. Dokumente: Freigebende aus der Entität.

const GL = "function:management_body";
const person = (
	userId: string,
	functions: ("management_body" | "isb_ciso" | "compliance")[] = [],
	holder = functions,
) => ({
	userId,
	orgRole: "owner" as const,
	functions,
	holderFunctions: holder,
	canDecide: true,
});
const anna = person("anna", ["management_body"]);
const bert = person("bert", ["management_body"]);
const cleo = person("cleo", ["management_body"]);
// Vertretung der GL: hält die Funktion nicht selbst
const dora = person("dora", ["management_body"], []);
const ines = person("ines", ["isb_ciso"]);
const STEP: ApprovalStep[] = [{ order: 1, approverRule: GL, everyone: true }];

describe("Stufe „alle Personen“", () => {
	it("GL-Mitglied trägt ein: die anderen stimmen zu, die eigene Zustimmung ist gegeben", () => {
		const r = planRoute(STEP, {
			requester: anna,
			facts: {},
			candidates: [anna, bert, cleo, dora, ines],
			ctx: { requesterUserId: "anna" },
		});
		const s = r.steps[0];
		expect(s?.approvers).toEqual(["user:bert", "user:cleo"]);
		expect(s?.mode).toBe("all");
		expect(s?.given).toEqual(["anna"]);
		expect(s?.expandedFrom).toEqual([GL]);
		expect(r.warnings).toEqual([]);
	});

	it("Vertretung zählt nicht als eigene Stelle", () => {
		const s = expandEveryone(STEP[0] as ApprovalStep, [anna, bert, dora], {
			requesterUserId: "ines",
		});
		expect(s.approvers).toEqual(["user:anna", "user:bert"]);
		expect(s.given).toBeUndefined();
	});

	it("Einzel-GL trägt ein: Stufe entfällt, Antrag ist sofort freigegeben", () => {
		const r = planRoute(STEP, {
			requester: anna,
			facts: {},
			candidates: [anna, ines],
			ctx: { requesterUserId: "anna" },
		});
		expect(r.steps[0]?.skipped).toEqual({ by: "requester", rule: GL });
		expect(r.steps[0]?.given).toEqual(["anna"]);
		expect(r.firstOrder).toBeNull();
	});

	it("erst wenn alle zugestimmt haben, ist die Bestellung freigegeben", () => {
		const r = planRoute(STEP, {
			requester: ines,
			facts: {},
			candidates: [anna, bert, cleo, ines],
			ctx: { requesterUserId: "ines" },
		});
		const steps = r.steps;
		const one = [
			{
				decision: "approved" as const,
				rule: "user:anna",
				approverUserId: "anna",
			},
		];
		expect(advance(steps, 1, one).status).toBe("pending");
		const three = [
			...one,
			{
				decision: "approved" as const,
				rule: "user:bert",
				approverUserId: "bert",
			},
			{
				decision: "approved" as const,
				rule: "user:cleo",
				approverUserId: "cleo",
			},
		];
		expect(advance(steps, 1, three).status).toBe("approved");
		const s = steps[0] as ApprovalStep;
		// Anna hat entschieden, darf nicht noch einmal
		expect(
			canDecideNow(
				s,
				anna,
				{ requesterUserId: "ines" },
				[anna, bert, cleo],
				one,
			),
		).toBe(false);
		expect(
			canDecideNow(
				s,
				bert,
				{ requesterUserId: "ines" },
				[anna, bert, cleo],
				one,
			),
		).toBe(true);
	});

	it("Vertretungsregel: Dora entscheidet für Bert", () => {
		const r = planRoute(STEP, {
			requester: ines,
			facts: {},
			candidates: [anna, bert, dora, ines],
			ctx: {
				requesterUserId: "ines",
				delegations: [{ fromUserId: "bert", toUserId: "dora" }],
			},
		});
		const s = r.steps[0] as ApprovalStep;
		expect(
			canDecideNow(
				s,
				dora,
				{
					requesterUserId: "ines",
					delegations: [{ fromUserId: "bert", toUserId: "dora" }],
				},
				[anna, bert, dora, ines],
				[],
			),
		).toBe(true);
	});

	it("ohne GL bleibt die Stufe stehen und wird gemeldet (nie still übersprungen)", () => {
		const r = planRoute(STEP, {
			requester: ines,
			facts: {},
			candidates: [ines],
			ctx: { requesterUserId: "ines" },
		});
		expect(r.steps[0]?.skipped).toBeUndefined();
		expect(r.warnings).toEqual([{ order: 1, kind: "no_approver" }]);
	});

	it("GL-Mitglied ohne Recht zu entscheiden wird gemeldet", () => {
		const r = planRoute(STEP, {
			requester: ines,
			facts: {},
			candidates: [anna, { ...bert, canDecide: false }, ines],
			ctx: { requesterUserId: "ines" },
		});
		expect(r.warnings).toEqual([
			{ order: 1, kind: "no_approver", rule: "user:bert" },
		]);
	});
});

describe("unbesetzte Stufen", () => {
	const steps: ApprovalStep[] = [
		{ order: 1, approverRule: "owner_of_entity" },
		{ order: 2, approverRule: "function:compliance" },
		{ order: 3, approverRule: GL },
	];

	it("Funktion ohne Inhaber:in entfällt, die GL nie", () => {
		expect(stepVacant(["function:compliance"], [anna, ines])).toBe(true);
		expect(stepVacant([GL], [ines])).toBe(false);
		expect(stepVacant(["function:isb_ciso"], [anna, ines])).toBe(false);
		expect(stepVacant(["owner_of_entity"], [])).toBe(false);
		const r = planRoute(steps, {
			requester: ines,
			facts: {},
			candidates: [anna, ines],
			ctx: { requesterUserId: "ines", entityOwnerUserId: "ines" },
		});
		expect(r.steps[1]?.skipped).toEqual({ by: "vacant" });
		expect(r.steps[2]?.skipped).toBeUndefined();
	});

	it("eine Vertretung reicht, damit die Funktion besetzt ist", () => {
		const deputy = person("dana", ["compliance"], []);
		expect(stepVacant(["function:compliance"], [deputy])).toBe(false);
	});
});

describe("Freigebende Funktion des Dokuments", () => {
	it("wird zur Funktion aufgelöst, ohne Funktion entfällt die Stufe", () => {
		expect(resolveEntityApprover(["approver_of_entity"], "isb_ciso")).toEqual([
			"function:isb_ciso",
		]);
		expect(resolveEntityApprover(["approver_of_entity"], null)).toEqual([]);
		const steps: ApprovalStep[] = [
			{ order: 1, approverRule: "owner_of_entity" },
			{ order: 2, approverRule: "approver_of_entity" },
		];
		const withGl = planRoute(steps, {
			requester: ines,
			facts: {},
			candidates: [anna, ines],
			ctx: {
				requesterUserId: "ines",
				entityOwnerUserId: "ines",
				entityApproverFunction: "management_body",
			},
		});
		expect(withGl.steps[1]?.approvers).toEqual([GL]);
		const none = planRoute(steps, {
			requester: ines,
			facts: {},
			candidates: [anna, ines],
			ctx: { requesterUserId: "ines", entityApproverFunction: null },
		});
		expect(none.steps[1]?.skipped).toEqual({ by: "vacant" });
	});
});
