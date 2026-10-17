import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { loadEngagementReport } from "@/lib/compliance/queries-engagements";
import { loadReadiness } from "@/lib/compliance/queries-readiness";
import { readOrg } from "@/lib/db/with-org";
import { buildEngagementReport } from "@/lib/export/engagement-report";
import { buildReadinessMarkdown } from "@/lib/export/readiness-report";
import {
	auditExport,
	exportMarkLine,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest } from "@/lib/export/zip";

export const dynamic = "force-dynamic";

// Bericht eines Sicherheitsauftrags (?id=) als ZIP mit SHA-256-Manifest:
// Management-Summary, Umfang/Regeln/Beauftragung, Befunde mit Reproduktion
// (entschlüsselt), Nachtest, CSV; bei CRA-Readiness der Prüfungsreife-
// Bericht CRA. Step-up Pflicht, auditiert mit Export-ID.
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	const id = new URL(req.url).searchParams.get("id") ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(id))
		return new NextResponse(null, { status: 404 });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await loadEngagementReport(tx, ctx.orgId, id);
		if (!r) return null;
		const readiness =
			r.engagement.kind === "cra_readiness"
				? await loadReadiness(tx, ctx.orgId, {
						asOf: new Date(),
						frameworks: ["cra"],
					})
				: null;
		return { ...r, readiness: readiness?.results[0] ?? null };
	});
	if (!data) return new NextResponse(null, { status: 404 });
	const org = await getOrgSummary(ctx.orgId);
	const e = data.engagement;
	const mark = await auditExport(ctx, "engagement_zip", data.findings.length, {
		engagement: e.code,
		kind: e.kind,
	});
	const cra = FRAMEWORK_BY_SLUG.get("cra");
	const files = buildEngagementReport({
		orgName: org?.name ?? "",
		exportLine: exportMarkLine(mark),
		engagement: e,
		productLabel: data.product
			? `${data.product.code} ${data.product.name}`
			: null,
		authorization: data.authorization
			? {
					fileName: data.authorization.fileName,
					sha256: data.authorization.sha256,
				}
			: null,
		authorizedBy: e.authorizedByUserId
			? (data.names.get(e.authorizedByUserId) ?? null)
			: null,
		findings: data.findings,
		readinessMarkdown:
			data.readiness && cra
				? buildReadinessMarkdown({
						orgName: org?.name ?? "",
						frameworkName: cra.name,
						result: data.readiness,
						sectionTitles: Object.fromEntries(
							cra.sections.map((s) => [s.code, s.title]),
						),
						author: ctx.name || ctx.email,
					})
				: null,
	});
	const { entries } = withManifest(files, {
		title: `Sicherheitsauftrag ${e.code}`,
		generatedAt: mark.at,
		organization: { id: ctx.orgId, name: org?.name ?? "" },
		period: { from: e.startAt, to: e.endAt },
		extra: {
			exportId: mark.exportId,
			kind: e.kind,
			status: e.status,
			result: e.result,
			findings: data.findings.length,
		},
	});
	return zipResponse(
		`sicherheitsauftrag-${e.code}-${stamp()}.zip`,
		buildZip(entries),
	);
}
