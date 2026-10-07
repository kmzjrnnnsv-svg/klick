import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	approvalDecisions,
	approvalRequests,
	approvalWorkflows,
	delegations,
	orgSettings,
	roleAssignments,
} from "@/db/schema";
import type { EntityKind, RoleFunction } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import type { OrgRole } from "@/lib/auth/permissions";
import { normalizeRole } from "@/lib/auth/session-rules";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	type ApproverCandidate,
	advance,
	approverEligibility,
	eligibleApprovers,
	slaDueAt,
	soloModeAllowed,
} from "./rules";

// Freigabe-Service (DB, innerhalb einer Org-Transaktion). Die reinen Regeln
// liegen in rules.ts; hier: Workflows je Org sicherstellen, Kandidaten aus
// Mitgliedern + role_assignments + Vertretungen auflösen, Anfrage anlegen,
// entscheiden, zurückziehen. Jede Entscheidung schreibt der Aufrufer ins Audit.

export async function ensureOrgWorkflows(
	tx: OrgTx,
	orgId: string,
	licenceStage: string,
): Promise<number> {
	const stage = Number.parseInt(licenceStage.charAt(0), 10) || 0;
	const existing = new Set(
		(
			await tx
				.select({ kind: approvalWorkflows.kind })
				.from(approvalWorkflows)
				.where(eq(approvalWorkflows.organizationId, orgId))
		).map((w) => w.kind),
	);
	let created = 0;
	for (const t of APPROVAL_WORKFLOW_TEMPLATES) {
		if (existing.has(t.kind)) continue;
		await tx.insert(approvalWorkflows).values({
			organizationId: orgId,
			entityType: t.entityType,
			kind: t.kind,
			name: t.name,
			steps: t.steps,
			enabled:
				t.defaultEnabled ||
				(t.enabledFromStage !== undefined && stage >= t.enabledFromStage),
		});
		created += 1;
	}
	return created;
}

export async function getWorkflow(tx: OrgTx, orgId: string, kind: string) {
	const [w] = await tx
		.select()
		.from(approvalWorkflows)
		.where(
			and(
				eq(approvalWorkflows.organizationId, orgId),
				eq(approvalWorkflows.kind, kind),
			),
		)
		.limit(1);
	return w ?? null;
}

// Alle Mitglieder als Kandidaten mit Org-Rolle und Funktionen (inkl. Vertretung
// einer Funktion über deputyUserId).
export async function loadCandidates(
	tx: OrgTx,
	orgId: string,
): Promise<ApproverCandidate[]> {
	const members = await tx
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const fns = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
		})
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId));
	const byUser = new Map<string, Set<RoleFunction>>();
	for (const f of fns) {
		for (const uid of [f.userId, f.deputyUserId]) {
			if (!uid) continue;
			const set = byUser.get(uid) ?? new Set<RoleFunction>();
			set.add(f.function);
			byUser.set(uid, set);
		}
	}
	return members.map((m) => ({
		userId: m.userId,
		orgRole: normalizeRole(m.role) as OrgRole,
		functions: [...(byUser.get(m.userId) ?? [])],
	}));
}

export async function activeDelegations(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
) {
	return tx
		.select({
			fromUserId: delegations.fromUserId,
			toUserId: delegations.toUserId,
		})
		.from(delegations)
		.where(
			and(
				eq(delegations.organizationId, orgId),
				eq(delegations.scope, "approvals"),
				lte(delegations.validFrom, now),
				gt(delegations.validUntil, now),
			),
		);
}

export type RequestApprovalInput = {
	kind: string;
	entityType: EntityKind;
	entityId: string;
	entityOwnerUserId?: string | null;
	entityVersionRef?: string | null;
	title: string;
	link: string;
	// Solo-Modus: begründete Selbstfreigabe
	selfApprovalReason?: string;
};

export type RequestApprovalResult =
	| {
			ok: true;
			requestId: string;
			status: "pending" | "approved";
			selfApproved: boolean;
			approverIds: string[];
	  }
	| {
			ok: false;
			error:
				| "workflow_disabled"
				| "no_approver"
				| "solo_reason_required"
				| "solo_not_allowed";
	  };

