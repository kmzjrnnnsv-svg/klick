import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { type RiskDraft, RiskWizard } from "@/components/risks/risk-wizard";
import { processRisks } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import type { ProtectionGoal } from "@/lib/compliance/catalog/risk-scenarios";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { getRisk } from "@/lib/compliance/queries-p2";
import { loadRiskWizardData } from "@/lib/compliance/queries-risk-wizard";
import { plusMonths } from "@/lib/compliance/risk-service";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";
import { responsibleValue } from "@/lib/validation/responsible";

// Neubewertung eines bestehenden Risikos mit dem Assistenten (ab „Bezug“).
export default async function ReassessRiskPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ risk: ["update"] });
	const t = await getTranslations("RiskWizard");
	const cov = await getOrgCoverageCached(ctx);
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const r = await getRisk(tx, ctx.orgId, id);
		if (!r) return null;
		const procs = await tx
			.select({ processId: processRisks.processId })
			.from(processRisks)
			.where(
				and(
					eq(processRisks.riskId, id),
					eq(processRisks.organizationId, ctx.orgId),
				),
			);
		return {
			r,
			procs: procs.map((p) => p.processId),
			settings: await getOrgSettings(tx, ctx.orgId),
			...(await loadRiskWizardData(
				tx,
				ctx.orgId,
				cov?.frameworks ?? [],
				cov?.profile.licenceStage ?? "0_vorbereitung",
			)),
		};
	});
	if (!data) notFound();
	const { risk } = data.r;
	// Altrisiken ohne Einzelwerte: Schadenshöhe auf die erste aktive
	// Schadensart legen, damit der Wert erhalten bleibt.
	const firstDim = data.method.dimensions.find((x) => x.enabled)?.key;
	const impactDetail =
		risk.impactDetail && Object.keys(risk.impactDetail).length > 0
			? risk.impactDetail
			: firstDim
				? { [firstDim]: risk.impact }
				: {};
	const initial: RiskDraft = {
		scenarioCode: risk.scenarioCode,
		title: risk.title,
		category: risk.category,
		impactDescription: risk.impactDescription ?? risk.description ?? "",
		existingMeasures: risk.existingMeasures ?? "",
		protectionGoals: (risk.protectionGoals ?? []) as ProtectionGoal[],
		controlCodes: data.r.controls.map((c) => c.code),
		assetIds: data.r.assets.map((a) => a.id),
		processIds: data.procs,
		providerId: risk.providerId ?? "",
		impactDetail,
		likelihood: risk.likelihood,
		treatment: risk.treatment,
		treatmentNote: risk.treatmentNote ?? "",
		measures: [],
		residualLikelihood: risk.residualLikelihood,
		residualImpact: risk.residualImpact,
		residualNote: risk.residualNote ?? "",
		ownerUserId: responsibleValue(risk) ?? ctx.userId,
		reviewAt: plusMonths(data.settings?.reviewDefaults.risk ?? 3),
	};
	return (
		<>
			<PageHeader
				title={t("reassessTitle", { code: risk.code })}
				lead={t("reassessLead")}
			/>
			<RiskWizard
				mode="reassess"
				riskId={risk.id}
				riskCode={risk.code}
				method={data.method}
				scenarios={data.scenarios}
				controls={data.controls}
				processes={data.processes}
				assets={data.assets}
				providers={data.providers}
				members={data.members}
				initial={initial}
			/>
		</>
	);
}
