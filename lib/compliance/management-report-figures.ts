import type { OrgTx } from "@/lib/db/with-org";
import type { ReportKindDef } from "./catalog/management-reports";
import { MANAGEMENT_REVIEW_INPUTS } from "./catalog/management-review-inputs";
import { type ReviewDigest, reviewDigest } from "./management-review-digest";
import { shortFrameworkName } from "./page-data";
import { getOrgProfile } from "./queries";
import { loadReviewDigest } from "./queries-review-digest";

// Kennzahlen eines Berichts an die Geschäftsleitung: dieselben Abschnitte
// wie in der Managementbewertung, beschränkt auf die Berichtsart und ihren
// Zeitraum. Beim Vorlegen als Schnappschuss gespeichert.
export async function reportFigures(
	tx: OrgTx,
	orgId: string,
	kind: ReportKindDef,
	period: { from: string; to: string },
	now = new Date(),
): Promise<ReviewDigest> {
	const profile = await getOrgProfile(tx, orgId);
	const inputs = MANAGEMENT_REVIEW_INPUTS.filter((i) =>
		kind.sections.includes(i.key),
	);
	if (inputs.length === 0)
		return {
			from: period.from,
			to: period.to,
			generatedAt: now.toISOString(),
			sections: [],
		};
	const data = await loadReviewDigest(
		tx,
		orgId,
		period,
		profile?.frameworks ?? [],
		now,
	);
	return reviewDigest(data, {
		...period,
		inputs,
		now,
		frameworkName: shortFrameworkName,
	});
}