export async function requestApproval(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: RequestApprovalInput,
): Promise<RequestApprovalResult> {
	const wf = await getWorkflow(tx, ctx.orgId, input.kind);
	if (!wf?.enabled) return { ok: false, error: "workflow_disabled" };
	const steps = wf.steps as ApprovalStep[];
	const first = [...steps].sort((a, b) => a.order - b.order)[0];
	if (!first) return { ok: false, error: "workflow_disabled" };

	// Offene Anfrage derselben Entität zurückziehen (nur eine aktiv).
	await tx
		.update(approvalRequests)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequests.organizationId, ctx.orgId),
				eq(approvalRequests.entityType, input.entityType),
				eq(approvalRequests.entityId, input.entityId),
				eq(approvalRequests.status, "pending"),
			),
		);

	const candidates = await loadCandidates(tx, ctx.orgId);
	const dels = await activeDelegations(tx, ctx.orgId);
	const eligible = eligibleApprovers(first, candidates, {
		requesterUserId: ctx.userId,
		entityOwnerUserId: input.entityOwnerUserId ?? null,
		delegations: dels,
	});

	if (eligible.length === 0) {
		const [s] = await tx
			.select({
				allowSelfApproval: orgSettings.allowSelfApproval,
				licenceStage: orgSettings.licenceStage,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		const solo = soloModeAllowed({
			memberCount: candidates.length,
			allowSelfApproval: s?.allowSelfApproval ?? false,
			licenceStage: s?.licenceStage ?? "0_vorbereitung",
		});
		if (!solo) return { ok: false, error: "no_approver" };
		if (
			!input.selfApprovalReason ||
			input.selfApprovalReason.trim().length < 10
		) {
			return { ok: false, error: "solo_reason_required" };
		}
		const [req] = await tx
			.insert(approvalRequests)
			.values({
				organizationId: ctx.orgId,
				workflowId: wf.id,
				entityType: input.entityType,
				entityId: input.entityId,
				entityVersionRef: input.entityVersionRef ?? null,
				requestedByUserId: ctx.userId,
				currentStep: first.order,
				status: "approved",
				decidedAt: new Date(),
				selfApproved: true,
				selfApprovalReason: input.selfApprovalReason.trim(),
			})
			.returning({ id: approvalRequests.id });
		if (!req) throw new Error("insert failed");
		await tx.insert(approvalDecisions).values({
			organizationId: ctx.orgId,
			requestId: req.id,
			step: first.order,
			approverUserId: ctx.userId,
			decision: "approved",
			note: `Selbstfreigabe (Solo-Modus): ${input.selfApprovalReason.trim()}`,
		});
		return {
			ok: true,
			requestId: req.id,
			status: "approved",
			selfApproved: true,
			approverIds: [],
		};
	}

	const [req] = await tx
		.insert(approvalRequests)
		.values({
			organizationId: ctx.orgId,
			workflowId: wf.id,
			entityType: input.entityType,
			entityId: input.entityId,
			entityVersionRef: input.entityVersionRef ?? null,
			requestedByUserId: ctx.userId,
			currentStep: first.order,
			status: "pending",
			dueAt: slaDueAt(first, new Date()),
		})
		.returning({ id: approvalRequests.id });
	if (!req) throw new Error("insert failed");
	const approverIds = eligible.map((e) => e.userId);
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: approverIds,
		actorUserId: ctx.userId,
		kind: "approval_requested",
		title: `Freigabe angefragt: ${input.title}`,
		body: `${ctx.name} bittet um Freigabe (${wf.name}).`,
		link: `/heute/freigaben?request=${req.id}`,
		payload: { requestId: req.id, entityLink: input.link },
	});
	return {
		ok: true,
		requestId: req.id,
		status: "pending",
		selfApproved: false,
		approverIds,
	};
}

