import { asc, desc, eq } from "drizzle-orm";
import {
	amlMonitoringRules,
	amlRiskAnalyses,
	cryptoAssets,
	jurisdictions,
	ownFundsCalculations,
	shareholders,
	suspiciousReports,
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
