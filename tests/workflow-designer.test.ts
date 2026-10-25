import { describe, expect, it } from "vitest";
import type { ApprovalStep } from "@/db/schema/grc";
import {
	checkWorkflowDraft,
	conditionIssues,
	type RuleNames,
	ruleKnown,
	ruleLabel,
	stepApproversText,
} from "@/lib/approvals/designer";
import {
	PRESET_BY_KEY,
	resolvePresetSteps,
	WORKFLOW_PRESETS,
} from "@/lib/approvals/presets";
import { normalizeSteps, planRoute } from "@/lib/approvals/route";
import { TRIGGER_BY_KEY } from "@/lib/approvals/triggers";
import { sanitizePermissions } from "@/lib/auth/permission-catalog";

const ROLE_FIN = "11111111-1111-4111-8111-111111111111";
const ROLE_LAW = "22222222-2222-4222-8222-222222222222";
const USER_A = "user-a";
const known = {
	roleIds: new Set([ROLE_FIN, ROLE_LAW]),
	userIds: new Set([USER_A]),
};

const names: RuleNames = {
	functions: { isb_ciso: "ISB", management_body: "Geschäftsleitung" },
	roles: { owner: "Inhaber:in", [ROLE_FIN]: "Finanzen", [ROLE_LAW]: "Recht" },
	users: { [USER_A]: "Anna" },
	ownerOfEntity: "Verantwortliche:r",
	approverOfEntity: "Freigebende Funktion",
	notRequester: "jede andere Person",
	unknown: "unbekannt",
};

const step = (s: Partial<ApprovalStep>): ApprovalStep => ({
	order: 1,
	approverRule: s.approvers?.[0] ?? "",
	...s,
});

describe("ruleKnown", () => {
	it("kennt Funktionen, Grund- und eigene Rollen, Personen", () => {
		expect(ruleKnown("function:isb_ciso", known, "approver")).toBe(true);
		expect(ruleKnown("function:astronaut", known, "approver")).toBe(false);
		expect(ruleKnown(`role:${ROLE_FIN}`, known, "approver")).toBe(true);
		expect(ruleKnown("role:editor", known, "approver")).toBe(true);
		expect(ruleKnown("role:missing", known, "approver")).toBe(false);
		expect(ruleKnown(`user:${USER_A}`, known, "approver")).toBe(true);
		expect(ruleKnown("user:fremd", known, "approver")).toBe(false);
	});

	it("Lesende geben nie frei, zählen aber für „Entfällt, wenn …“", () => {
		expect(ruleKnown("role:viewer", known, "approver")).toBe(false);
		expect(ruleKnown("role:viewer", known, "skip")).toBe(true);
	});

	it("„jede andere Person“ nur als Freigebende — als Überspringen träfe sie immer", () => {
		expect(ruleKnown("not_requester", known, "approver")).toBe(true);
		expect(ruleKnown("not_requester", known, "skip")).toBe(false);
		expect(ruleKnown("owner_of_entity", known, "skip")).toBe(true);
	});
});

describe("conditionIssues", () => {
	const facts = TRIGGER_BY_KEY.get("provider.create")?.facts ?? [];

	it("akzeptiert passende Bedingungen", () => {
		expect(
			conditionIssues(
				[
					{ field: "criticality", op: "in", value: ["critical", "important"] },
					{ field: "isOutsourcing", op: "is_true" },
					{ field: "category", op: "neq", value: "cloud" },
				],
				facts,
				"conditions",
			),
		).toEqual([]);
	});

	it("meldet unbekannte Merkmale, falsche Vergleiche und Werte", () => {
		expect(
			conditionIssues(
				[
					{ field: "farbe", op: "eq", value: "rot" },
					{ field: "isIct", op: "gte", value: 1 },
					{ field: "criticality", op: "eq", value: "sehr" },
					{ field: "criticality", op: "in", value: [] },
				],
				facts,
				"conditions",
			).map((i) => i.code),
		).toEqual(["unknown_field", "bad_op", "bad_value", "bad_value"]);
	});

	it("Zahlen brauchen einen Zahlenwert", () => {
		const risk = TRIGGER_BY_KEY.get("risk.create")?.facts ?? [];
		expect(
			conditionIssues([{ field: "score", op: "gte", value: 12 }], risk, "c"),
		).toEqual([]);
		expect(
			conditionIssues(
				[{ field: "score", op: "gte", value: "12" }],
				risk,
				"c",
			)[0]?.code,
		).toBe("bad_value");
	});
});

