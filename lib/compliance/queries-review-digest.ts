import { and, desc, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import {
	amlMonitoringRules,
	amlRiskAnalyses,
	auditFindings,
	audits,
	complaints,
	contextIssues,
	dataSubjectRequests,
	decisionRequests,
	incidents,
	kpiMeasurements,
	managementReviews,
	nonconformities,
	objectives,
	obligationRuns,
	providerRatings,
	providers,
	regulatorInteractions,
	resolutions,
	risks,
	riskTreatments,
	securityFindings,
	suspiciousReports,
	tasks,
	trainingAssignments,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { orgRiskMethod } from "@/lib/org/queries";
import { applicableReviewInputs } from "./catalog/management-review-inputs";
import { upcomingLegalChanges } from "./catalog/regulatory-calendar";
import { indicatorState } from "./indicators";
import {
	type DigestData,
	digestPeriod,
	type ReviewDigest,
	reviewDigest,
} from "./management-review-digest";
import { shortFrameworkName } from "./page-data";
import { getOrgProfile } from "./queries";
import { loadReadiness } from "./queries-readiness";
import { loadRiskProposals } from "./queries-risk-sources";
import { assessRisk } from "./risk";

// Daten für die Zusammenfassung der Managementbewertung (B6). Zeitraum
// from–to (ISO-Datum); Bestände (offen, überfällig) gelten zum Stichtag to.
export async function loadReviewDigest(
	tx: OrgTx,
	orgId: string,
	period: { from: string; to: string },
	frameworks: readonly string[],
	now = new Date(),
): Promise<DigestData> {
	const { from, to } = period;
	const fromTs = new Date(`${from}T00:00:00Z`);
	const toTs = new Date(`${to}T23:59:59Z`);
	const inPeriod = (d: Date | string | null | undefined) => {
		if (!d) return false;
		const x =
			typeof d === "string" ? new Date(`${d.slice(0, 10)}T12:00:00Z`) : d;
		return x >= fromTs && x <= toTs;
	};

	const [
		res,
		reviewTasks,
		decisions,
		ctxIssues,
		ncs,
		objs,
		auditRows,
		findings,
		complaintRows,
		dsrRows,
		regulator,
		riskRows,
		treatments,
		incidentRows,
		secRows,
		providerRows,
		ratingRows,
		trainings,
		runs,
		method,
	] = await Promise.all([
		tx
			.select({
				number: resolutions.resolutionNumber,
				subject: resolutions.subject,
				date: resolutions.date,
			})
			.from(resolutions)
			.where(
				and(
					eq(resolutions.organizationId, orgId),
					gte(resolutions.date, from),
					lte(resolutions.date, to),
				),
			),
		tx
			.select({ status: tasks.status, dueAt: tasks.dueAt })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, orgId),
					inArray(tasks.entityType, ["management_review", "resolution"]),
				),
			),
		tx
			.select({
				code: decisionRequests.code,
				question: decisionRequests.question,
				dueAt: decisionRequests.dueAt,
				status: decisionRequests.status,
				decidedAt: decisionRequests.decidedAt,
			})
			.from(decisionRequests)
			.where(eq(decisionRequests.organizationId, orgId)),
		tx
			.select({
				title: contextIssues.title,
				scope: contextIssues.scope,
				updatedAt: contextIssues.updatedAt,
			})
			.from(contextIssues)
			.where(
				and(
					eq(contextIssues.organizationId, orgId),
					gte(contextIssues.updatedAt, fromTs),
				),
			),
		tx
			.select({
				id: nonconformities.id,
				code: nonconformities.code,
				title: nonconformities.title,
				status: nonconformities.status,
				dueAt: nonconformities.dueAt,
				effectivenessResult: nonconformities.effectivenessResult,
				createdAt: nonconformities.createdAt,
				updatedAt: nonconformities.updatedAt,
			})
			.from(nonconformities)
			.where(eq(nonconformities.organizationId, orgId)),
		tx
			.select()
			.from(objectives)
			.where(
				and(
					eq(objectives.organizationId, orgId),
					inArray(objectives.approvalStatus, ["approved", "proposed"]),
					ne(objectives.status, "dropped"),
				),
			),
		tx
			.select({
				id: audits.id,
				title: audits.title,
				performedAt: audits.performedAt,
			})
			.from(audits)
			.where(eq(audits.organizationId, orgId)),
		tx
			.select({
				severity: auditFindings.severity,
				status: auditFindings.status,
				createdAt: auditFindings.createdAt,
			})
			.from(auditFindings)
			.where(eq(auditFindings.organizationId, orgId)),
		tx
			.select({
				receivedAt: complaints.receivedAt,
				status: complaints.status,
			})
			.from(complaints)
			.where(eq(complaints.organizationId, orgId)),
		tx
			.select({
				receivedAt: dataSubjectRequests.receivedAt,
				dueAt: dataSubjectRequests.dueAt,
				extendedUntil: dataSubjectRequests.extendedUntil,
				status: dataSubjectRequests.status,
			})
			.from(dataSubjectRequests)
			.where(eq(dataSubjectRequests.organizationId, orgId)),
		tx
			.select({ date: regulatorInteractions.date })
			.from(regulatorInteractions)
			.where(
				and(
					eq(regulatorInteractions.organizationId, orgId),
					gte(regulatorInteractions.date, from),
					lte(regulatorInteractions.date, to),
				),
			),
		tx
			.select({
				id: risks.id,
				code: risks.code,
				title: risks.title,
				status: risks.status,
				likelihood: risks.likelihood,
				impact: risks.impact,
				residualLikelihood: risks.residualLikelihood,
				residualImpact: risks.residualImpact,
				acceptedAt: risks.acceptedAt,
			})
			.from(risks)
			.where(and(eq(risks.organizationId, orgId), ne(risks.status, "closed"))),
		tx
			.select({
				dueAt: riskTreatments.dueAt,
				taskStatus: tasks.status,
				taskDueAt: tasks.dueAt,
			})
			.from(riskTreatments)
			.leftJoin(tasks, eq(tasks.id, riskTreatments.taskId))
			.where(eq(riskTreatments.organizationId, orgId)),
		tx
			.select({
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
				awareAt: incidents.awareAt,
				classification: incidents.classification,
				initialReportedAt: incidents.initialReportedAt,
			})
			.from(incidents)
			.where(
				and(
					eq(incidents.organizationId, orgId),
					gte(incidents.awareAt, fromTs),
					lte(incidents.awareAt, toTs),
				),
			),
		tx
			.select({
				severity: securityFindings.severity,
				dueAt: securityFindings.dueAt,
			})
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.organizationId, orgId),
					inArray(securityFindings.status, ["open", "in_progress"]),
				),
			),
		tx
			.select({
				id: providers.id,
				name: providers.name,
				criticality: providers.criticality,
				isMaterial: providers.isMaterial,
				nextAssessmentAt: providers.nextAssessmentAt,
				status: providers.status,
			})
			.from(providers)
			.where(eq(providers.organizationId, orgId)),
		tx
			.select({
				providerId: providerRatings.providerId,
				traffic: providerRatings.traffic,
				completedAt: providerRatings.completedAt,
			})
			.from(providerRatings)
			.where(
				and(
					eq(providerRatings.organizationId, orgId),
					eq(providerRatings.status, "completed"),
				),
			),
		tx
			.select({
				dueAt: trainingAssignments.dueAt,
				completedAt: trainingAssignments.completedAt,
			})
			.from(trainingAssignments)
			.where(eq(trainingAssignments.organizationId, orgId)),
		tx
			.select({ status: obligationRuns.status, dueAt: obligationRuns.dueAt })
			.from(obligationRuns)
			.where(
				and(
					eq(obligationRuns.organizationId, orgId),
					gte(obligationRuns.dueAt, from),
					lte(obligationRuns.dueAt, to),
				),
			),
		orgRiskMethod(tx, orgId),
	]);

	const measurements =
		objs.length > 0
			? await tx
					.select({
						objectiveId: kpiMeasurements.objectiveId,
						measuredAt: kpiMeasurements.measuredAt,
						numericValue: kpiMeasurements.numericValue,
					})
					.from(kpiMeasurements)
					.where(
						inArray(
							kpiMeasurements.objectiveId,
							objs.map((o) => o.id),
						),
					)
			: [];
	const readiness = await loadReadiness(tx, orgId, { asOf: now });
	const proposals = await loadRiskProposals(tx, orgId, null, now);

	// Risiken nach Zone (wirksame Bewertung: Rest- vor Ausgangsrisiko)
	const zones = { acceptable: 0, tolerable: 0, unacceptable: 0 };
	const above: DigestData["risks"]["aboveAppetite"] = [];
	for (const r of riskRows) {
		const a = assessRisk(r, method);
		zones[a.effective.zone] += 1;
		if (a.aboveAppetite && r.status !== "accepted")
			above.push({ id: r.id, code: r.code, title: r.title });
	}
	const tStatus = treatments.map((x) => ({
		done: x.taskStatus === "done",
		due: x.taskDueAt ?? x.dueAt,
	}));

	const latestRating = new Map<string, "red" | "amber" | "green" | null>();
	for (const r of [...ratingRows].sort(
		(a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0),
	))
		latestRating.set(r.providerId, r.traffic);
	const activeProviders = providerRows.filter((p) => p.status !== "terminated");
	const providerItems: DigestData["providers"]["items"] = [];
	let red = 0;
	let yellow = 0;
	let overdueAssessments = 0;
	for (const p of activeProviders) {
		const traffic = latestRating.get(p.id) ?? null;
		const overdue = Boolean(p.nextAssessmentAt && p.nextAssessmentAt < to);
		if (traffic === "red") red += 1;
		if (traffic === "amber") yellow += 1;
		if (overdue) overdueAssessments += 1;
		if (traffic === "red" || overdue)
			providerItems.push({
				id: p.id,
				name: p.name,
				note: [
					traffic === "red" ? "Bewertung rot" : null,
					overdue && p.nextAssessmentAt
						? `Wiedervorlage seit ${p.nextAssessmentAt.split("-").reverse().join(".")}`
						: null,
				]
					.filter(Boolean)
					.join(" · "),
			});
	}

	// Geldwäsche nur mit GwG/AMLR — Zähler, keine Fälle
	const aml = frameworks.some((f) => f === "gwg" || f === "amlr")
		? await (async () => {
				const [analysis] = await tx
					.select({
						approvedAt: amlRiskAnalyses.approvedAt,
						nextReviewAt: amlRiskAnalyses.nextReviewAt,
					})
					.from(amlRiskAnalyses)
					.where(
						and(
							eq(amlRiskAnalyses.organizationId, orgId),
							eq(amlRiskAnalyses.status, "approved"),
						),
					)
					.orderBy(desc(amlRiskAnalyses.approvedAt))
					.limit(1);
				const cases = await tx
					.select({
						detectedAt: suspiciousReports.detectedAt,
						reportedAt: suspiciousReports.reportedAt,
						status: suspiciousReports.status,
					})
					.from(suspiciousReports)
					.where(eq(suspiciousReports.organizationId, orgId));
				const rules = await tx
					.select({ id: amlMonitoringRules.id })
					.from(amlMonitoringRules)
					.where(
						and(
							eq(amlMonitoringRules.organizationId, orgId),
							eq(amlMonitoringRules.status, "active"),
						),
					);
				return {
					asOf: to,
					analysis: analysis
						? {
								approvedAt: analysis.approvedAt?.toISOString() ?? null,
								nextReviewAt: analysis.nextReviewAt,
							}
						: null,
					casesInPeriod: cases.filter((c) => inPeriod(c.detectedAt)).length,
					reportedInPeriod: cases.filter((c) => inPeriod(c.reportedAt)).length,
					inReview: cases.filter((c) => c.status === "review").length,
					rulesActive: rules.length,
				};
			})()
		: undefined;

	const openFindings = { critical: 0, major: 0, minor: 0, observation: 0 };
	for (const f of findings)
		if (f.status !== "closed") openFindings[f.severity] += 1;

	return {
		previous: {
			resolutions: res
				.sort((a, b) => b.date.localeCompare(a.date))
				.map((r) => ({ number: r.number, subject: r.subject, date: r.date })),
			tasksOpen: reviewTasks.filter((x) => x.status !== "done").length,
			tasksDone: reviewTasks.filter((x) => x.status === "done").length,
			tasksOverdue: reviewTasks.filter(
				(x) => x.status !== "done" && x.dueAt !== null && x.dueAt < to,
			).length,
			decisionsOpen: decisions
				.filter((d) => d.status === "open")
				.map((d) => ({ code: d.code, question: d.question, dueAt: d.dueAt })),
			decisionsDecided: decisions.filter(
				(d) => d.status !== "open" && inPeriod(d.decidedAt),
			).length,
		},
		context: {
			changedIssues: ctxIssues.map((i) => ({ title: i.title, scope: i.scope })),
			regulatory: upcomingLegalChanges(now, 180, frameworks).map((c) => ({
				date: c.date,
				title: c.title,
				legalBasis: c.legalBasis,
			})),
		},
		nonconformities: {
			open: ncs.filter((x) => x.status !== "closed").length,
			overdue: ncs.filter(
				(x) => x.status !== "closed" && x.dueAt !== null && x.dueAt < to,
			).length,
			closedInPeriod: ncs.filter(
				(x) => x.status === "closed" && inPeriod(x.updatedAt),
			).length,
			newInPeriod: ncs.filter((x) => inPeriod(x.createdAt)).length,
			ineffective: ncs.filter((x) => x.effectivenessResult === "ineffective")
				.length,
			items: ncs
				.filter((x) => x.status !== "closed")
				.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
				.map((x) => ({
					id: x.id,
					code: x.code,
					title: x.title,
					dueAt: x.dueAt,
				})),
		},
		objectives: objs
			.filter((o) => o.approvalStatus === "approved")
			.map((o) => {
				const s = indicatorState(
					o,
					measurements.filter((m) => m.objectiveId === o.id),
					to,
				);
				return {
					title: o.title,
					indicatorType: o.indicatorType,
					state: s.state,
					latest: s.latest,
					unit: o.unit,
				};
			}),
		objectivesProposed: objs.filter((o) => o.approvalStatus === "proposed")
			.length,
		audits: {
			performed: auditRows
				.filter((a) => inPeriod(a.performedAt))
				.map((a) => ({
					id: a.id,
					title: a.title,
					performedAt: a.performedAt as string,
				})),
			findingsNew: findings.filter((f) => inPeriod(f.createdAt)).length,
			findingsOpen: openFindings,
		},
		feedback: {
			complaints: complaintRows.filter((c) => inPeriod(c.receivedAt)).length,
			complaintsOpen: complaintRows.filter(
				(c) => c.status !== "resolved" && c.status !== "closed",
			).length,
			dsr: dsrRows.filter((d) => inPeriod(d.receivedAt)).length,
			dsrOverdue: dsrRows.filter(
				(d) =>
					d.status !== "done" &&
					d.status !== "rejected" &&
					(d.extendedUntil ?? d.dueAt) < toTs,
			).length,
			regulatorContacts: regulator.length,
		},
		risks: {
			total: riskRows.length,
			zones,
			aboveAppetite: above,
			acceptedInPeriod: riskRows.filter((r) => inPeriod(r.acceptedAt)).length,
			treatmentsOpen: tStatus.filter((x) => !x.done).length,
			treatmentsOverdue: tStatus.filter(
				(x) => !x.done && x.due !== null && x.due < to,
			).length,
			treatmentsDone: tStatus.filter((x) => x.done).length,
			proposals: proposals.proposals.length,
		},
		incidents: {
			total: incidentRows.length,
			major: incidentRows.filter((i) => i.classification === "major").length,
			reported: incidentRows.filter((i) => i.initialReportedAt !== null).length,
			items: incidentRows
				.filter(
					(i) =>
						i.classification === "major" || i.classification === "significant",
				)
				.map((i) => ({
					id: i.id,
					code: i.code,
					title: i.title,
					classification:
						i.classification === "major" ? "schwerwiegend" : "erheblich",
				})),
		},
		security: {
			openCritical: secRows.filter((s) => s.severity === "critical").length,
			openHigh: secRows.filter((s) => s.severity === "high").length,
			overdue: secRows.filter((s) => s.dueAt !== null && s.dueAt < now).length,
		},
		providers: {
			total: activeProviders.length,
			critical: activeProviders.filter(
				(p) => p.criticality !== "standard" || p.isMaterial,
			).length,
			red,
			yellow,
			overdueAssessments,
			items: providerItems,
		},
		trainings: {
			assigned: trainings.length,
			done: trainings.filter((x) => x.completedAt !== null).length,
			overdue: trainings.filter(
				(x) => x.completedAt === null && x.dueAt !== null && x.dueAt < to,
			).length,
		},
		obligations: {
			done: runs.filter((r) => r.status === "done").length,
			overdue: runs.filter(
				(r) => r.status !== "done" && r.status !== "waived" && r.dueAt < to,
			).length,
		},
		readiness: (readiness?.results ?? []).map((r) => ({
			framework: r.framework,
			score: r.score,
		})),
		aml,
	};
}

