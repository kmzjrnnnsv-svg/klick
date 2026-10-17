import { and, desc, eq, inArray, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auditLog, controls, riskControls } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { userNames } from "@/lib/compliance/queries";
import { listRiskMeasures, listRisks } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";
import { buildRiskReportMarkdown } from "@/lib/export/risk-report";
import { orgRiskMethod } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
	"risk.create": "angelegt",
	"risk.update": "geändert",
	"risk.reassess": "neu bewertet",
	"risk.status": "Status geändert",
	"risk.treatment": "Maßnahme geplant",
	"risk.acceptance_requested": "Akzeptanz zur Freigabe",
};

// Risikoanalyse als Bericht (Deckblatt, Methodik, Risiken, Maßnahmenplan,
// Historie). Auditiert, mit Export-ID.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const t = await getTranslations("Risks");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [risks, measures, method] = await Promise.all([
			listRisks(tx, ctx.orgId),
			listRiskMeasures(tx, ctx.orgId),
			orgRiskMethod(tx, ctx.orgId),
		]);
		const ids = risks.map((r) => r.id);
		const ctl =
			ids.length > 0
				? await tx
						.select({ riskId: riskControls.riskId, code: controls.code })
						.from(riskControls)
						.innerJoin(controls, eq(controls.id, riskControls.controlId))
						.where(inArray(riskControls.riskId, ids))
				: [];
		const log = await tx
			.select({
				at: auditLog.at,
				actorUserId: auditLog.actorUserId,
				action: auditLog.action,
				target: auditLog.target,
			})
			.from(auditLog)
			.where(
				and(
					eq(auditLog.organizationId, ctx.orgId),
					like(auditLog.target, "risk:%"),
				),
			)
			.orderBy(desc(auditLog.seq))
			.limit(200);
		const names = await userNames(
			tx,
			log.map((l) => l.actorUserId),
		);
		return { risks, measures, method, ctl, log, names };
	});
	const codeById = new Map(data.risks.map((r) => [r.id, r.code]));
	const org = await getOrgSummary(ctx.orgId);
	const body = buildRiskReportMarkdown({
		orgName: org?.name ?? "",
		author: ctx.name || ctx.email,
		method: data.method,
		categoryLabel: (c) => t(`category_${c}` as "category_operational"),
		risks: data.risks.map((r) => ({
			...r,
			protectionGoals: r.protectionGoals ?? [],
			ownerName: r.names.ownerUserId ?? null,
			controls: data.ctl.filter((c) => c.riskId === r.id).map((c) => c.code),
		})),
		measures: data.measures,
		history: data.log.map((l) => ({
			at: l.at,
			actor: l.actorUserId ? (data.names.get(l.actorUserId) ?? "—") : "System",
			action: ACTION_LABEL[l.action] ?? l.action,
			code: codeById.get((l.target ?? "").slice(5)) ?? l.target ?? "",
		})),
	});
	const mark = await auditExport(ctx, "risk_report_md", data.risks.length);
	return markdownResponse(`risikoanalyse-${stamp()}.md`, body, mark);
}
