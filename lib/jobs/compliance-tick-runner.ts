import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { member, organization, user } from "@/db/auth-schema";
import {
	approvalRequests,
	approvalWorkflows,
	controlImplementations,
	controls,
	controlTests,
	dataSubjectRequests,
	documentAcknowledgements,
	documents,
	documentVersions,
	evidence,
	exceptions,
	incidents,
	insurancePolicies,
	memberAccess,
	nonconformities,
	notifications,
	obligationRuns,
	obligations,
	providers,
	regulatorInteractions,
	tasks,
	trainingAssignments,
	trainingRequirements,
} from "@/db/schema";
import type { ApprovalStep } from "@/db/schema/grc";
import { eligibleApprovers } from "@/lib/approvals/rules";
import { activeDelegations, loadCandidates } from "@/lib/approvals/service";
import { audit } from "@/lib/audit";
import { normalizeRole } from "@/lib/auth/guards";
import { OBLIGATION_BY_CODE } from "@/lib/compliance/catalog/obligations";
import { upcomingLegalChanges } from "@/lib/compliance/catalog/regulatory-calendar";
import { computeIncidentDeadlines } from "@/lib/compliance/incident";
import { planObligationRuns } from "@/lib/compliance/obligations-service";
import { getOrgProfile } from "@/lib/compliance/queries";
import { forEachOrg, type OrgTx } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import {
	collectDueItems,
	DEDUPE_HOURS,
	type DueRows,
	dedupeNotifications,
	type TickResult,
} from "./compliance-tick";

// Runner des stündlichen compliance-tick: lädt je Org (eigener RLS-Kontext)
// die fälligen Zeilen, ruft die pure Ableitung auf und schreibt
// Benachrichtigungen (dedupliziert), Aufgaben und Status-Übergänge. Jede
// Status-Änderung steht mit before/after im Audit-Log (Akteur: System).

export type TickSummary = {
	orgs: number;
	notifications: number;
	tasks: number;
	actions: number;
};

export async function runComplianceTick(
	now = new Date(),
): Promise<TickSummary> {
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	const summary: TickSummary = {
		orgs: orgs.length,
		notifications: 0,
		tasks: 0,
		actions: 0,
	};
	await forEachOrg(
		orgs.map((o) => o.id),
		async (tx, orgId) => {
			const rows = await loadDueRows(tx, orgId, now);
			const result = collectDueItems(now, rows);
			const written = await applyTick(tx, orgId, now, result);
			summary.notifications += written.notifications;
			summary.tasks += written.tasks;
			summary.actions += written.actions;
		},
	);
	logger.info(summary, "compliance-tick done");
	return summary;
}

