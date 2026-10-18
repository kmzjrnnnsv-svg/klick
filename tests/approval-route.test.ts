import { describe, expect, it } from "vitest";
import type { ApprovalStep } from "@/db/schema/grc";
import {
	matchConditions,
	normalizeSteps,
	planRoute,
	selectWorkflow,
} from "@/lib/approvals/route";
import {
	advance,
	approverEligibility,
	canDecideNow,
	ruleStates,
} from "@/lib/approvals/rules";

// Beispiel aus der Anforderung: Einkauf legt an → Finanzen (entfällt, wenn
// die anfragende Person selbst Finanzen ist) → Recht UND Informationssicherheit
const FIN = "role:r-fin";
const LEGAL = "role:r-legal";
const ISB = "function:isb_ciso";
const STEPS: ApprovalStep[] = [
	{ order: 1, approverRule: FIN, skipIf: [FIN], label: "Finanzen" },
	{
		order: 2,
		approverRule: LEGAL,
		approvers: [LEGAL, ISB],
		mode: "all",
		label: "Recht und Informationssicherheit",
	},
];
const emma = {
	userId: "emma",
	orgRole: "viewer" as const,
	functions: [],
	customRoleIds: ["r-buy"],
	canDecide: false,
};
const fritz = {
	userId: "fritz",
	orgRole: "viewer" as const,
	functions: [],
	customRoleIds: ["r-fin"],
	canDecide: true,
};
const rita = {
	userId: "rita",
	orgRole: "viewer" as const,
	functions: [],
	customRoleIds: ["r-legal"],
	canDecide: true,
};
const ines = {
	userId: "ines",
	orgRole: "editor" as const,
	functions: ["isb_ciso" as const],
	canDecide: true,
};
const all = [emma, fritz, rita, ines];

describe("Freigabe-Route (Designer)", () => {
	it("Einkäuferin: alle Stufen gelten, Start bei Finanzen", () => {
		const r = planRoute(STEPS, {
			requester: emma,
			facts: {},
			candidates: all,
			ctx: { requesterUserId: "emma" },
		});
		expect(r.firstOrder).toBe(1);
		expect(r.steps.some((s) => s.skipped)).toBe(false);
		expect(r.warnings).toEqual([]);
	});

	it("anfragende Person ist selbst Finanzen → Stufe entfällt mit Grund", () => {
		const r = planRoute(STEPS, {
			requester: fritz,
			facts: {},
			candidates: all,
			ctx: { requesterUserId: "fritz" },
		});
		expect(r.steps[0]?.skipped).toEqual({ by: "requester", rule: FIN });
		expect(r.firstOrder).toBe(2);
	});

	it("Recht UND Informationssicherheit: erst beide zusammen geben frei", () => {
		const step2 = STEPS[1] as ApprovalStep;
		const elig = approverEligibility(step2, rita, { requesterUserId: "emma" });
		expect(elig).toMatchObject({ eligible: true, rules: [LEGAL] });
		const onlyLegal = [
			{ decision: "approved" as const, rule: LEGAL, approverUserId: "rita" },
		];
		expect(advance(STEPS, 2, onlyLegal)).toEqual({
			status: "pending",
			nextStep: 2,
		});
		expect(
			advance(STEPS, 2, [
				...onlyLegal,
				{ decision: "approved", rule: ISB, approverUserId: "ines" },
			]),
		).toEqual({ status: "approved" });
	});

	it("Ablehnung an einer Stelle beendet den Antrag", () => {
		expect(
			advance(STEPS, 2, [
				{ decision: "approved", rule: LEGAL, approverUserId: "rita" },
				{ decision: "rejected", rule: ISB, approverUserId: "ines" },
			]),
		).toEqual({ status: "rejected" });
	});

	it("nach Finanzen geht es zur nächsten Stufe; entfallene werden übersprungen", () => {
		const planned = planRoute(STEPS, {
			requester: emma,
			facts: {},
			candidates: all,
			ctx: { requesterUserId: "emma" },
		}).steps;
		expect(
			advance(planned, 1, [{ decision: "approved", approverUserId: "fritz" }]),
		).toEqual({ status: "pending", nextStep: 2 });
		const skipped: ApprovalStep[] = [
			{ order: 1, approverRule: FIN },
			{ order: 2, approverRule: LEGAL, skipped: { by: "condition" } },
			{ order: 3, approverRule: ISB },
		];
		expect(
			advance(skipped, 1, [{ decision: "approved", approverUserId: "fritz" }]),
		).toEqual({ status: "pending", nextStep: 3 });
	});

	it("Stelle ohne mögliche Freigebende wird gemeldet", () => {
		const r = planRoute(STEPS, {
			requester: emma,
			facts: {},
			candidates: [emma, fritz, ines],
			ctx: { requesterUserId: "emma" },
		});
		expect(r.warnings).toEqual([
			{ order: 2, kind: "no_approver", rule: LEGAL },
		]);
	});

	it("„Nur wenn …“: Stufe entfällt, wenn die Bedingung nicht passt", () => {
		const steps: ApprovalStep[] = [
			{
				order: 1,
				approverRule: LEGAL,
				onlyIf: [
					{ field: "criticality", op: "in", value: ["critical", "important"] },
				],
			},
		];
		const ctx = { requesterUserId: "emma" };
		expect(
			planRoute(steps, {
				requester: emma,
				facts: { criticality: "standard" },
				candidates: all,
				ctx,
			}).firstOrder,
		).toBeNull();
		expect(
			planRoute(steps, {
				requester: emma,
				facts: { criticality: "critical" },
				candidates: all,
				ctx,
			}).firstOrder,
		).toBe(1);
	});
});