export type DecideResult =
	| {
			ok: true;
			status: "pending" | "approved" | "rejected" | "changes_requested";
			requesterUserId: string | null;
			entityType: EntityKind;
			entityId: string;
			onBehalfOf?: string;
	  }
	| {
			ok: false;
			error: "not_found" | "not_pending" | "four_eyes" | "rule_not_met";
	  };

export async function decide(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: {
		requestId: string;
		decision: "approved" | "rejected" | "changes_requested";
		note?: string;
		entityOwnerUserId?: string | null;
	},
): Promise<DecideResult> {
	const [req] = await tx
		.select()
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.id, input.requestId),
				eq(approvalRequests.organizationId, ctx.orgId),
			),
		)
		.limit(1);
	if (!req) return { ok: false, error: "not_found" };
	if (req.status !== "pending") return { ok: false, error: "not_pending" };
	const wf = await tx
		.select()
		.from(approvalWorkflows)
		.where(eq(approvalWorkflows.id, req.workflowId))
		.limit(1)
		.then((r) => r[0]);
	if (!wf) return { ok: false, error: "not_found" };
	const steps = wf.steps as ApprovalStep[];
	const step = steps.find((s) => s.order === req.currentStep);
	if (!step) return { ok: false, error: "not_found" };

	const candidates = await loadCandidates(tx, ctx.orgId);
	const me = candidates.find((c) => c.userId === ctx.userId);
	if (!me) return { ok: false, error: "rule_not_met" };
	const dels = await activeDelegations(tx, ctx.orgId);
	const elig = approverEligibility(
		step,
		me,
		{
			requesterUserId: req.requestedByUserId,
			entityOwnerUserId: input.entityOwnerUserId ?? null,
			delegations: dels,
		},
		candidates,
	);
	if (!elig.eligible) return { ok: false, error: elig.reason };

	await tx.insert(approvalDecisions).values({
		organizationId: ctx.orgId,
		requestId: req.id,
		step: req.currentStep,
		approverUserId: ctx.userId,
		decision: input.decision,
		note:
			[
				input.note?.trim(),
				elig.via === "delegation"
					? `(in Vertretung für ${elig.onBehalfOf})`
					: null,
			]
				.filter(Boolean)
				.join(" ") || null,
	});
	const decisionsOnStep = await tx
		.select({ decision: approvalDecisions.decision })
		.from(approvalDecisions)
		.where(
			and(
				eq(approvalDecisions.requestId, req.id),
				eq(approvalDecisions.step, req.currentStep),
			),
		);
	const outcome = advance(steps, req.currentStep, decisionsOnStep);

	if (outcome.status === "pending") {
		const nextStep = steps.find((s) => s.order === outcome.nextStep) ?? step;
		await tx
			.update(approvalRequests)
			.set({
				currentStep: outcome.nextStep,
				dueAt:
					outcome.nextStep !== req.currentStep
						? slaDueAt(nextStep, new Date())
						: req.dueAt,
			})
			.where(eq(approvalRequests.id, req.id));
		if (outcome.nextStep !== req.currentStep) {
			const nextEligible = eligibleApprovers(nextStep, candidates, {
				requesterUserId: req.requestedByUserId,
				entityOwnerUserId: input.entityOwnerUserId ?? null,
				delegations: dels,
			});
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: nextEligible.map((e) => e.userId),
				actorUserId: ctx.userId,
				kind: "approval_requested",
				title: `Freigabe angefragt (Stufe ${outcome.nextStep}): ${wf.name}`,
				link: `/heute/freigaben?request=${req.id}`,
			});
		}
	} else {
		await tx
			.update(approvalRequests)
			.set({ status: outcome.status, decidedAt: new Date() })
			.where(eq(approvalRequests.id, req.id));
	}
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: [req.requestedByUserId],
		actorUserId: ctx.userId,
		kind: "approval_decided",
		title: `${ctx.name}: ${input.decision === "approved" ? "freigegeben" : input.decision === "rejected" ? "abgelehnt" : "Änderungen angefragt"} — ${wf.name}`,
		body: input.note?.trim() || undefined,
		link: `/heute/freigaben?request=${req.id}`,
	});
	return {
		ok: true,
		status: outcome.status,
		requesterUserId: req.requestedByUserId,
		entityType: req.entityType,
		entityId: req.entityId,
		onBehalfOf: elig.via === "delegation" ? elig.onBehalfOf : undefined,
	};
}

