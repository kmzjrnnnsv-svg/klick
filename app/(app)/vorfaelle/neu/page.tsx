import { getTranslations } from "next-intl/server";
import { IncidentCreateForm } from "@/components/incidents/incident-forms";
import { PageHeader } from "@/components/page-header";
import { requireOrgPage } from "@/lib/auth/gates";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";

export default async function NewIncidentPage() {
	const ctx = await requireOrgPage({ incident: ["create"] });
	const t = await getTranslations("Incidents");
	const cov = await getOrgCoverageCached(ctx);
	const fws = cov?.frameworks ?? [];
	const regimes = [
		...(fws.includes("dora") ? (["dora"] as const) : []),
		...(fws.includes("nis2") && !fws.includes("dora")
			? (["nis2"] as const)
			: []),
	];
	return (
		<>
			<PageHeader title={t("new")} lead={t("lead")} />
			<IncidentCreateForm
				regimes={regimes.length > 0 ? [...regimes] : ["dora"]}
			/>
		</>
	);
}
