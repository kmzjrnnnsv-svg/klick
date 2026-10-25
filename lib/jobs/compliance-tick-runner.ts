import {
	and,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { globalDb } from "@/db";
import { member, organization, user } from "@/db/auth-schema";
import {
	accessTokens,
	approvalRequests,
	approvalWorkflows,
	assessments,
	assets,
	controlImplementations,
	controls,
	controlTests,
	cryptoAlerts,
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
	objectives,
	obligationRuns,
	obligations,
	products,
	providers,
	regulatorInteractions,
	securityEngagements,
	securityFindings,
	tasks,
	trainingAssignments,
	trainingRequirements,
	walletKeyHolders,
	walletLinks,
	wallets,
} from "@/db/schema";
import { entityOwnersOf, ownerKey } from "@/lib/approvals/entity-owner";
import { eligibleApprovers } from "@/lib/approvals/rules";
import {
	activeDelegations,
	loadCandidates,
	requestSteps,
} from "@/lib/approvals/service";
import { audit } from "@/lib/audit";
import { normalizeRole } from "@/lib/auth/guards";
import { cycleDates } from "@/lib/compliance/audit-follow-up";
import { OBLIGATION_BY_CODE } from "@/lib/compliance/catalog/obligations";
import { upcomingLegalChanges } from "@/lib/compliance/catalog/regulatory-calendar";
import { functionRecipients } from "@/lib/compliance/function-holders-service";
import { syncOwnersAndNotify } from "@/lib/compliance/function-owners";
import {
	computeIncidentDeadlines,
	leadRegime,
} from "@/lib/compliance/incident";
import { planObligationRuns } from "@/lib/compliance/obligations-service";
import { shortFrameworkName } from "@/lib/compliance/page-data";
import { getOrgProfile } from "@/lib/compliance/queries";
import { loadAuditRegimeContext } from "@/lib/compliance/queries-audit-regimes";
import { lastReconciliationDay } from "@/lib/custody/queries";
import { forEachOrg, type OrgTx } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { syncMemberRoles } from "@/lib/org/member-role-sync";
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
			// einmal am Tag (03:00 UTC): Verantwortliche über Funktionen abgleichen,
			// falls eine Änderung an role_assignments den Abgleich verpasst hat
			// und die Rechte eigener Rollen aus den Bestellungen (ADR-024)
			if (now.getUTCHours() === 3) {
				await syncOwnersAndNotify(tx, orgId, null);
				for (const entry of await syncMemberRoles(tx, orgId, null))
					await audit(
						tx,
						{ userId: null },
						{ ...entry, organizationId: orgId },
					);
			}
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
			ownSteps: approvalRequests.steps,
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
	let owners = new Map<string, string | null>();
	if (pendingApprovals.length > 0) {
		candidates = await loadCandidates(tx, orgId);
		dels = await activeDelegations(tx, orgId, now);
		owners = await entityOwnersOf(tx, orgId, pendingApprovals);
	}
	const approvals = pendingApprovals.map((a) => {
		const step = requestSteps({ steps: a.ownSteps }, a.steps).find(
			(s) => s.order === a.currentStep,
		);
		const eligible = step
			? eligibleApprovers(step, candidates, {
					requesterUserId: a.requestedByUserId,
					entityOwnerUserId:
						owners.get(ownerKey(a.entityType, a.entityId)) ?? null,
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
		const regime = leadRegime(inc.regimes);
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
			classification: inc.classification,
			classifiedAt: inc.classifiedAt,
			managementAcknowledgedAt: inc.managementAcknowledgedAt,
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
			planDueAt: nonconformities.planDueAt,
			correctiveAction: nonconformities.correctiveAction,
		})
		.from(nonconformities)
		.where(
			and(
				eq(nonconformities.organizationId, orgId),
				ne(nonconformities.status, "closed"),
			),
		);
	// Audittermine je Rahmenwerk aus dem Turnus (ohne die im Register)
	const auditCtx = await loadAuditRegimeContext(tx, orgId);
	const auditCycles = cycleDates(
		profile?.frameworks ?? [],
		auditCtx.settings,
		now.toISOString().slice(0, 10),
		auditCtx.registered,
		4,
	).planned.map((p) => ({
		framework: shortFrameworkName(p.framework),
		kind: p.kind,
		label: p.label,
		date: p.date,
	}));
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
	const findingRows = await tx
		.select({
			id: securityFindings.id,
			title: securityFindings.title,
			severity: securityFindings.severity,
			status: securityFindings.status,
			dueAt: securityFindings.dueAt,
			acceptedUntil: securityFindings.acceptedUntil,
			ownerUserId: securityFindings.ownerUserId,
		})
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.organizationId, orgId),
				or(
					eq(securityFindings.status, "accepted"),
					and(
						inArray(securityFindings.status, ["open", "in_progress"]),
						inArray(securityFindings.severity, ["critical", "high"]),
					),
				),
			),
		);
	const objectiveRows = await tx
		.select({
			id: objectives.id,
			title: objectives.title,
			nextMeasureAt: objectives.nextMeasureAt,
			approvalStatus: objectives.approvalStatus,
			status: objectives.status,
			ownerUserId: objectives.ownerUserId,
		})
		.from(objectives)
		.where(
			and(
				eq(objectives.organizationId, orgId),
				isNotNull(objectives.nextMeasureAt),
			),
		);
	const assetRows = await tx
		.select({
			id: assets.id,
			name: assets.name,
			status: assets.status,
			endOfLifeAt: assets.endOfLifeAt,
			supportEndAt: assets.supportEndAt,
			maintenanceUntil: assets.maintenanceUntil,
			ownerUserId: assets.ownerUserId,
		})
		.from(assets)
		.where(
			and(
				eq(assets.organizationId, orgId),
				eq(assets.status, "active"),
				or(
					isNotNull(assets.endOfLifeAt),
					isNotNull(assets.supportEndAt),
					isNotNull(assets.maintenanceUntil),
				),
			),
		);
	const walletRows = await tx
		.select({
			id: wallets.id,
			code: wallets.code,
			name: wallets.name,
			purpose: wallets.purpose,
			technology: wallets.technology,
			status: wallets.status,
			nextBackupTestDue: wallets.nextBackupTestDue,
			ownerUserId: wallets.ownerUserId,
		})
		.from(wallets)
		.where(
			and(eq(wallets.organizationId, orgId), eq(wallets.status, "active")),
		);
	const custody =
		walletRows.length > 0
			? {
					wallets: walletRows,
					holders: (
						await tx
							.select({
								id: walletKeyHolders.id,
								walletId: walletKeyHolders.walletId,
								userName: user.name,
								externalName: walletKeyHolders.externalName,
								until: walletKeyHolders.until,
								status: walletKeyHolders.status,
							})
							.from(walletKeyHolders)
							.leftJoin(user, eq(user.id, walletKeyHolders.userId))
							.where(
								and(
									eq(walletKeyHolders.organizationId, orgId),
									eq(walletKeyHolders.status, "active"),
									isNotNull(walletKeyHolders.until),
								),
							)
					).map((h) => ({
						id: h.id,
						walletId: h.walletId,
						name: h.userName || h.externalName || "—",
						until: h.until,
						status: h.status,
					})),
					lastReconciliationDay: await lastReconciliationDay(tx, orgId),
				}
			: undefined;
	const linkRows = await tx
		.select({
			id: walletLinks.id,
			name: walletLinks.name,
			walletOrgId: walletLinks.walletOrgId,
			createdAt: walletLinks.createdAt,
			lastHeartbeatAt: walletLinks.lastHeartbeatAt,
			lastDayClosed: walletLinks.lastDayClosed,
			sanctionsList: walletLinks.sanctionsList,
			tokenExpiresAt: accessTokens.expiresAt,
		})
		.from(walletLinks)
		.leftJoin(accessTokens, eq(accessTokens.id, walletLinks.tokenId))
		.where(
			and(
				eq(walletLinks.organizationId, orgId),
				eq(walletLinks.status, "active"),
			),
		);
	const walletLinkRows =
		linkRows.length > 0
			? {
					links: linkRows,
					openAlerts: await tx
						.select({
							id: cryptoAlerts.id,
							title: cryptoAlerts.title,
							raisedAt: cryptoAlerts.raisedAt,
						})
						.from(cryptoAlerts)
						.where(
							and(
								eq(cryptoAlerts.organizationId, orgId),
								isNull(cryptoAlerts.resolvedAt),
							),
						),
				}
			: undefined;
	const productRows = await tx
		.select({
			id: products.id,
			code: products.code,
			name: products.name,
			supportUntil: products.supportUntil,
			status: products.status,
			ownerUserId: products.ownerUserId,
		})
		.from(products)
		.where(
			and(eq(products.organizationId, orgId), isNotNull(products.supportUntil)),
		);
	const engagementRows = await tx
		.select({
			id: securityEngagements.id,
			code: securityEngagements.code,
			title: securityEngagements.title,
			status: securityEngagements.status,
			endAt: securityEngagements.endAt,
			retestDueAt: securityEngagements.retestDueAt,
			ownerUserId: securityEngagements.ownerUserId,
		})
		.from(securityEngagements)
		.where(
			and(
				eq(securityEngagements.organizationId, orgId),
				inArray(securityEngagements.status, [
					"authorized",
					"in_progress",
					"delivered",
					"retest",
				]),
			),
		);
	const supplierRows = await tx
		.select({
			id: assessments.id,
			code: assessments.code,
			title: assessments.title,
			providerId: assessments.subjectId,
			status: assessments.status,
			dueAt: assessments.dueAt,
			ownerUserId: assessments.ownerUserId,
			sentAt: sql<Date | null>`min(${accessTokens.createdAt})`,
			lastOpenedAt: sql<Date | null>`max(${accessTokens.lastUsedAt})`,
		})
		.from(assessments)
		.innerJoin(
			accessTokens,
			and(
				eq(accessTokens.subjectId, assessments.id),
				eq(accessTokens.kind, "supplier_portal"),
				isNull(accessTokens.revokedAt),
			),
		)
		.where(
			and(
				eq(assessments.organizationId, orgId),
				eq(assessments.kind, "supplier"),
				inArray(assessments.status, ["draft", "in_progress"]),
			),
		)
		.groupBy(assessments.id);
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
		managementIds: await functionRecipients(tx, orgId, "management_body"),
		acknowledgements,
		obligationRuns: runRows,
		legalChanges,
		auditCycles,
		nonconformities: ncRows.map(({ correctiveAction, ...n }) => ({
			...n,
			hasPlan: Boolean(correctiveAction),
		})),
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
		products: productRows,
		assets: assetRows,
		custody,
		walletLinks: walletLinkRows,
		objectives: objectiveRows,
		securityFindings: findingRows,
		supplierAssessments: supplierRows,
		engagements: engagementRows,
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
		} else if (a.type === "reopen_finding") {
			const [before] = await tx
				.select({
					status: securityFindings.status,
					acceptedUntil: securityFindings.acceptedUntil,
				})
				.from(securityFindings)
				.where(
					and(
						eq(securityFindings.id, a.id),
						eq(securityFindings.organizationId, orgId),
					),
				)
				.limit(1);
			if (!before || before.status !== "accepted") continue;
			await tx
				.update(securityFindings)
				.set({
					status: "open",
					acceptedUntil: null,
					statusNote: "Akzeptanz abgelaufen",
				})
				.where(eq(securityFindings.id, a.id));
			await audit(
				tx,
				{ userId: null },
				{
					organizationId: orgId,
					action: "security.finding_acceptance_expired",
					target: `security_finding:${a.id}`,
					before,
					after: { status: "open" },
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
