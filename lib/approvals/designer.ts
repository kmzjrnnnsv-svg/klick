import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import { parseRule, stepRules } from "./rules";
import { type FactDef, TRIGGER_BY_KEY } from "./triggers";

// Freigabe-Designer — pure. Prüft Entwürfe gegen den Auslöser (Bedingungen
// passen zu seinen Fakten, Stellen existieren in der Organisation) und
// beschriftet Regeln für Vorschau, Probelauf, Freigabe-Leiste und Posteingang.

// Grundrollen, die freigeben dürfen (approval:decide); als „Entfällt, wenn …“
// zählen alle Grundrollen
export const APPROVER_BASE_ROLES = ["owner", "editor"] as const;
const BASE_ROLES = ["owner", "editor", "viewer", "auditor", "consultant"];

export const OPS_BY_TYPE: Readonly<
	Record<FactDef["type"], readonly ApprovalCondition["op"][]>
> = {
	enum: ["eq", "neq", "in"],
	boolean: ["is_true", "is_false"],
	number: ["gte", "lte", "eq"],
};

export type DraftKnown = {
	roleIds: ReadonlySet<string>;
	userIds: ReadonlySet<string>;
};

export type DraftIssue = {
	path: string;
	code:
		| "unknown_trigger"
		| "unknown_field"
		| "bad_op"
		| "bad_value"
		| "no_steps"
		| "no_approvers"
		| "unknown_rule";
};

// Stelle bekannt? Freigebende: alle Arten; „Entfällt, wenn …“ ohne
// not_requester (träfe immer zu).
export function ruleKnown(
	rule: string,
	known: DraftKnown,
	use: "approver" | "skip",
): boolean {
	const { kind, value } = parseRule(rule);
	switch (kind) {
		case "function":
			return (ROLE_FUNCTIONS as readonly string[]).includes(value);
		case "role":
			return (
				known.roleIds.has(value) ||
				(use === "approver"
					? (APPROVER_BASE_ROLES as readonly string[]).includes(value)
					: BASE_ROLES.includes(value))
			);
		case "user":
			return known.userIds.has(value);
		case "owner_of_entity":
			return value === "";
		case "not_requester":
			return value === "" && use === "approver";
		default:
			return false;
	}
}

export function conditionIssues(
	conditions: readonly ApprovalCondition[],
	facts: readonly FactDef[],
	path: string,
): DraftIssue[] {
	const issues: DraftIssue[] = [];
	conditions.forEach((c, i) => {
		const at = `${path}.${i}`;
		const def = facts.find((f) => f.key === c.field);
		if (!def) {
			issues.push({ path: at, code: "unknown_field" });
			return;
		}
		if (!OPS_BY_TYPE[def.type].includes(c.op)) {
			issues.push({ path: at, code: "bad_op" });
			return;
		}
		const v = c.value;
		const ok =
			def.type === "boolean"
				? true
				: def.type === "number"
					? typeof v === "number" && Number.isFinite(v)
					: c.op === "in"
						? Array.isArray(v) &&
							v.length > 0 &&
							v.every((x) => def.options.includes(x))
						: typeof v === "string" && def.options.includes(v);
		if (!ok) issues.push({ path: at, code: "bad_value" });
	});
	return issues;
}

export function checkWorkflowDraft(
	draft: {
		trigger: string;
		conditions: readonly ApprovalCondition[];
		steps: readonly ApprovalStep[];
	},
	known: DraftKnown,
): DraftIssue[] {
	const def = TRIGGER_BY_KEY.get(draft.trigger);
	if (!def?.wired) return [{ path: "trigger", code: "unknown_trigger" }];
	const issues = conditionIssues(draft.conditions, def.facts, "conditions");
	if (draft.steps.length === 0)
		issues.push({ path: "steps", code: "no_steps" });
	draft.steps.forEach((s, i) => {
		const rules = stepRules(s).filter(Boolean);
		if (rules.length === 0)
			issues.push({ path: `steps.${i}.approvers`, code: "no_approvers" });
		if (rules.some((r) => !ruleKnown(r, known, "approver")))
			issues.push({ path: `steps.${i}.approvers`, code: "unknown_rule" });
		if ((s.skipIf ?? []).some((r) => !ruleKnown(r, known, "skip")))
			issues.push({ path: `steps.${i}.skipIf`, code: "unknown_rule" });
		issues.push(
			...conditionIssues(s.onlyIf ?? [], def.facts, `steps.${i}.onlyIf`),
		);
	});
	return issues;
}

// Namen für Regeln (Funktionen, Grund- und eigene Rollen, Personen)
export type RuleNames = {
	functions: Readonly<Record<string, string>>;
	roles: Readonly<Record<string, string>>;
	users: Readonly<Record<string, string>>;
	ownerOfEntity: string;
	notRequester: string;
	unknown: string;
};

export function ruleLabel(rule: string, names: RuleNames): string {
	const { kind, value } = parseRule(rule);
	switch (kind) {
		case "function":
			return names.functions[value] ?? value;
		case "role":
			return names.roles[value] ?? names.unknown;
		case "user":
			return names.users[value] ?? names.unknown;
		case "owner_of_entity":
			return names.ownerOfEntity;
		case "not_requester":
			return names.notRequester;
		default:
			return rule;
	}
}

// Stellen einer Stufe als Text: „Recht und Informationssicherheit“ (alle)
// bzw. „Recht oder Informationssicherheit“ (eine Person)
export function stepApproversText(
	step: Pick<ApprovalStep, "approverRule" | "approvers" | "mode">,
	names: RuleNames,
	words: { and: string; or: string },
): string {
	const labels = stepRules(step).map((r) => ruleLabel(r, names));
	if (labels.length <= 1) return labels[0] ?? "";
	const joiner = step.mode === "all" ? words.and : words.or;
	return `${labels.slice(0, -1).join(", ")} ${joiner} ${labels.at(-1)}`;
}
