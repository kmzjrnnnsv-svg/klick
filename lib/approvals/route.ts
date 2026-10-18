import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import {
	type ApproverCandidate,
	type EligibilityContext,
	eligibleApprovers,
	firstActiveStep,
	matchesRule,
	stepRules,
} from "./rules";
import { triggerOf } from "./triggers";

// Freigabe-Designer — pure. Welcher Ablauf gilt (Bedingungen, Priorität),
// welche Stufen für diesen Antrag entfallen (anfragende Person, Fakten) und
// wo niemand entscheiden könnte. Ergebnis ist der Schnappschuss am Antrag.

export type Facts = Readonly<Record<string, unknown>>;

export function conditionHolds(c: ApprovalCondition, facts: Facts): boolean {
	const v = facts[c.field];
	switch (c.op) {
		case "is_true":
			return v === true;
		case "is_false":
			return v === false;
		case "eq":
			return v !== undefined && v !== null && String(v) === String(c.value);
		case "neq":
			return v !== undefined && v !== null && String(v) !== String(c.value);
		case "in":
			return (
				Array.isArray(c.value) &&
				v !== undefined &&
				v !== null &&
				c.value.includes(String(v))
			);
		case "gte":
			return typeof v === "number" && v >= Number(c.value);
		case "lte":
			return typeof v === "number" && v <= Number(c.value);
		default:
			return false;
	}
}

export function matchConditions(
	conditions: readonly ApprovalCondition[] | null | undefined,
	facts: Facts,
): boolean {
	return (conditions ?? []).every((c) => conditionHolds(c, facts));
}

export type WorkflowLike = {
	kind: string;
	trigger?: string | null;
	enabled: boolean;
	conditions?: readonly ApprovalCondition[] | null;
	priority?: number | null;
	custom?: boolean | null;
};

// Aktiver Ablauf eines Auslösers: Varianten (höhere Priorität, eigene
// Bedingungen) vor dem Standard; der erste, dessen Bedingungen passen.
export function selectWorkflow<W extends WorkflowLike>(
	workflows: readonly W[],
	trigger: string,
	facts: Facts,
): W | null {
	const candidates = workflows
		.filter((w) => w.enabled && triggerOf(w) === trigger)
		.sort(
			(a, b) =>
				(b.priority ?? 0) - (a.priority ?? 0) ||
				Number(Boolean(b.custom)) - Number(Boolean(a.custom)),
		);
	return candidates.find((w) => matchConditions(w.conditions, facts)) ?? null;
}

export type RouteWarning = {
	order: number;
	kind: "no_approver";
	// Stelle ohne mögliche Freigebende (bei „alle“ je Stelle)
	rule?: string;
};

export type PlannedRoute = {
	steps: ApprovalStep[];
	firstOrder: number | null;
	warnings: RouteWarning[];
};

// Schnappschuss eines Antrags: entfallende Stufen markieren, Lücken melden.
export function planRoute(
	steps: readonly ApprovalStep[],
	input: {
		requester: ApproverCandidate | null;
		facts: Facts;
		candidates: readonly ApproverCandidate[];
		ctx: EligibilityContext;
	},
): PlannedRoute {
	const planned: ApprovalStep[] = [...steps]
		.sort((a, b) => a.order - b.order)
		.map((s) => {
			const { skipped: _drop, ...step } = s;
			if (step.onlyIf && !matchConditions(step.onlyIf, input.facts))
				return { ...step, skipped: { by: "condition" as const } };
			const hit = input.requester
				? (step.skipIf ?? []).find((rule) =>
						matchesRule(rule, input.requester as ApproverCandidate, input.ctx),
					)
				: undefined;
			if (hit)
				return { ...step, skipped: { by: "requester" as const, rule: hit } };
			return step;
		});
	const warnings: RouteWarning[] = [];
	for (const s of planned) {
		if (s.skipped) continue;
		if (s.mode === "all" && stepRules(s).length > 1) {
			for (const rule of stepRules(s)) {
				const one = { ...s, approvers: [rule], approverRule: rule };
				if (eligibleApprovers(one, input.candidates, input.ctx).length === 0)
					warnings.push({ order: s.order, kind: "no_approver", rule });
			}
		} else if (eligibleApprovers(s, input.candidates, input.ctx).length === 0) {
			warnings.push({ order: s.order, kind: "no_approver" });
		}
	}
	return { steps: planned, firstOrder: firstActiveStep(planned), warnings };
}

// Stufen aus dem Designer normalisieren: fortlaufende Ordnung, approverRule
// = erste Stelle (Kurzanzeige/Altbestand), leere Felder weg.
export function normalizeSteps(steps: readonly ApprovalStep[]): ApprovalStep[] {
	return [...steps]
		.sort((a, b) => a.order - b.order)
		.map((s, i) => {
			const approvers = (s.approvers?.length ? s.approvers : [s.approverRule])
				.map((r) => r.trim())
				.filter(Boolean);
			const out: ApprovalStep = {
				order: i + 1,
				approverRule: approvers[0] ?? s.approverRule,
			};
			if (approvers.length > 1) {
				out.approvers = approvers;
				out.mode = s.mode === "all" ? "all" : "any";
			}
			if (s.minApprovers && s.minApprovers > 1)
				out.minApprovers = s.minApprovers;
			if (s.slaDays && s.slaDays > 0) out.slaDays = s.slaDays;
			if (s.label?.trim()) out.label = s.label.trim();
			if (s.skipIf?.length) out.skipIf = [...s.skipIf];
			if (s.onlyIf?.length) out.onlyIf = [...s.onlyIf];
			return out;
		});
}
