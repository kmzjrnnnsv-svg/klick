import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { orgCoverage } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
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
	const rows: unknown[][] = [];
	for (const slug of slugs) {
		for (const [key, status] of cov.result.byRequirement) {
			if (!key.startsWith(`${slug}:`)) continue;
			const req = REQUIREMENT_BY_KEY.get(key);
			if (!req) continue;
			const detail = cov.applicabilityDetail.get(key);
			const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
			rows.push([
				slug,
				req.code,
				req.title,
				req.domain,
				status,
				detail?.source ?? "default",
				detail?.note ?? "",
				edges
					.map(
						(e) =>
							`${e.control} (${cov.implStatus.get(e.control) ?? "not_started"}${e.coverage === "partial" ? ", teilweise" : ""})`,
					)
					.join(" | "),
				edges
					.map((e) => CONTROL_BY_CODE.get(e.control)?.title ?? "")
					.join(" | "),
			]);
		}
	}
	await auditExport(ctx, "gap_csv", rows.length, { frameworks: slugs });
	return csvResponse(
		`gap-${fw ?? "alle"}-${stamp()}.csv`,
		[
			"rahmenwerk",
			"code",
			"anforderung",
			"domaene",
			"status",
			"anwendbarkeit_quelle",
			"anwendbarkeit_begruendung",
			"controls_status",
			"controls_titel",
		],
		rows,
	);
}
