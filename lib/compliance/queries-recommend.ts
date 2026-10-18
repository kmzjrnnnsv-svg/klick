import { and, count, eq, inArray, isNull, lt, max, or } from "drizzle-orm";
import {
	assessments,
	controlTests,
	products,
	providers,
	securityFindings,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import type { RecommendInput } from "@/lib/marketing/recommend";

// Datengrundlage für „Für dich empfohlen“ (C4) — nur Zähler, keine Inhalte.
export async function loadRecommendInput(
	tx: OrgTx,
	orgId: string,
	frameworks: readonly string[],
	now = new Date(),
): Promise<RecommendInput> {
	const today = now.toISOString().slice(0, 10);
	const [gap, pentest, prods, due, quick] = await Promise.all([
		tx
			.select({ n: count() })
			.from(assessments)
			.where(
				and(
					eq(assessments.organizationId, orgId),
					eq(assessments.kind, "self"),
					eq(assessments.status, "completed"),
				),
			),
		tx
			.select({ at: max(controlTests.testedAt) })
			.from(controlTests)
			.where(
				and(
					eq(controlTests.organizationId, orgId),
					eq(controlTests.method, "pentest"),
				),
			),
		tx
			.select({ hasSbom: products.sbomSummary, status: products.status })
			.from(products)
			.where(eq(products.organizationId, orgId)),
		tx
			.select({ n: count() })
			.from(providers)
			.where(
				and(
					eq(providers.organizationId, orgId),
					inArray(providers.criticality, ["critical", "important"]),
					inArray(providers.status, ["active", "onboarding"]),
					or(
						isNull(providers.nextAssessmentAt),
						lt(providers.nextAssessmentAt, today),
					),
				),
			),
		tx
			.select({ n: count() })
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.organizationId, orgId),
					eq(securityFindings.tool, "quick_check"),
					inArray(securityFindings.status, ["open", "in_progress"]),
				),
			),
	]);
	const live = prods.filter((p) => p.status !== "withdrawn");
	return {
		frameworks,
		gapAnalysisCompleted: (gap[0]?.n ?? 0) > 0,
		lastPentestAt: pentest[0]?.at ?? null,
		products: live.length,
		productsWithoutSbom: live.filter((p) => !p.hasSbom).length,
		suppliersDue: due[0]?.n ?? 0,
		quickCheckFindings: quick[0]?.n ?? 0,
		now,
	};
}
