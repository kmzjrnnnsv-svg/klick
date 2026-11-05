import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getOrgSummary } from "@/lib/auth/org";
import { renderPdf } from "@/lib/export/pdf";
import {
	auditExport,
	exportGuard,
	exportMarkLine,
	stamp,
} from "@/lib/export/respond";
import { contentDisposition } from "@/lib/http/disposition";
import { ismsDocBlocks } from "@/lib/isms-plan/export";
import {
	ismsExportLabels,
	loadIsmsPlanView,
} from "@/lib/isms-plan/export-server";
import { fmtNum } from "@/lib/isms-plan/format";

export const dynamic = "force-dynamic";

// ISMS-Jahresplan als PDF (P2c): Summen, Stellenanteil der oder des ISB,
// Aufwand nach Bereich und je Abschnitt die Punkte mit Stand. Zum Vorlegen
// bei der Geschäftsleitung (Ressourcen, ISO 27001 7.1); auditiert mit
// Export-ID.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const view = await loadIsmsPlanView(ctx);
	const labels = await ismsExportLabels();
	const t = await getTranslations("IsmsPlan");
	const items = view.sections.reduce((n, s) => n + s.rows.length, 0);
	const mark = await auditExport(ctx, "isms_plan_pdf", items);
	const now = new Date();
	const c = view.counts;
	const pdf = renderPdf(
		{
			title: t("title"),
			org: (await getOrgSummary(ctx.orgId))?.name ?? "",
			meta: [
				["Stand", now.toISOString().slice(0, 10)],
				["Export-ID", mark.exportId],
			],
			blocks: ismsDocBlocks(view, labels, {
				summary: t("lead"),
				cardTotal: t("cardTotal"),
				cardA: t("cardA"),
				cardB: t("cardB"),
				workdays: t("workdays"),
				fte: t("pdfFte"),
				overview: t("overviewTitle"),
				colSection: t("colSection"),
				colItem: t("colItem"),
				colCadence: t("colCadence"),
				colYear: t("colYear"),
				colIsbA: t("colIsbA"),
				colIsbB: t("colIsbB"),
				colStatus: t("colStatus"),
				total: t("total"),
				counts: `${t("statusCounts", c)}${
					view.offCount > 0 ? ` · ${t("offCount", { n: view.offCount })}` : ""
				}`,
				source: `${t("scenarios")} ${t("source")} ${t("pdfMiddle", {
					middle: fmtNum(view.rollup.middle),
				})}`,
				empty: t("notApplicable"),
			}),
			footer: exportMarkLine(mark).replace(/^> /, ""),
		},
		{ now },
	);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(`jahresplan-${stamp()}.pdf`),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": mark.exportId,
		},
	});
}
