import { NextResponse } from "next/server";
import { PLAN_CSV_HEADER, planCsvRows } from "@/lib/assessments/plan-export";
import { loadPlanExport } from "@/lib/assessments/plan-server";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Umsetzungsplan einer Gap-Analyse als CSV (?id=<assessment>): je Maßnahme
// Beginn, Ende, Arbeitstage, Zuständigkeit, Vorgänger. Für Tabellen und
// Projektwerkzeuge; auditiert mit Export-ID.
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
	const rows = planCsvRows(data);
	const mark = await auditExport(ctx, "implementation_plan_csv", rows.length, {
		assessment: data.assessment.code,
	});
	return csvResponse(
		`umsetzungsplan-${data.assessment.code}-${stamp()}.csv`,
		PLAN_CSV_HEADER,
		rows,
		mark,
	);
}