describe("checkWorkflowDraft", () => {
	it("Beispiel Lieferant: Finanzen (entfällt bei Finanzen) → Recht + ISB", () => {
		expect(
			checkWorkflowDraft(
				{
					trigger: "provider.create",
					conditions: [],
					steps: [
						step({
							approvers: [`role:${ROLE_FIN}`],
							skipIf: [`role:${ROLE_FIN}`],
						}),
						step({
							order: 2,
							approvers: [`role:${ROLE_LAW}`, "function:isb_ciso"],
							mode: "all",
						}),
					],
				},
				known,
			),
		).toEqual([]);
	});

	it("meldet Auslöser ohne Anschluss, leere Stufen und unbekannte Stellen", () => {
		expect(
			checkWorkflowDraft(
				{ trigger: "control.signoff", conditions: [], steps: [] },
				known,
			),
		).toEqual([{ path: "trigger", code: "unknown_trigger" }]);
		expect(
			checkWorkflowDraft(
				{ trigger: "risk.create", conditions: [], steps: [] },
				known,
			),
		).toEqual([{ path: "steps", code: "no_steps" }]);
		expect(
			checkWorkflowDraft(
				{
					trigger: "risk.create",
					conditions: [],
					steps: [
						step({ approverRule: "" }),
						step({
							order: 2,
							approvers: ["role:geloescht"],
							skipIf: ["not_requester"],
							onlyIf: [{ field: "score", op: "is_true" }],
						}),
					],
				},
				known,
			),
		).toEqual([
			{ path: "steps.0.approvers", code: "no_approvers" },
			{ path: "steps.1.approvers", code: "unknown_rule" },
			{ path: "steps.1.skipIf", code: "unknown_rule" },
			{ path: "steps.1.onlyIf.0", code: "bad_op" },
		]);
	});
});

describe("Beschriftung", () => {
	it("ruleLabel nennt Funktion, Rolle, Person, Verantwortliche:r", () => {
		expect(ruleLabel("function:isb_ciso", names)).toBe("ISB");
		expect(ruleLabel(`role:${ROLE_FIN}`, names)).toBe("Finanzen");
		expect(ruleLabel("role:owner", names)).toBe("Inhaber:in");
		expect(ruleLabel(`user:${USER_A}`, names)).toBe("Anna");
		expect(ruleLabel("owner_of_entity", names)).toBe("Verantwortliche:r");
		expect(ruleLabel("role:geloescht", names)).toBe("unbekannt");
	});

	it("stepApproversText: „und“ bei alle, „oder“ bei eine Person", () => {
		const words = { and: "und", or: "oder" };
		const approvers = [`role:${ROLE_LAW}`, "function:isb_ciso"];
		expect(
			stepApproversText(
				{ approverRule: approvers[0] ?? "", approvers, mode: "all" },
				names,
				words,
			),
		).toBe("Recht und ISB");
		expect(
			stepApproversText(
				{ approverRule: approvers[0] ?? "", approvers, mode: "any" },
				names,
				words,
			),
		).toBe("Recht oder ISB");
	});
});

describe("Vorlagen", () => {
	it("jede Vorlage hängt an einem angeschlossenen Auslöser und ist gültig", () => {
		for (const p of WORKFLOW_PRESETS) {
			expect(TRIGGER_BY_KEY.get(p.trigger)?.wired, p.key).toBe(true);
			const ids = Object.fromEntries(
				p.roles.map((r, i) => [
					r.key,
					`${i + 1}0000000-0000-4000-8000-000000000000`.slice(0, 36),
				]),
			);
			const steps = normalizeSteps(resolvePresetSteps(p, ids));
			const roleIds = new Set(Object.values(ids));
			expect(
				checkWorkflowDraft(
					{
						trigger: p.trigger,
						conditions: p.variant?.conditions ?? [],
						steps,
					},
					{ roleIds, userIds: new Set() },
				),
				p.key,
			).toEqual([]);
		}
	});

	it("Rollen der Vorlagen tragen nur vergebbare Rechte", () => {
		for (const p of WORKFLOW_PRESETS)
			for (const r of p.roles)
				expect(sanitizePermissions(r.permissions), `${p.key}/${r.key}`).toEqual(
					r.permissions,
				);
	});

	it("Lieferant: Finanzen entfällt für Einkäufer:in aus Finanzen, Recht + ISB beide", () => {
		const p = PRESET_BY_KEY.get("provider_departments");
		if (!p) throw new Error("preset missing");
		const steps = normalizeSteps(
			resolvePresetSteps(p, {
				purchasing: "r-buy",
				finance: "r-fin",
				legal: "r-law",
				infosec: "r-sec",
			}),
		);
		const requester = {
			userId: "u-buy",
			orgRole: "viewer" as const,
			functions: [],
			customRoleIds: ["r-buy", "r-fin"],
			canDecide: true,
		};
		const route = planRoute(steps, {
			requester,
			facts: {},
			candidates: [
				requester,
				{
					userId: "u-law",
					orgRole: "viewer" as const,
					functions: [],
					customRoleIds: ["r-law"],
					canDecide: true,
				},
				{
					userId: "u-sec",
					orgRole: "viewer" as const,
					functions: [],
					customRoleIds: ["r-sec"],
					canDecide: true,
				},
			],
			ctx: { requesterUserId: "u-buy" },
		});
		expect(route.steps[0]?.skipped).toEqual({
			by: "requester",
			rule: "role:r-fin",
		});
		expect(route.steps[1]?.mode).toBe("all");
		expect(route.firstOrder).toBe(2);
		expect(route.warnings).toEqual([]);
	});
});
