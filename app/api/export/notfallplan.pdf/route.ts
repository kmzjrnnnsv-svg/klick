import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { planDocBlocks } from "@/lib/bcm/plan-export";
import { bcmPlanFor } from "@/lib/bcm/plan-queries";
import { isFunctionKey } from "@/lib/compliance/function-key";
import { userNames } from "@/lib/compliance/queries";
import { getProcessByCode } from "@/lib/compliance/queries-p3";
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

// Notfallplan eines Prozesses als PDF (?prozess=P-01) zum Ausdrucken und
// Ablegen außerhalb von Klick — im Notfall ist Klick vielleicht nicht
// erreichbar. Auditiert mit Export-ID.
export async function GET(req: Request) {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const code = new URL(req.url).searchParams.get("prozess") ?? "";
	if (!/^P-\d{2,3}$/.test(code)) return new NextResponse(null, { status: 404 });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const p = await getProcessByCode(tx, ctx.orgId, code);
		if (!p) return null;
		const plan = await bcmPlanFor(tx, ctx.orgId, p.process.id);
		if (!plan) return null;
		const people = await userNames(
			tx,
			[
				...plan.content.alert.map((a) => a.who),
				...plan.content.recovery.map((r) => r.who),
			].filter((x) => x && !x.startsWith("function:")),
		);
		return { p, plan, people };
	});
	if (!data) return new NextResponse(null, { status: 404 });
	const tf = await getTranslations("Functions");
	const { p, plan, people } = data;
	const assetName = new Map(p.assets.map((a) => [a.id, a.name]));
	const who = (ref: string) => {
		if (ref.startsWith("function:")) {
			const key = ref.slice("function:".length);
			if (key.startsWith("role:")) return "Eigene Rolle";
			return isFunctionKey(key) ? tf(key as Parameters<typeof tf>[0]) : key;
		}
		return people.get(ref) ?? "Unbekannt";
	};
	const mark = await auditExport(ctx, "bcm_plan_pdf", 1, {
		process: p.process.code,
		version: plan.version,
	});
	const now = new Date();
	const pdf = renderPdf(
		{
			title: "Notfall- und Wiederanlaufplan",
			subtitle: `${p.process.code} · ${p.process.name}`,
			org: (await getOrgSummary(ctx.orgId))?.name ?? "",
			meta: [
				[
					"Stand",
					plan.status === "released"
						? `Freigegeben, Fassung ${plan.version}`
						: "Entwurf (nicht freigegeben)",
				],
				["RTO", p.process.rtoHours === null ? "–" : `${p.process.rtoHours} h`],
				["RPO", p.process.rpoHours === null ? "–" : `${p.process.rpoHours} h`],
				["Nächste Überprüfung", plan.reviewAt ?? "–"],
				["Export-ID", mark.exportId],
			],
			blocks: planDocBlocks(plan.content, {
				who,
				asset: (id) => assetName.get(id) ?? "Asset entfernt",
			}),
			footer: exportMarkLine(mark).replace(/^> /, ""),
		},
		{ now },
	);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(
				`notfallplan-${p.process.code}-${stamp()}.pdf`,
			),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": mark.exportId,
		},
	});
}
