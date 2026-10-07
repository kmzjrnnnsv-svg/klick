import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { orgCoverage } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { buildGapRows, GAP_HEADER } from "@/lib/export/builders";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Gap-Liste je Rahmenwerk (?fw=slug, sonst alle aktiven): Anforderung,
// Status, Anwendbarkeit mit Quelle/Begründung, umsetzende Controls mit Status.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const fw = new URL(req.url).searchParams.get("fw");
	const cov = await readOrg(toOrgCtx(ctx), (tx) => orgCoverage(tx, ctx.orgId));
	if (!cov) return new NextResponse(null, { status: 404 });
	const slugs = fw ? cov.frameworks.filter((s) => s === fw) : cov.frameworks;
	if (slugs.length === 0)
		return new NextResponse("unknown framework", { status: 400 });
	const rows = buildGapRows(cov, slugs);
	await auditExport(ctx, "gap_csv", rows.length, { frameworks: slugs });
	return csvResponse(`gap-${fw ?? "alle"}-${stamp()}.csv`, GAP_HEADER, rows);
}
