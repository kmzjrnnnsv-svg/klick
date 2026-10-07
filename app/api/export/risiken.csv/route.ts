import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { listRisks } from "@/lib/compliance/queries-p2";
import { assessRisk, DEFAULT_RISK_APPETITE } from "@/lib/compliance/risk";
import { readOrg } from "@/lib/db/with-org";
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
	const out = rows.map((r) => {
		const a = assessRisk(r, appetite);
		return [
			r.code,
			r.title,
			r.category,
			r.status,
			r.likelihood,
			r.impact,
			a.inherent.score,
			a.inherent.band,
			r.treatment ?? "",
			r.residualLikelihood ?? "",
			r.residualImpact ?? "",
			a.residual?.score ?? "",
			a.aboveAppetite ? "ja" : "nein",
			r.names.ownerUserId ?? "",
			r.reviewAt ?? "",
			r.description ?? "",
		];
	});
	await auditExport(ctx, "risks_csv", out.length);
	return csvResponse(
		`risiken-${stamp()}.csv`,
		[
			"code",
			"titel",
			"kategorie",
			"status",
			"eintrittswahrscheinlichkeit",
			"auswirkung",
			"score",
			"band",
			"behandlung",
			"rest_eintrittswahrscheinlichkeit",
			"rest_auswirkung",
			"rest_score",
			"ueber_appetit",
			"verantwortlich",
			"review",
			"beschreibung",
		],
		out,
	);
}
