"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { REJECT_REASONS, type RejectReason } from "@/db/schema";

// Mindest-Bucket-Größe — unter 10 Bewertungen zeigen wir nichts. Sonst
// ist eine einzelne enttäuschte Person die ganze Statistik. Quelle:
// AIHR Candidate-NPS Best Practices.
const MIN_RATINGS_FOR_PUBLIC = 10;

export type EmployerStats = {
	totalRatings: number;
	hasEnoughData: boolean;
	dimensions: {
		clarity: number | null;
		respect: number | null;
		effort: number | null;
		responseTime: number | null;
	};
	totalApplications: number;
	totalDecided: number;
	avgDaysToDecision: number | null;
	closureRate: number | null; // % entschiedene / total
	rejectReasonBreakdown: Array<{
		reason: RejectReason;
		count: number;
		pct: number;
	}>;
};

export async function getEmployerStats(
	employerId: string,
): Promise<EmployerStats> {
	const empty: EmployerStats = {
		totalRatings: 0,
		hasEnoughData: false,
		dimensions: {
			clarity: null,
			respect: null,
			effort: null,
			responseTime: null,
		},
		totalApplications: 0,
		totalDecided: 0,
		avgDaysToDecision: null,
		closureRate: null,
		rejectReasonBreakdown: [],
	};

	try {
		// Stage-Rating-Aggregat. Avg über alle Bewertungen für alle Stages
		// dieses Employers.
		const ratingResult = await db.execute<{
			total: number;
			clarity: number;
			respect: number;
			effort: number;
			response_time: number;
		}>(sql`
			SELECT
				COUNT(*)::int AS total,
				AVG(sr.clarity)::float AS clarity,
				AVG(sr.respect)::float AS respect,
				AVG(sr.effort)::float AS effort,
				AVG(sr.response_time)::float AS response_time
			FROM stage_ratings sr
			JOIN applications a ON a.id = sr.application_id
			WHERE a.employer_id = ${employerId}
		`);
		const ratingRow = (
			ratingResult as unknown as {
				rows?: {
					total: number;
					clarity: number;
					respect: number;
					effort: number;
					response_time: number;
				}[];
			}
		).rows?.[0];
		const totalRatings = Number(ratingRow?.total ?? 0);
		const hasEnoughData = totalRatings >= MIN_RATINGS_FOR_PUBLIC;

		// Application-Stats: total, entschieden, avg days to decision.
		const appResult = await db.execute<{
			total: number;
			decided: number;
			avg_days: number;
		}>(sql`
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (
					WHERE status IN ('declined','offer','archived')
				)::int AS decided,
				AVG(
					EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
				) FILTER (
					WHERE status IN ('declined','offer','archived')
				)::float AS avg_days
			FROM applications
			WHERE employer_id = ${employerId}
		`);
		const appRow = (
			appResult as unknown as {
				rows?: { total: number; decided: number; avg_days: number }[];
			}
		).rows?.[0];
		const totalApplications = Number(appRow?.total ?? 0);
		const totalDecided = Number(appRow?.decided ?? 0);
		const avgDaysToDecision =
			appRow?.avg_days != null
				? Math.round(Number(appRow.avg_days) * 10) / 10
				: null;
		const closureRate =
			totalApplications >= MIN_RATINGS_FOR_PUBLIC
				? Math.round((totalDecided / totalApplications) * 100)
				: null;

		// Reject-Reason-Breakdown aus dem festen Katalog.
		const reasonResult = await db.execute<{
			reject_reason: RejectReason;
			count: number;
		}>(sql`
			SELECT reject_reason, COUNT(*)::int AS count
			FROM applications
			WHERE employer_id = ${employerId}
			AND status = 'declined'
			AND reject_reason IS NOT NULL
			GROUP BY reject_reason
			ORDER BY count DESC
		`);
		const reasonRows =
			(
				reasonResult as unknown as {
					rows?: { reject_reason: RejectReason; count: number }[];
				}
			).rows ?? [];
		const totalRejects = reasonRows.reduce(
			(acc, r) => acc + Number(r.count ?? 0),
			0,
		);
		const rejectReasonBreakdown =
			totalRejects >= MIN_RATINGS_FOR_PUBLIC
				? reasonRows
						.filter((r) => REJECT_REASONS.includes(r.reject_reason))
						.map((r) => ({
							reason: r.reject_reason,
							count: Number(r.count),
							pct: Math.round((Number(r.count) / totalRejects) * 100),
						}))
				: [];

		const round1 = (n: number | null | undefined) =>
			n == null ? null : Math.round(Number(n) * 10) / 10;

		return {
			totalRatings,
			hasEnoughData,
			dimensions: hasEnoughData
				? {
						clarity: round1(ratingRow?.clarity),
						respect: round1(ratingRow?.respect),
						effort: round1(ratingRow?.effort),
						responseTime: round1(ratingRow?.response_time),
					}
				: empty.dimensions,
			totalApplications,
			totalDecided,
			avgDaysToDecision,
			closureRate,
			rejectReasonBreakdown,
		};
	} catch (e) {
		console.warn("[company-stats] failed", e);
		return empty;
	}
}
