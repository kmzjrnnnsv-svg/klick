import type { RoleFunction } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import type { OrgRole } from "@/lib/auth/permissions";

// Freigabe-Regeln — reine Funktionen (getestet). Die DB-Aktionen in
// app/actions/approvals.ts bauen darauf auf.
//
// approverRule je Stufe:
//   function:<role_function>  Person hält die Funktion (role_assignments, inkl. Vertretung)
//   role:<orgRole|roleId>     Grundrolle (owner/editor/…) oder eigene Rolle (ADR-020)
//   user:<id>                 konkrete Person
//   owner_of_entity           Owner der Entität
//   not_requester             jede Person ausser Antragsteller:in
// Immer: Vier-Augen (Freigeber:in ≠ Antragsteller:in), ausser Solo-Modus.

export type ApproverCandidate = {
	userId: string;
	orgRole: OrgRole;
	functions: readonly RoleFunction[];
	// eigene Rollen (ADR-020); Stufe role:<id> trifft sie
	customRoleIds?: readonly string[];
	// Recht „Freigaben entscheiden“ (approval:decide); fehlt es, zählt die
	// Person nie als Freigeber:in — auch nicht über Funktion oder Vertretung
	canDecide?: boolean;
};

export type EligibilityContext = {
	requesterUserId: string | null;
	entityOwnerUserId?: string | null;
	// aktive Vertretungen: fromUserId → toUserId
	delegations?: readonly { fromUserId: string; toUserId: string }[];
	now?: Date;
};

export type Eligibility =
	| {
			eligible: true;
			via: "direct" | "delegation";
			onBehalfOf?: string;
			// Stellen der Stufe, für die die Person entscheiden kann
			rules: string[];
	  }
	| { eligible: false; reason: "four_eyes" | "rule_not_met" };

// Stellen einer Stufe: approvers (Designer) oder die eine Regel (Altbestand)
export function stepRules(step: ApprovalStep): string[] {
	return step.approvers && step.approvers.length > 0
		? step.approvers
		: [step.approverRule];
}

export function parseRule(rule: string): { kind: string; value: string } {
	const idx = rule.indexOf(":");
	if (idx < 0) return { kind: rule, value: "" };
	return { kind: rule.slice(0, idx), value: rule.slice(idx + 1) };
}

export function matchesRule(
	rule: string,
	candidate: ApproverCandidate,
	ctx: EligibilityContext,
): boolean {
	const { kind, value } = parseRule(rule);
	switch (kind) {
		case "function":
			return candidate.functions.includes(value as RoleFunction);
		case "role":
			return (
				candidate.orgRole === value ||
				(value === "editor" && candidate.orgRole === "owner") ||
				(candidate.customRoleIds ?? []).includes(value)
			);
		case "user":
			return candidate.userId === value;
		case "owner_of_entity":
			return (
				Boolean(ctx.entityOwnerUserId) &&
				candidate.userId === ctx.entityOwnerUserId
			);
		case "not_requester":
			return candidate.userId !== ctx.requesterUserId;
		default:
			return false;
	}
}

// Darf die Person über diese Stufe entscheiden? Vier-Augen zuerst, dann
// Regel direkt, dann über eine aktive Vertretung einer berechtigten Person.
export function approverEligibility(
	step: ApprovalStep,
	candidate: ApproverCandidate,
	ctx: EligibilityContext,
	allMembers: readonly ApproverCandidate[] = [],
): Eligibility {
	if (ctx.requesterUserId && candidate.userId === ctx.requesterUserId) {
		return { eligible: false, reason: "four_eyes" };
	}
	if (candidate.canDecide === false) {
		return { eligible: false, reason: "rule_not_met" };
	}
	const rules = stepRules(step);
	const direct = rules.filter((r) => matchesRule(r, candidate, ctx));
	if (direct.length > 0) {
		return { eligible: true, via: "direct", rules: direct };
	}
	for (const d of ctx.delegations ?? []) {
		if (d.toUserId !== candidate.userId) continue;
		if (d.fromUserId === ctx.requesterUserId) continue; // Vertretung des Antragstellers hilft nicht
		const principal = allMembers.find((m) => m.userId === d.fromUserId);
		const via = principal
			? rules.filter((r) => matchesRule(r, principal, ctx))
			: [];
		if (via.length > 0) {
			return {
				eligible: true,
				via: "delegation",
				onBehalfOf: d.fromUserId,
				rules: via,
			};
		}
	}
	return { eligible: false, reason: "rule_not_met" };
}

