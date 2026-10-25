import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { type RiskDraft, RiskWizard } from "@/components/risks/risk-wizard";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { SCENARIO_BY_CODE } from "@/lib/compliance/catalog/risk-scenarios";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { loadRiskSource } from "@/lib/compliance/queries-risk-sources";
import { loadRiskWizardData } from "@/lib/compliance/queries-risk-wizard";
import { plusMonths } from "@/lib/compliance/risk-service";
import {
	fallbackForSource,
	riskSourceFromParams,
	scenarioForSource,
	sourceNote,
} from "@/lib/compliance/risk-sources";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f-]{36}$/i;

// Risiko-Assistent: geführt von Szenario über Schaden und Wahrscheinlichkeit
// bis zur Behandlung. Vorbelegung über ?szenario= und jede Herkunft
// (?dienstleister=, ?asset=, ?vorfall=, ?anforderung=, ?befund= …, siehe
// RISK_SOURCE_PARAM) — Titel, Szenario, Bezüge und Herkunft am Risiko.
export default async function NewRiskPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ risk: ["create"] });
	const sp = await searchParams;
	const t = await getTranslations("RiskWizard");
	const tNav = await getTranslations("Nav");
	const cov = await getOrgCoverageCached(ctx);
	const from = riskSourceFromParams(sp);
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		...(await loadRiskWizardData(
			tx,
			ctx.orgId,
			cov?.frameworks ?? [],
			cov?.profile.licenceStage ?? "0_vorbereitung",
		)),
		settings: await getOrgSettings(tx, ctx.orgId),
		source: from
			? await loadRiskSource(tx, ctx.orgId, from.kind, from.id)
			: null,
	}));
	const source = data.source;
	// Szenario: ausdrücklich gewählt, sonst passend zur Herkunft
	const scenario = SCENARIO_BY_CODE.get(
		one(sp.szenario) ?? (source ? (scenarioForSource(source) ?? "") : ""),
	);
	const fallback = source && !scenario ? fallbackForSource(source) : null;
	const provider = source?.providerId ?? one(sp.dienstleister);
	const process = source?.processId ?? one(sp.prozess);
	const asset = source?.assetId ?? one(sp.asset);
	const initial: RiskDraft = {
		scenarioCode: scenario?.code ?? null,
		title: scenario?.title ?? fallback?.title ?? "",
		category: scenario?.category ?? fallback?.category ?? "operational",
		impactDescription: [scenario?.impactHint, source ? sourceNote(source) : ""]
			.filter(Boolean)
			.join("\n\n"),
		existingMeasures: "",
		protectionGoals: [...(scenario?.protectionGoals ?? [])],
		controlCodes: [
			...new Set([
				...(scenario?.controls ?? []),
				...(source?.controlCodes ?? []),
			]),
		],
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
		source: source
			? {
					kind: source.kind,
					id: source.id,
					label: source.label,
					href: source.href,
				}
			: null,
	};
	return (
		<>
			<PageHeader
				back={{ href: "/risiken", label: tNav("risks") }}
				title={t("pageTitle")}
				lead={t("pageLead")}
			/>
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
