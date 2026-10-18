import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { listProviders } from "@/lib/compliance/queries-p2";
import { latestRatingsByProvider } from "@/lib/compliance/queries-ratings";
import { resolveSupplierMethod } from "@/lib/compliance/supplier-rating";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";
import { getOrgSettings } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

const HEADER = [
	"lieferant",
	"kategorie",
	"partnerart",
	"kritikalitaet",
	"status",
	"bewertung",
	"bewertet_am",
	"allgemein",
	"sicherheit",
	"gesamt",
	"prozent",
	"niveau",
	"ampel",
	"empfehlung",
	"freigabe",
	"naechste_bewertung",
] as const;

const num = (v: number | null | undefined) =>
	v === null || v === undefined ? "" : v.toFixed(2).replace(".", ",");

// Lieferantenbewertung je Dienstleister (jüngste abgeschlossene interne
// Bewertung) — wie das Blatt „Lieferantenstamm“ der Vorlage. Auditiert.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		providers: await listProviders(tx, ctx.orgId),
		ratings: await latestRatingsByProvider(tx, ctx.orgId),
		settings: await getOrgSettings(tx, ctx.orgId),
	}));
	const method = resolveSupplierMethod(data.settings);
	const rows = data.providers.map((p) => {
		const r = data.ratings.get(p.id);
		const done = r && r.totalScore !== null ? r : null;
		const thr = done
			? method.thresholds.find((t) => t.level === done.level)
			: undefined;
		return [
			p.name,
			p.category ?? "",
			p.partnerType,
			p.criticality,
			p.status,
			done?.code ?? "",
			done?.completedAt ? done.completedAt.toISOString().slice(0, 10) : "",
			num(done?.generalScore),
			num(done?.securityScore),
			num(done?.totalScore),
			done?.totalScore != null ? Math.round((done.totalScore / 5) * 100) : "",
			done?.level ?? "",
			done?.traffic ?? "",
			thr?.recommendation ?? "",
			done?.decision ?? "",
			p.nextAssessmentAt ?? "",
		];
	});
	const mark = await auditExport(ctx, "supplier_ratings_csv", rows.length);
	return csvResponse(`lieferantenbewertung-${stamp()}.csv`, HEADER, rows, mark);
}
