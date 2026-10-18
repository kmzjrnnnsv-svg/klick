import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { managementReviews } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import {
	asDigest,
	digestMarkdown,
} from "@/lib/compliance/management-review-digest";
import { buildReviewDigest } from "@/lib/compliance/queries-review-digest";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Zusammenfassung aus Klick für die Managementbewertung (B6): ohne ?id= der
// aktuelle Stand seit der letzten Bewertung, mit ?id= der Schnappschuss der
// Bewertung. Auditiert, mit Export-ID.
export async function GET(req: NextRequest) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const id = req.nextUrl.searchParams.get("id");
	const uuid = /^[0-9a-f-]{36}$/i;
	const result = await readOrg(toOrgCtx(ctx), async (tx) => {
		if (!id)
			return { digest: await buildReviewDigest(tx, ctx.orgId), heldAt: null };
		if (!uuid.test(id)) return null;
		const [row] = await tx
			.select({
				heldAt: managementReviews.heldAt,
				digest: managementReviews.digest,
			})
			.from(managementReviews)
			.where(
				and(
					eq(managementReviews.id, id),
					eq(managementReviews.organizationId, ctx.orgId),
				),
			)
			.limit(1);
		const digest = asDigest(row?.digest);
		return row && digest ? { digest, heldAt: row.heldAt } : null;
	});
	if (!result) return new NextResponse(null, { status: 404 });
	const org = await getOrgSummary(ctx.orgId);
	const body = digestMarkdown(result.digest, {
		orgName: org?.name ?? "",
		heldAt: result.heldAt,
	});
	const mark = await auditExport(
		ctx,
		"management_review_digest_md",
		result.digest.sections.length,
		id ? { reviewId: id } : undefined,
	);
	return markdownResponse(
		`managementbewertung-${result.heldAt ?? stamp()}.md`,
		body,
		mark,
	);
}
