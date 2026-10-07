import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
	amlMonitoringRules,
	amlRiskAnalyses,
	controls,
	cryptoAssets,
	jurisdictions,
	milestoneControls,
	milestones,
	ownFundsCalculations,
	shareholders,
	suspiciousReports,
	tasks,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { userNames } from "./queries";

// Org-gescopte Lesezugriffe der CASP-/AML-Register (P4) — immer in readOrg/withOrg.

export async function listAmlRiskAnalyses(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(amlRiskAnalyses)
		.where(eq(amlRiskAnalyses.organizationId, orgId))
		.orderBy(desc(amlRiskAnalyses.createdAt));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.ownerUserId, r.approvedByUserId]),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		approvedByName: r.approvedByUserId
			? (names.get(r.approvedByUserId) ?? null)
			: null,
	}));
}

export async function listMonitoringRules(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(amlMonitoringRules)
		.where(eq(amlMonitoringRules.organizationId, orgId))
		.orderBy(asc(amlMonitoringRules.code));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listSuspiciousReports(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(suspiciousReports)
		.where(eq(suspiciousReports.organizationId, orgId))
		.orderBy(desc(suspiciousReports.detectedAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listJurisdictions(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(jurisdictions)
		.where(eq(jurisdictions.organizationId, orgId))
		.orderBy(asc(jurisdictions.name));
}

export async function listOwnFundsCalculations(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(ownFundsCalculations)
		.where(eq(ownFundsCalculations.organizationId, orgId))
		.orderBy(desc(ownFundsCalculations.periodLabel));
	const names = await userNames(
		tx,
		rows.map((r) => r.approvedByUserId),
	);
	return rows.map((r) => ({
		...r,
		approvedByName: r.approvedByUserId
			? (names.get(r.approvedByUserId) ?? null)
			: null,
	}));
}

export async function listCryptoAssets(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(cryptoAssets)
		.where(eq(cryptoAssets.organizationId, orgId))
		.orderBy(asc(cryptoAssets.symbol));
}

export async function listShareholders(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(shareholders)
		.where(eq(shareholders.organizationId, orgId))
		.orderBy(desc(shareholders.sharePct));
}

// Aggregat für Antragsmappe und Überblick: gültige Risikoanalyse?
export async function amlStatus(tx: OrgTx, orgId: string) {
	const analyses = await tx
		.select({
			status: amlRiskAnalyses.status,
			nextReviewAt: amlRiskAnalyses.nextReviewAt,
		})
		.from(amlRiskAnalyses)
		.where(eq(amlRiskAnalyses.organizationId, orgId));
	const approved = analyses.find((a) => a.status === "approved");
	return {
		analysisApproved: Boolean(approved),
		analysisReviewDue: approved?.nextReviewAt ?? null,
	};
}

// Meilensteine mit Controls, Namen und offenen Aufgaben (Roadmap-Kanban).
export async function listMilestones(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(milestones)
		.where(eq(milestones.organizationId, orgId))
		.orderBy(asc(milestones.sortOrder), asc(milestones.dueAt));
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const [links, openTasks, names] = await Promise.all([
		tx
			.select({
				milestoneId: milestoneControls.milestoneId,
				code: controls.code,
			})
			.from(milestoneControls)
			.innerJoin(controls, eq(controls.id, milestoneControls.controlId))
			.where(inArray(milestoneControls.milestoneId, ids)),
		tx
			.select({ entityId: tasks.entityId })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, orgId),
					eq(tasks.entityType, "milestone"),
					inArray(tasks.status, ["todo", "doing", "blocked"]),
				),
			),
		userNames(
			tx,
			rows.flatMap((r) => [r.ownerUserId, r.assigneeUserId]),
		),
	]);
	const codesBy = new Map<string, string[]>();
	for (const l of links) {
		const list = codesBy.get(l.milestoneId) ?? [];
		list.push(l.code);
		codesBy.set(l.milestoneId, list);
	}
	const taskCount = new Map<string, number>();
	for (const t of openTasks)
		if (t.entityId)
			taskCount.set(t.entityId, (taskCount.get(t.entityId) ?? 0) + 1);
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		description: r.description,
		phase: r.phase,
		status: r.status,
		dueAt: r.dueAt,
		ownerUserId: r.ownerUserId,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		assigneeUserId: r.assigneeUserId,
		assigneeName: r.assigneeUserId
			? (names.get(r.assigneeUserId) ?? null)
			: null,
		sortOrder: r.sortOrder,
		controlCodes: (codesBy.get(r.id) ?? []).sort(),
		openTasks: taskCount.get(r.id) ?? 0,
	}));
}