// Letzte abgeschlossene Bewertung vor einem Datum (Beginn des Zeitraums)
export async function lastDoneReviewBefore(
	tx: OrgTx,
	orgId: string,
	before: string,
	excludeId?: string,
): Promise<string | null> {
	const rows = await tx
		.select({ id: managementReviews.id, heldAt: managementReviews.heldAt })
		.from(managementReviews)
		.where(
			and(
				eq(managementReviews.organizationId, orgId),
				eq(managementReviews.status, "done"),
				lt(managementReviews.heldAt, before),
			),
		)
		.orderBy(desc(managementReviews.heldAt))
		.limit(2);
	return rows.find((r) => r.id !== excludeId)?.heldAt ?? null;
}

// Zusammenfassung bis `to` (Standard: heute) seit der letzten Bewertung
export async function buildReviewDigest(
	tx: OrgTx,
	orgId: string,
	opts: { to?: string; excludeReviewId?: string; now?: Date } = {},
): Promise<ReviewDigest> {
	const now = opts.now ?? new Date();
	const to = opts.to ?? now.toISOString().slice(0, 10);
	const last = await lastDoneReviewBefore(tx, orgId, to, opts.excludeReviewId);
	const period = digestPeriod(last, to);
	const profile = await getOrgProfile(tx, orgId);
	const fws = profile?.frameworks ?? [];
	const data = await loadReviewDigest(tx, orgId, period, fws, now);
	return reviewDigest(data, {
		...period,
		inputs: applicableReviewInputs(fws),
		now,
		frameworkName: shortFrameworkName,
	});
}