async function loadDueRows(
	tx: OrgTx,
	orgId: string,
	now: Date,
): Promise<DueRows> {
	const members = await tx
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const orgOwnerIds = members
		.filter((m) => normalizeRole(m.role) === "owner")
		.map((m) => m.userId);

	const controlReviews = await tx
		.select({
			code: controls.code,
			title: controls.title,
			nextReviewAt: controlImplementations.nextReviewAt,
			ownerUserId: controlImplementations.ownerUserId,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				isNotNull(controlImplementations.nextReviewAt),
				ne(controlImplementations.status, "not_applicable"),
			),
		);

	const documentReviews = await tx
		.select({
			docNumber: documents.docNumber,
			title: documents.title,
			nextReviewAt: documents.nextReviewAt,
			ownerUserId: documents.ownerUserId,
		})
		.from(documents)
		.where(
			and(
				eq(documents.organizationId, orgId),
				isNotNull(documents.nextReviewAt),
				inArray(documents.status, ["approved", "published"]),
			),
		);

	const providerAssessments = await tx
		.select({
			id: providers.id,
			name: providers.name,
			nextAssessmentAt: providers.nextAssessmentAt,
			ownerUserId: providers.ownerUserId,
		})
		.from(providers)
		.where(
			and(
				eq(providers.organizationId, orgId),
				isNotNull(providers.nextAssessmentAt),
			),
		);

	const evidenceExpiring = await tx
		.select({
			id: evidence.id,
			title: evidence.title,
			validUntil: evidence.validUntil,
			createdByUserId: evidence.createdByUserId,
		})
		.from(evidence)
		.where(
			and(eq(evidence.organizationId, orgId), isNotNull(evidence.validUntil)),
		);

	// Freigaben: nur pending mit SLA; berechtigte Freigeber über die Regeln.
	const pendingApprovals = await tx
		.select({
			id: approvalRequests.id,
			kind: approvalWorkflows.kind,
			steps: approvalWorkflows.steps,
			currentStep: approvalRequests.currentStep,
			entityType: approvalRequests.entityType,
			entityId: approvalRequests.entityId,
			dueAt: approvalRequests.dueAt,
			requestedByUserId: approvalRequests.requestedByUserId,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.status, "pending"),
				isNotNull(approvalRequests.dueAt),
			),
		);
	let candidates: Awaited<ReturnType<typeof loadCandidates>> = [];
	let dels: Awaited<ReturnType<typeof activeDelegations>> = [];
	if (pendingApprovals.length > 0) {
		candidates = await loadCandidates(tx, orgId);
		dels = await activeDelegations(tx, orgId, now);
	}
	const approvals = pendingApprovals.map((a) => {
		const step = (a.steps as ApprovalStep[]).find(
			(s) => s.order === a.currentStep,
		);
		const eligible = step
			? eligibleApprovers(step, candidates, {
					requesterUserId: a.requestedByUserId,
					delegations: dels,
					now,
				}).map((c) => c.userId)
			: [];
		return {
			id: a.id,
			kind: a.kind,
			entityType: a.entityType,
			entityId: a.entityId,
			entityLabel: null,
			dueAt: a.dueAt,
			requestedByUserId: a.requestedByUserId,
			eligibleApproverIds: eligible,
		};
	});

	const exceptionRows = await tx
		.select({
			id: exceptions.id,
			title: exceptions.title,
			status: exceptions.status,
			validUntil: exceptions.validUntil,
			ownerUserId: exceptions.ownerUserId,
		})
		.from(exceptions)
		.where(
			and(
				eq(exceptions.organizationId, orgId),
				inArray(exceptions.status, ["requested", "approved"]),
			),
		);

	const assignments = await tx
		.select({
			id: trainingAssignments.id,
			userId: trainingAssignments.userId,
			dueAt: trainingAssignments.dueAt,
			status: trainingAssignments.status,
			requirementTitle: trainingRequirements.title,
		})
		.from(trainingAssignments)
		.innerJoin(
			trainingRequirements,
			eq(trainingRequirements.id, trainingAssignments.requirementId),
		)
		.where(
			and(
				eq(trainingAssignments.organizationId, orgId),
				ne(trainingAssignments.status, "done"),
			),
		);

	const openIncidents = await tx
		.select()
		.from(incidents)
		.where(
			and(eq(incidents.organizationId, orgId), ne(incidents.status, "closed")),
		);
	const incidentRows = openIncidents.map((inc) => {
		const regime = inc.regimes[0];
		const labels = regime
			? computeIncidentDeadlines(regime, {
					awareAt: inc.awareAt,
					classifiedAt: inc.classifiedAt,
					initialReportedAt: inc.initialReportedAt,
					intermediateReportedAt: inc.intermediateReportedAt,
				}).labels
			: { initial: "Meldung", intermediate: null, final: null };
		const clocks = [
			{
				label: labels.initial,
				dueAt: inc.initialDueAt,
				reportedAt: inc.initialReportedAt,
			},
			...(labels.intermediate
				? [
						{
							label: labels.intermediate,
							dueAt: inc.intermediateDueAt,
							reportedAt: inc.intermediateReportedAt,
						},
					]
				: []),
			...(labels.final
				? [
						{
							label: labels.final,
							dueAt: inc.finalDueAt,
							reportedAt: inc.finalReportedAt,
						},
					]
				: []),
		];
		return {
			id: inc.id,
			code: inc.code,
			title: inc.title,
			ownerUserId: inc.ownerUserId,
			status: inc.status,
			clocks,
		};
	});

	// Kenntnisnahmen: veröffentlichte Dokumente, aktuelle Version, fehlende
	// Bestätigungen je Mitglied laut Verteilung.
	const published = await tx
		.select({
			id: documents.id,
			docNumber: documents.docNumber,
			title: documents.title,
			version: documents.version,
			distribution: documents.distribution,
		})
		.from(documents)
		.where(
			and(
				eq(documents.organizationId, orgId),
				eq(documents.status, "published"),
			),
		);
	let acknowledgements: DueRows["acknowledgements"] = [];
	if (published.length > 0) {
		const versions = await tx
			.select({
				id: documentVersions.id,
				documentId: documentVersions.documentId,
				version: documentVersions.version,
				publishedAt: documentVersions.publishedAt,
			})
			.from(documentVersions)
			.where(
				inArray(
					documentVersions.documentId,
					published.map((d) => d.id),
				),
			);
		const acks = await tx
			.select({
				versionId: documentAcknowledgements.documentVersionId,
				userId: documentAcknowledgements.userId,
			})
			.from(documentAcknowledgements)
			.where(eq(documentAcknowledgements.organizationId, orgId));
		acknowledgements = published.flatMap((d) => {
			const v = versions.find(
				(x) => x.documentId === d.id && x.version === d.version,
			);
			if (!v) return [];
			const audience = members
				.filter((m) => {
					const role = normalizeRole(m.role);
					return (
						d.distribution.length === 0 ||
						d.distribution.includes("all") ||
						d.distribution.includes(role)
					);
				})
				.map((m) => m.userId);
			const done = new Set(
				acks.filter((a) => a.versionId === v.id).map((a) => a.userId),
			);
			return [
				{
					docNumber: d.docNumber,
					title: d.title,
					publishedAt: v.publishedAt,
					missingUserIds: audience.filter((u) => !done.has(u)),
				},
			];
		});
	}

	const openTasks = await tx
		.select({
			entityType: tasks.entityType,
			entityId: tasks.entityId,
			sourceKind: tasks.sourceKind,
		})
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, orgId),
				ne(tasks.status, "done"),
				inArray(tasks.sourceKind, [
					"escalation",
					"review",
					"acknowledgement",
					"obligation",
				]),
			),
		);

	// Pflichten-Läufe zwölf Monate voraus planen (idempotent), dann fällige lesen
	const profile = await getOrgProfile(tx, orgId);
	await planObligationRuns(
		tx,
		orgId,
		now,
		new Date(now.getTime() + 366 * 86_400_000),
		OBLIGATION_BY_CODE,
	);
	const runRows = await tx
		.select({
			id: obligationRuns.id,
			code: obligations.code,
			title: obligations.title,
			dueAt: obligationRuns.dueAt,
			status: obligationRuns.status,
			leadDays: obligations.leadDays,
			ownerUserId: obligations.ownerUserId,
		})
		.from(obligationRuns)
		.innerJoin(obligations, eq(obligations.id, obligationRuns.obligationId))
		.where(
			and(
				eq(obligationRuns.organizationId, orgId),
				inArray(obligationRuns.status, ["upcoming", "due", "overdue"]),
				eq(obligations.active, true),
			),
		);
	const legalChanges = upcomingLegalChanges(now, 190, profile?.frameworks).map(
		(c) => ({ date: c.date, title: c.title }),
	);
	const ncRows = await tx
		.select({
			id: nonconformities.id,
			code: nonconformities.code,
			title: nonconformities.title,
			status: nonconformities.status,
			dueAt: nonconformities.dueAt,
			effectivenessCheckAt: nonconformities.effectivenessCheckAt,
			effectivenessResult: nonconformities.effectivenessResult,
			ownerUserId: nonconformities.ownerUserId,
		})
		.from(nonconformities)
		.where(
			and(
				eq(nonconformities.organizationId, orgId),
				ne(nonconformities.status, "closed"),
			),
		);
	let tlpt: DueRows["tlpt"] = null;
	if (profile?.profile.tlptDesignated) {
		const tests = await tx
			.select({ testedAt: controlTests.testedAt })
			.from(controlTests)
			.where(
				and(
					eq(controlTests.organizationId, orgId),
					eq(controlTests.method, "tlpt"),
					isNotNull(controlTests.testedAt),
				),
			);
		const last = tests
			.map((t) => t.testedAt)
			.filter((d): d is Date => d !== null)
			.sort((a, b) => b.getTime() - a.getTime())[0];
		tlpt = { designated: true, lastTlptAt: last ?? null };
	}
	const regulatorDeadlines = await tx
		.select({
			id: regulatorInteractions.id,
			subject: regulatorInteractions.subject,
			deadline: regulatorInteractions.deadline,
			status: regulatorInteractions.status,
			ownerUserId: regulatorInteractions.ownerUserId,
		})
		.from(regulatorInteractions)
		.where(
			and(
				eq(regulatorInteractions.organizationId, orgId),
				eq(regulatorInteractions.status, "open"),
				isNotNull(regulatorInteractions.deadline),
			),
		);
	const dsrRows = await tx
		.select({
			id: dataSubjectRequests.id,
			type: dataSubjectRequests.type,
			dueAt: dataSubjectRequests.dueAt,
			extendedUntil: dataSubjectRequests.extendedUntil,
			status: dataSubjectRequests.status,
			ownerUserId: dataSubjectRequests.ownerUserId,
		})
		.from(dataSubjectRequests)
		.where(
			and(
				eq(dataSubjectRequests.organizationId, orgId),
				inArray(dataSubjectRequests.status, ["open", "in_progress"]),
			),
		);
	const insuranceRows = await tx
		.select({
			id: insurancePolicies.id,
			type: insurancePolicies.type,
			insurer: insurancePolicies.insurer,
			validUntil: insurancePolicies.validUntil,
			ownerUserId: insurancePolicies.ownerUserId,
		})
		.from(insurancePolicies)
		.where(
			and(
				eq(insurancePolicies.organizationId, orgId),
				isNotNull(insurancePolicies.validUntil),
			),
		);
	const accessRows = await tx
		.select({
			memberId: memberAccess.memberId,
			userId: member.userId,
			userName: user.name,
			accessUntil: memberAccess.accessUntil,
		})
		.from(memberAccess)
		.innerJoin(member, eq(member.id, memberAccess.memberId))
		.innerJoin(user, eq(user.id, member.userId))
		.where(
			and(
				eq(memberAccess.organizationId, orgId),
				isNotNull(memberAccess.accessUntil),
			),
		);

	return {
		orgOwnerIds,
		controlReviews,
		documentReviews,
		providerAssessments,
		evidenceExpiring,
		approvals,
		exceptions: exceptionRows,
		trainingAssignments: assignments,
		incidents: incidentRows,
		acknowledgements,
		obligationRuns: runRows,
		legalChanges,
		nonconformities: ncRows,
		tlpt,
		regulatorDeadlines,
		accessExpiring: accessRows.map((a) => ({
			memberId: a.memberId,
			userId: a.userId,
			userName: a.userName,
			accessUntil: a.accessUntil as Date,
		})),
		dataSubjectRequests: dsrRows,
		insurancePolicies: insuranceRows,
		openTasks,
	};
}