export function eligibleApprovers(
	step: ApprovalStep,
	members: readonly ApproverCandidate[],
	ctx: EligibilityContext,
): ApproverCandidate[] {
	return members.filter(
		(m) => approverEligibility(step, m, ctx, members).eligible,
	);
}

// Solo-Modus: Org mit einer Person kann Vier-Augen nicht erfüllen. Erlaubt
// ist eine begründete Selbstfreigabe (audit: approval.self_approved), sofern
// die Org es zulässt und die Lizenzstufe < 2 ist (ZAG-MaRisk verbietet es).
export function soloModeAllowed(input: {
	memberCount: number;
	allowSelfApproval: boolean;
	licenceStage: string;
}): boolean {
	const stage = Number.parseInt(input.licenceStage.charAt(0), 10);
	return input.memberCount <= 1 && input.allowSelfApproval && stage < 2;
}

export function slaDueAt(step: ApprovalStep, from: Date): Date | null {
	if (!step.slaDays || step.slaDays <= 0) return null;
	return new Date(from.getTime() + step.slaDays * 86_400_000);
}

export type StepProgress = {
	step: number;
	required: number;
	approvals: number;
	rejected: boolean;
	changesRequested: boolean;
};

export type RequestOutcome =
	| { status: "pending"; nextStep: number }
	| { status: "approved" }
	| { status: "rejected" }
	| { status: "changes_requested" };

// Erste bzw. nächste Stufe, die nicht entfällt (Schnappschuss mit skipped)
export function firstActiveStep(steps: readonly ApprovalStep[]): number | null {
	return nextActiveStep(steps, Number.NEGATIVE_INFINITY);
}

export function nextActiveStep(
	steps: readonly ApprovalStep[],
	after: number,
): number | null {
	const next = steps
		.filter((s) => !s.skipped && s.order > after)
		.map((s) => s.order)
		.sort((a, b) => a - b)[0];
	return next ?? null;
}

// Ist die Stufe erfüllt? „any“: genug verschiedene Personen; „all“: jede
// Stelle hat genug verschiedene Zustimmungen.
export function stepSatisfied(
	step: ApprovalStep,
	decisionsOnStep: readonly {
		decision: "approved" | "rejected" | "changes_requested";
		rule?: string | null;
		approverUserId?: string | null;
	}[],
): boolean {
	const required = step.minApprovers ?? 1;
	const approvals = decisionsOnStep.filter((d) => d.decision === "approved");
	const distinct = (list: typeof approvals) =>
		new Set(list.map((d, i) => d.approverUserId ?? `#${i}`)).size;
	if (step.mode === "all" && stepRules(step).length > 1) {
		return stepRules(step).every(
			(rule) => distinct(approvals.filter((d) => d.rule === rule)) >= required,
		);
	}
	return distinct(approvals) >= required;
}

// Offene Stellen einer Stufe im Modus „alle“ (für Anzeige und Zuordnung)
export function openRules(
	step: ApprovalStep,
	decisionsOnStep: readonly {
		decision: "approved" | "rejected" | "changes_requested";
		rule?: string | null;
	}[],
): string[] {
	if (step.mode !== "all") return [];
	const required = step.minApprovers ?? 1;
	return stepRules(step).filter(
		(rule) =>
			decisionsOnStep.filter(
				(d) => d.decision === "approved" && d.rule === rule,
			).length < required,
	);
}

// Nächster Zustand nach einer Entscheidung auf der aktuellen Stufe.
export function advance(
	steps: readonly ApprovalStep[],
	currentStep: number,
	decisionsOnStep: readonly {
		decision: "approved" | "rejected" | "changes_requested";
		rule?: string | null;
		approverUserId?: string | null;
	}[],
): RequestOutcome {
	if (decisionsOnStep.some((d) => d.decision === "rejected"))
		return { status: "rejected" };
	if (decisionsOnStep.some((d) => d.decision === "changes_requested")) {
		return { status: "changes_requested" };
	}
	const step = steps.find((s) => s.order === currentStep);
	if (step && !stepSatisfied(step, decisionsOnStep))
		return { status: "pending", nextStep: currentStep };
	const next = nextActiveStep(steps, currentStep);
	if (next === null) return { status: "approved" };
	return { status: "pending", nextStep: next };
}
