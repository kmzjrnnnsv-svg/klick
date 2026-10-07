import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { listRisks } from "@/lib/compliance/queries-p2";
import { DEFAULT_RISK_APPETITE } from "@/lib/compliance/risk";
import { readOrg } from "@/lib/db/with-org";
import { buildRiskRows, RISK_HEADER } from "@/lib/export/builders";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";
import { getOrgSettings } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

// Risikoregister als CSV (Prüfungspaket-Baustein).
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const { rows, appetite } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listRisks(tx, ctx.orgId),
		appetite:
			(await getOrgSettings(tx, ctx.orgId))?.riskAppetite ??
			DEFAULT_RISK_APPETITE,
	}));
	const out = buildRiskRows(rows, appetite);
	await auditExport(ctx, "risks_csv", out.length);
	return csvResponse(`risiken-${stamp()}.csv`, RISK_HEADER, out);
}