export async function withdraw(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	requestId: string,
): Promise<boolean> {
	const res = await tx
		.update(approvalRequests)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequests.id, requestId),
				eq(approvalRequests.organizationId, ctx.orgId),
				eq(approvalRequests.requestedByUserId, ctx.userId),
				eq(approvalRequests.status, "pending"),
			),
		)
		.returning({ id: approvalRequests.id });
	return res.length > 0;
}

export type PendingForUser = {
	id: string;
	kind: string;
	workflowName: string;
	entityType: EntityKind;
	entityId: string;
	requestedByUserId: string | null;
	requestedByName: string | null;
	requestedAt: Date;
	currentStep: number;
	dueAt: Date | null;
	overdue: boolean;
	eligible: boolean;
	mine: boolean;
};

// Posteingang: wartet auf mich · von mir angefragt · überfällig.
export async function listRequestsForUser(
	tx: OrgTx,
	orgId: string,
	userId: string,
	opts: { includeDecided?: boolean } = {},
): Promise<PendingForUser[]> {
	const rows = await tx
		.select({
			req: approvalRequests,
			kind: approvalWorkflows.kind,
			workflowName: approvalWorkflows.name,
			steps: approvalWorkflows.steps,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			opts.includeDecided
				? eq(approvalRequests.organizationId, orgId)
				: and(
						eq(approvalRequests.organizationId, orgId),
						eq(approvalRequests.status, "pending"),
					),
		)
		.orderBy(desc(approvalRequests.requestedAt))
		.limit(200);
	const candidates = await loadCandidates(tx, orgId);
	const me = candidates.find((c) => c.userId === userId);
	const dels = await activeDelegations(tx, orgId);
	const requesterIds = [
		...new Set(
			rows
				.map((r) => r.req.requestedByUserId)
				.filter((x): x is string => Boolean(x)),
		),
	];
	const names = new Map(
		requesterIds.length === 0
			? []
			: (
					await tx
						.select({ id: user.id, name: user.name })
						.from(user)
						.where(inArray(user.id, requesterIds))
				).map((u) => [u.id, u.name] as const),
	);
	const now = new Date();
	return rows.map(({ req, kind, workflowName, steps }) => {
		const step = (steps as ApprovalStep[]).find(
			(s) => s.order === req.currentStep,
		);
		const eligible =
			req.status === "pending" && step && me
				? approverEligibility(
						step,
						me,
						{ requesterUserId: req.requestedByUserId, delegations: dels },
						candidates,
					).eligible
				: false;
		return {
			id: req.id,
			kind,
			workflowName,
			entityType: req.entityType,
			entityId: req.entityId,
			requestedByUserId: req.requestedByUserId,
			requestedByName: req.requestedByUserId
				? (names.get(req.requestedByUserId) ?? null)
				: null,
			requestedAt: req.requestedAt,
			currentStep: req.currentStep,
			dueAt: req.dueAt,
			overdue:
				req.status === "pending" && req.dueAt !== null && req.dueAt < now,
			eligible,
			mine: req.requestedByUserId === userId,
		};
	});
}

export async function latestRequestFor(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityId: string,
) {
	const [row] = await tx
		.select({
			req: approvalRequests,
			workflowName: approvalWorkflows.name,
			steps: approvalWorkflows.steps,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, entityType),
				eq(approvalRequests.entityId, entityId),
			),
		)
		.orderBy(desc(approvalRequests.requestedAt))
		.limit(1);
	if (!row) return null;
	const decisions = await tx
		.select()
		.from(approvalDecisions)
		.where(eq(approvalDecisions.requestId, row.req.id))
		.orderBy(approvalDecisions.decidedAt);
	return {
		...row.req,
		workflowName: row.workflowName,
		steps: row.steps as ApprovalStep[],
		decisions,
	};
}