describe("Ablauf je Auslöser", () => {
	const base = {
		kind: "provider_intake",
		trigger: "provider.create",
		enabled: true,
		conditions: [],
		priority: 0,
	};
	const critical = {
		kind: "custom_krit",
		trigger: "provider.create",
		enabled: true,
		custom: true,
		priority: 10,
		conditions: [
			{ field: "criticality", op: "eq" as const, value: "critical" },
		],
	};
	it("Variante mit Bedingung vor dem Standard", () => {
		const wfs = [base, critical];
		expect(
			selectWorkflow(wfs, "provider.create", { criticality: "critical" })?.kind,
		).toBe("custom_krit");
		expect(
			selectWorkflow(wfs, "provider.create", { criticality: "standard" })?.kind,
		).toBe("provider_intake");
	});
	it("ausgeschaltete Abläufe und fremde Auslöser zählen nicht", () => {
		expect(
			selectWorkflow([{ ...base, enabled: false }], "provider.create", {}),
		).toBeNull();
		expect(selectWorkflow([base], "asset.create", {})).toBeNull();
		// Altbestand ohne trigger-Spalte: aus dem kind abgeleitet
		expect(
			selectWorkflow(
				[{ kind: "document_publish", enabled: true }],
				"document.publish",
				{},
			)?.kind,
		).toBe("document_publish");
	});
	it("Bedingungen", () => {
		expect(
			matchConditions([{ field: "isOutsourcing", op: "is_true" }], {
				isOutsourcing: true,
			}),
		).toBe(true);
		expect(
			matchConditions([{ field: "score", op: "gte", value: 8 }], { score: 6 }),
		).toBe(false);
		expect(matchConditions([], {})).toBe(true);
	});
	it("normalizeSteps: fortlaufend, erste Stelle als approverRule", () => {
		expect(
			normalizeSteps([
				{ order: 5, approverRule: "x", approvers: [LEGAL, ISB], mode: "all" },
				{ order: 2, approverRule: FIN, slaDays: 0, label: "  " },
			]),
		).toEqual([
			{ order: 1, approverRule: FIN },
			{ order: 2, approverRule: LEGAL, approvers: [LEGAL, ISB], mode: "all" },
		]);
	});
});

describe("canDecideNow / ruleStates (Modus „alle“)", () => {
	const step: ApprovalStep = {
		order: 2,
		approverRule: LEGAL,
		approvers: [LEGAL, ISB],
		mode: "all",
	};
	const legal1 = {
		userId: "u-law1",
		orgRole: "viewer" as const,
		functions: [],
		customRoleIds: ["r-legal"],
		canDecide: true,
	};
	const legal2 = { ...legal1, userId: "u-law2" };
	const isb = {
		userId: "u-isb",
		orgRole: "viewer" as const,
		functions: ["isb_ciso" as const],
		canDecide: true,
	};
	const ctx = { requesterUserId: "u-buy" };
	const members = [legal1, legal2, isb];
	const afterLegal = [
		{ decision: "approved" as const, rule: LEGAL, approverUserId: "u-law1" },
	];

	it("vor jeder Entscheidung dürfen Recht und ISB", () => {
		expect(canDecideNow(step, legal1, ctx, members, [])).toBe(true);
		expect(canDecideNow(step, isb, ctx, members, [])).toBe(true);
	});

	it("nach Zustimmung von Recht: zweite Person aus Recht nicht mehr, ISB schon", () => {
		expect(canDecideNow(step, legal1, ctx, members, afterLegal)).toBe(false);
		expect(canDecideNow(step, legal2, ctx, members, afterLegal)).toBe(false);
		expect(canDecideNow(step, isb, ctx, members, afterLegal)).toBe(true);
	});

	it("Stand je Stelle", () => {
		expect(ruleStates(step, afterLegal)).toEqual([
			{ rule: LEGAL, done: true },
			{ rule: ISB, done: false },
		]);
		expect(ruleStates({ order: 1, approverRule: FIN }, [])).toEqual([]);
	});
});
