import { NextResponse } from "next/server";
import { planDocBlocks } from "@/lib/assessments/plan-export";
import { loadPlanExport } from "@/lib/assessments/plan-server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { readOrg } from "@/lib/db/with-org";
import { renderPdf } from "@/lib/export/pdf";
import {
	auditExport,
	exportGuard,
	exportMarkLine,
	stamp,
} from "@/lib/export/respond";
import { contentDisposition } from "@/lib/http/disposition";

export const dynamic = "force-dynamic";

// Umsetzungsplan einer Gap-Analyse als PDF (?id=<assessment>): Kopfzahlen,
// „bereit ab“ je Rahmenwerk, Balkenplan nach Zuständigkeit und Tabelle.
// Zum Vorlegen bei der Geschäftsleitung; auditiert mit Export-ID.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const id = new URL(req.url).searchParams.get("id") ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(id))
		return new NextResponse(null, { status: 404 });
	const data = await readOrg(toOrgCtx(ctx), (tx) =>
		loadPlanExport(tx, ctx.orgId, id),
	);
	if (!data) return new NextResponse(null, { status: 404 });
	const mark = await auditExport(
		ctx,
		"implementation_plan_pdf",
		data.schedule.items.length,
		{ assessment: data.assessment.code },
	);
	const now = new Date();
	const pdf = renderPdf(
		{
			title: "Umsetzungsplan",
			subtitle: `${data.assessment.title} (${data.assessment.code})`,
			org: (await getOrgSummary(ctx.orgId))?.name ?? "",
			meta: [
				[
					"Rahmenwerke",
					data.assessment.frameworks
						.map((s) => data.frameworkName(s))
						.join(", "),
				],
				["Stand", now.toISOString().slice(0, 10)],
				["Export-ID", mark.exportId],
			],
			blocks: planDocBlocks(data),
			footer: exportMarkLine(mark).replace(/^> /, ""),
		},
		{ now },
	);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(
				`umsetzungsplan-${data.assessment.code}-${stamp()}.pdf`,
			),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": mark.exportId,
		},
	});
}