async function applyTick(
	tx: OrgTx,
	orgId: string,
	now: Date,
	result: TickResult,
): Promise<{ notifications: number; tasks: number; actions: number }> {
	let written = { notifications: 0, tasks: 0, actions: 0 };

	// Dedupe: gleiche dedupeKey je Empfänger innerhalb 24 h nur einmal.
	const since = new Date(now.getTime() - DEDUPE_HOURS * 3_600_000);
	const recentRows = await tx
		.select({ userId: notifications.userId, payload: notifications.payload })
		.from(notifications)
		.where(
			and(
				eq(notifications.organizationId, orgId),
				gte(notifications.createdAt, since),
				sql`${notifications.payload}->>'dedupeKey' is not null`,
			),
		);
	const recent = new Set(
		recentRows
			.map((r) => {
				const key = (r.payload as { dedupeKey?: unknown } | null)?.dedupeKey;
				return typeof key === "string" ? `${r.userId}:${key}` : null;
			})
			.filter((x): x is string => x !== null),
	);
	const toSend = dedupeNotifications(result.notifications, recent);
	const values = toSend.flatMap((n) =>
		n.recipients.map((userId) => ({
			organizationId: orgId,
			userId,
			kind: n.kind,
			title: n.title,
			body: n.body ?? null,
			link: n.link,
			payload: { dedupeKey: n.dedupeKey, job: "compliance-tick" },
		})),
	);
	if (values.length > 0) {
		await tx.insert(notifications).values(values);
		written = { ...written, notifications: values.length };
	}

	if (result.tasks.length > 0) {
		const inserted = await tx
			.insert(tasks)
			.values(
				result.tasks.map((t) => ({
					organizationId: orgId,
					title: t.title,
					description: t.description ?? null,
					assigneeUserId: t.assigneeUserId,
					createdByUserId: null,
					dueAt: t.dueAt,
					priority: t.priority,
					entityType: t.entityType,
					entityId: t.entityId,
					sourceKind: t.sourceKind,
				})),
			)
			.returning({
				id: tasks.id,
				title: tasks.title,
				assignee: tasks.assigneeUserId,
			});
		written = { ...written, tasks: inserted.length };
		for (const t of inserted) {
			await audit(
				tx,
				{ userId: null },
				{
					organizationId: orgId,
					action: "task.created",
					target: `task:${t.id}`,
					after: { title: t.title, source: "compliance-tick" },
				},
			);
			if (t.assignee) {
				await tx.insert(notifications).values({
					organizationId: orgId,
					userId: t.assignee,
					kind: "task_assigned",
					title: t.title,
					link: "/heute/aufgaben",
					payload: { taskId: t.id, job: "compliance-tick" },
				});
			}
		}
	}

	for (const a of result.actions) {
		if (a.type === "expire_exception") {
			const [before] = await tx
				.select({ status: exceptions.status })
				.from(exceptions)
				.where(
					and(eq(exceptions.id, a.id), eq(exceptions.organizationId, orgId)),
				)
				.limit(1);
			if (!before) continue;
			await tx
				.update(exceptions)
				.set({ status: "expired" })
				.where(eq(exceptions.id, a.id));
			await audit(
				tx,
				{ userId: null },
				{
					organizationId: orgId,
					action: "exception.expired",
					target: `exception:${a.id}`,
					before: { status: before.status },
					after: { status: "expired" },
				},
			);
			written = { ...written, actions: written.actions + 1 };
		} else if (a.type === "mark_run_due" || a.type === "mark_run_overdue") {
			await tx
				.update(obligationRuns)
				.set({ status: a.type === "mark_run_due" ? "due" : "overdue" })
				.where(
					and(
						eq(obligationRuns.id, a.id),
						eq(obligationRuns.organizationId, orgId),
					),
				);
			written = { ...written, actions: written.actions + 1 };
		} else if (a.type === "mark_training_overdue") {
			await tx
				.update(trainingAssignments)
				.set({ status: "overdue" })
				.where(
					and(
						eq(trainingAssignments.id, a.id),
						eq(trainingAssignments.organizationId, orgId),
						eq(trainingAssignments.status, "due"),
					),
				);
			written = { ...written, actions: written.actions + 1 };
		}
	}

	// Stille Ticks nicht auditieren — nur wenn etwas verändert wurde.
	if (written.tasks > 0 || written.actions > 0) {
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: "job.compliance_tick",
				target: `organization:${orgId}`,
				after: written,
			},
		);
	}
	return written;
}
