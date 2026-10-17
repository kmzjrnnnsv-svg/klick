import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { loadReadiness } from "@/lib/compliance/queries-readiness";
import { parseStichtag } from "@/lib/compliance/readiness";
import { readOrg } from "@/lib/db/with-org";
import { buildReadinessMarkdown } from "@/lib/export/readiness-report";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Prüfungsreife-Bericht je Rahmenwerk (?fw=slug&stichtag=YYYY-MM-DD) —
// Ergebnis, Maßnahmen in Reihenfolge, Methode. Auditiert, mit Export-ID.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const url = new URL(req.url);
	const fw = url.searchParams.get("fw") ?? "";
	const meta = FRAMEWORK_BY_SLUG.get(fw);
	if (!meta) return new NextResponse("unknown framework", { status: 400 });
	const asOf = parseStichtag(
		url.searchParams.get("stichtag") ?? undefined,
		new Date(),
	);
	const loaded = await readOrg(toOrgCtx(ctx), (tx) =>
		loadReadiness(tx, ctx.orgId, { asOf, frameworks: [fw] }),
	);
	const result = loaded?.results[0];
	if (!result) return new NextResponse(null, { status: 404 });
	const org = await getOrgSummary(ctx.orgId);
	const body = buildReadinessMarkdown({
		orgName: org?.name ?? "",
		frameworkName: meta.name,
		result,
		sectionTitles: Object.fromEntries(
			meta.sections.map((s) => [s.code, s.title]),
		),
		author: ctx.name || ctx.email,
	});
	const mark = await auditExport(ctx, "readiness_md", result.blockers.length, {
		framework: fw,
		asOf: result.asOf,
		score: result.score,
	});
	return markdownResponse(`pruefungsreife-${fw}-${stamp()}.md`, body, mark);
}
