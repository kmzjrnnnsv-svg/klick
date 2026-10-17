import type { RoleFunction } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import type { OrgRole } from "@/lib/auth/permissions";

// Freigabe-Regeln — reine Funktionen (getestet). Die DB-Aktionen in
// app/actions/approvals.ts bauen darauf auf.
//
// approverRule je Stufe:
//   function:<role_function>  Person hält die Funktion (role_assignments, inkl. Vertretung)
//   role:<orgRole>            Org-Rolle (owner/editor/…)
//   user:<id>                 konkrete Person
//   owner_of_entity           Owner der Entität
//   not_requester             jede Person ausser Antragsteller:in
// Immer: Vier-Augen (Freigeber:in ≠ Antragsteller:in), ausser Solo-Modus.

export type ApproverCandidate = {
	userId: string;
	orgRole: OrgRole;
	functions: readonly RoleFunction[];
	// Rolle darf Freigaben entscheiden (approval:decide) — Lesend/Prüfer:in
	// nicht, auch wenn sie eine Funktion halten. Fehlt = ja (reine Tests).
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
	| { eligible: true; via: "direct" | "delegation"; onBehalfOf?: string }
	| { eligible: false; reason: "four_eyes" | "rule_not_met" };

export function parseRule(rule: string): { kind: string; value: string } {
	const idx = rule.indexOf(":");
	if (idx < 0) return { kind: rule, value: "" };
	return { kind: rule.slice(0, idx), value: rule.slice(idx + 1) };
}

function matchesRule(
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
				(value === "editor" && candidate.orgRole === "owner")
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
	if (candidate.canDecide === false)
		return { eligible: false, reason: "rule_not_met" };
	if (matchesRule(step.approverRule, candidate, ctx)) {
		return { eligible: true, via: "direct" };
	}
	for (const d of ctx.delegations ?? []) {
		if (d.toUserId !== candidate.userId) continue;
		if (d.fromUserId === ctx.requesterUserId) continue; // Vertretung des Antragstellers hilft nicht
		const principal = allMembers.find((m) => m.userId === d.fromUserId);
		if (principal && matchesRule(step.approverRule, principal, ctx)) {
			return { eligible: true, via: "delegation", onBehalfOf: d.fromUserId };
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

// Nächster Zustand nach einer Entscheidung auf der aktuellen Stufe.
export function advance(
	steps: readonly ApprovalStep[],
	currentStep: number,
	decisionsOnStep: readonly {
		decision: "approved" | "rejected" | "changes_requested";
	}[],
): RequestOutcome {
	if (decisionsOnStep.some((d) => d.decision === "rejected"))
		return { status: "rejected" };
	if (decisionsOnStep.some((d) => d.decision === "changes_requested")) {
		return { status: "changes_requested" };
	}
	const step = steps.find((s) => s.order === currentStep);
	const required = step?.minApprovers ?? 1;
	const approvals = decisionsOnStep.filter(
		(d) => d.decision === "approved",
	).length;
	if (approvals < required) return { status: "pending", nextStep: currentStep };
	const next = steps
		.map((s) => s.order)
		.filter((o) => o > currentStep)
		.sort((a, b) => a - b)[0];
	if (next === undefined) return { status: "approved" };
	return { status: "pending", nextStep: next };
}

// ── Eigner-Stufe und unbesetzbare Stufen ───────────────────────────────────

export type SkippedStep = {
	order: number;
	reason: "no_owner" | "owner_left" | "owner_is_requester";
};

// Nächste Stufe ab `fromOrder` (inklusive), die wirklich entschieden werden
// muss. owner_of_entity entfällt, wenn es keine Eigner:in gibt, sie nicht mehr
// Mitglied ist oder selbst eingereicht hat — Einreichen ist ihre Zustimmung;
// sonst bliebe die Stufe wegen Vier-Augen für immer unbesetzt.
// order null = keine Stufe mehr offen (Anfrage ist damit freigegeben).
export function effectiveStep(
	steps: readonly ApprovalStep[],
	fromOrder: number,
	ctx: {
		requesterUserId: string | null;
		entityOwnerUserId: string | null;
		memberIds: readonly string[];
	},
): { order: number | null; skipped: SkippedStep[] } {
	const skipped: SkippedStep[] = [];
	const ordered = [...steps]
		.filter((s) => s.order >= fromOrder)
		.sort((a, b) => a.order - b.order);
	for (const s of ordered) {
		if (s.approverRule === "owner_of_entity") {
			const owner = ctx.entityOwnerUserId;
			if (!owner) {
				skipped.push({ order: s.order, reason: "no_owner" });
				continue;
			}
			if (!ctx.memberIds.includes(owner)) {
				skipped.push({ order: s.order, reason: "owner_left" });
				continue;
			}
			if (owner === ctx.requesterUserId) {
				skipped.push({ order: s.order, reason: "owner_is_requester" });
				continue;
			}
		}
		return { order: s.order, skipped };
	}
	return { order: null, skipped };
}

// Erste Stufe ab `fromOrder`, für die niemand entscheiden darf — z. B. weil
// die Funktion „Compliance“ unbesetzt ist. Beim Einreichen geprüft, damit die
// Anfrage nicht unbemerkt auf Stufe 3 hängen bleibt.
export function firstUnfillableStep(
	steps: readonly ApprovalStep[],
	fromOrder: number,
	members: readonly ApproverCandidate[],
	ctx: EligibilityContext,
): ApprovalStep | null {
	let order: number | null = fromOrder;
	while (order !== null) {
		const eff = effectiveStep(steps, order, {
			requesterUserId: ctx.requesterUserId,
			entityOwnerUserId: ctx.entityOwnerUserId ?? null,
			memberIds: members.map((m) => m.userId),
		});
		if (eff.order === null) return null;
		const step = steps.find((s) => s.order === eff.order);
		if (!step) return null;
		if (eligibleApprovers(step, members, ctx).length === 0) return step;
		const next = steps
			.map((s) => s.order)
			.filter((o) => o > step.order)
			.sort((a, b) => a - b)[0];
		order = next ?? null;
	}
	return null;
}

// Wer darf die aktuelle Stufe einer offenen Anfrage entscheiden? (für „wartet
// auf Anna, Ben“ in der Freigabe-Leiste)
export function waitingApprovers(
	request: {
		status: string;
		currentStep: number;
		steps: readonly ApprovalStep[];
	},
	members: readonly ApproverCandidate[],
	ctx: EligibilityContext,
): ApproverCandidate[] {
	if (request.status !== "pending") return [];
	const step = request.steps.find((s) => s.order === request.currentStep);
	return step ? eligibleApprovers(step, members, ctx) : [];
}

// Startklar? Je Stufe eines Workflows: wer könnte grundsätzlich entscheiden
// (ohne konkrete Anfrage). Eigner-Stufen hängen am Gegenstand („dynamic“),
// „andere Person“ braucht zwei Personen mit Freigaberecht.
export type StepReadiness = {
	order: number;
	rule: string;
	state: "ok" | "empty" | "dynamic";
	approverIds: string[];
};

export function workflowReadiness(
	steps: readonly ApprovalStep[],
	members: readonly ApproverCandidate[],
): StepReadiness[] {
	const deciders = members.filter((m) => m.canDecide !== false);
	return [...steps]
		.sort((a, b) => a.order - b.order)
		.map((step) => {
			const { kind } = parseRule(step.approverRule);
			if (kind === "owner_of_entity")
				return {
					order: step.order,
					rule: step.approverRule,
					state: "dynamic",
					approverIds: [],
				};
			const ids =
				kind === "not_requester"
					? deciders.map((m) => m.userId)
					: deciders
							.filter((m) =>
								matchesRule(step.approverRule, m, { requesterUserId: null }),
							)
							.map((m) => m.userId);
			const enough =
				kind === "not_requester" ? ids.length >= 2 : ids.length >= 1;
			return {
				order: step.order,
				rule: step.approverRule,
				state: enough ? "ok" : "empty",
				approverIds: ids,
			};
		});
}

// Funktionen, nach denen die (aktiven) Workflows fragen.
export function approvalFunctions(
	workflows: readonly { steps: readonly ApprovalStep[] }[],
): Set<string> {
	const out = new Set<string>();
	for (const w of workflows)
		for (const s of w.steps) {
			const { kind, value } = parseRule(s.approverRule);
			if (kind === "function") out.add(value);
		}
	return out;
}
