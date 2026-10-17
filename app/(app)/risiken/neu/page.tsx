import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { type RiskDraft, RiskWizard } from "@/components/risks/risk-wizard";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { SCENARIO_BY_CODE } from "@/lib/compliance/catalog/risk-scenarios";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { loadRiskWizardData } from "@/lib/compliance/queries-risk-wizard";
import { plusMonths } from "@/lib/compliance/risk-service";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f-]{36}$/i;

// Risiko-Assistent: geführt von Szenario über Schaden und Wahrscheinlichkeit
// bis zur Behandlung. Vorbelegung über ?szenario=, ?dienstleister=,
// ?prozess=, ?asset= (z. B. aus der Lieferantenbewertung oder /aml).
export default async function NewRiskPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ risk: ["create"] });
	const sp = await searchParams;
	const t = await getTranslations("RiskWizard");
	const cov = await getOrgCoverageCached(ctx);
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		...(await loadRiskWizardData(
			tx,
			ctx.orgId,
			cov?.frameworks ?? [],
			cov?.profile.licenceStage ?? "0_vorbereitung",
		)),
		settings: await getOrgSettings(tx, ctx.orgId),
	}));
	const scenario = SCENARIO_BY_CODE.get(one(sp.szenario) ?? "");
	const provider = one(sp.dienstleister);
	const process = one(sp.prozess);
	const asset = one(sp.asset);
	const initial: RiskDraft = {
		scenarioCode: scenario?.code ?? null,
		title: scenario?.title ?? "",
		category: scenario?.category ?? "operational",
		impactDescription: scenario?.impactHint ?? "",
		existingMeasures: "",
		protectionGoals: [...(scenario?.protectionGoals ?? [])],
		controlCodes: [...(scenario?.controls ?? [])],
		assetIds:
			asset && UUID.test(asset) && data.assets.some((a) => a.id === asset)
				? [asset]
				: [],
		processIds:
			process &&
			UUID.test(process) &&
			data.processes.some((p) => p.id === process)
				? [process]
				: [],
		providerId:
			provider &&
			UUID.test(provider) &&
			data.providers.some((p) => p.id === provider)
				? provider
				: "",
		impactDetail: {},
		likelihood: null,
		treatment: "mitigate",
		treatmentNote: "",
		measures: [],
		residualLikelihood: null,
		residualImpact: null,
		residualNote: "",
		ownerUserId: ctx.userId,
		reviewAt: plusMonths(data.settings?.reviewDefaults.risk ?? 3),
	};
	return (
		<>
			<PageHeader title={t("pageTitle")} lead={t("pageLead")} />
			<RiskWizard
				mode="create"
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
