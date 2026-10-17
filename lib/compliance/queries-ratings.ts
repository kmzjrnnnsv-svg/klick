import { and, desc, eq } from "drizzle-orm";
import { assessments, providerRatings, providers } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { userNames } from "./queries";

// Interne Lieferantenbewertungen (provider_ratings) — Detail, Liste je
// Dienstleister, jüngste abgeschlossene je Dienstleister (Register/Übersicht).

export async function getRatingDetail(
	tx: OrgTx,
	orgId: string,
	providerId: string,
	ratingId: string,
) {
	const [rating] = await tx
		.select()
		.from(providerRatings)
		.where(
			and(
				eq(providerRatings.id, ratingId),
				eq(providerRatings.organizationId, orgId),
				eq(providerRatings.providerId, providerId),
			),
		)
		.limit(1);
	if (!rating) return null;
	const [provider] = await tx
		.select()
		.from(providers)
		.where(
			and(eq(providers.id, providerId), eq(providers.organizationId, orgId)),
		)
		.limit(1);
	if (!provider) return null;
	// Selbstauskunft: Portal-Fragebögen dieses Dienstleisters
	const questionnaires = await tx
		.select({
			id: assessments.id,
			code: assessments.code,
			title: assessments.title,
			templateCode: assessments.templateCode,
			status: assessments.status,
			score: assessments.score,
			rating: assessments.rating,
			completedAt: assessments.completedAt,
		})
		.from(assessments)
		.where(
			and(
				eq(assessments.organizationId, orgId),
				eq(assessments.subjectType, "provider"),
				eq(assessments.subjectId, providerId),
			),
		)
		.orderBy(desc(assessments.createdAt))
		.limit(5);
	const names = await userNames(tx, [
		...Object.values(rating.scores).map((s) => s.ratedBy ?? null),
		rating.decidedByUserId,
		rating.createdByUserId,
	]);
	return { rating, provider, questionnaires, names };
}

export async function listProviderRatings(
	tx: OrgTx,
	orgId: string,
	providerId: string,
) {
	return tx
		.select({
			id: providerRatings.id,
			code: providerRatings.code,
			status: providerRatings.status,
			totalScore: providerRatings.totalScore,
			level: providerRatings.level,
			traffic: providerRatings.traffic,
			decision: providerRatings.decision,
			nextAssessmentAt: providerRatings.nextAssessmentAt,
			completedAt: providerRatings.completedAt,
			createdAt: providerRatings.createdAt,
		})
		.from(providerRatings)
		.where(
			and(
				eq(providerRatings.organizationId, orgId),
				eq(providerRatings.providerId, providerId),
			),
		)
		.orderBy(desc(providerRatings.createdAt));
}

export type LatestRating = {
	id: string;
	code: string;
	providerId: string;
	totalScore: number | null;
	generalScore: number | null;
	securityScore: number | null;
	level: string | null;
	traffic: "red" | "amber" | "green" | null;
	decision: string;
	completedAt: Date | null;
	nextAssessmentAt: string | null;
	draft: boolean;
};

// Je Dienstleister die jüngste abgeschlossene Bewertung; Entwürfe markieren.
export async function latestRatingsByProvider(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, LatestRating>> {
	const rows = await tx
		.select({
			id: providerRatings.id,
			code: providerRatings.code,
			providerId: providerRatings.providerId,
			status: providerRatings.status,
			totalScore: providerRatings.totalScore,
			generalScore: providerRatings.generalScore,
			securityScore: providerRatings.securityScore,
			level: providerRatings.level,
			traffic: providerRatings.traffic,
			decision: providerRatings.decision,
			completedAt: providerRatings.completedAt,
			nextAssessmentAt: providerRatings.nextAssessmentAt,
		})
		.from(providerRatings)
		.where(eq(providerRatings.organizationId, orgId))
		.orderBy(
			desc(providerRatings.completedAt),
			desc(providerRatings.createdAt),
		);
	const out = new Map<string, LatestRating>();
	const drafts = new Set(
		rows.filter((r) => r.status === "draft").map((r) => r.providerId),
	);
	for (const r of rows) {
		if (r.status !== "completed" || out.has(r.providerId)) continue;
		out.set(r.providerId, { ...r, draft: drafts.has(r.providerId) });
	}
	for (const pid of drafts)
		if (!out.has(pid)) {
			const d = rows.find((r) => r.providerId === pid && r.status === "draft");
			if (d) out.set(pid, { ...d, draft: true });
		}
	return out;
}
