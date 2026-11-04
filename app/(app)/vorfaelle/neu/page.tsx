import { getTranslations } from "next-intl/server";
import { withMessages } from "@/components/i18n/with-messages";
import { IncidentCreateForm } from "@/components/incidents/incident-forms";
import { PageHeader } from "@/components/page-header";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { listProductOptions } from "@/lib/compliance/queries-products";
import { listProviderOptions } from "@/lib/compliance/queries-suppliers";
import { readOrg } from "@/lib/db/with-org";

async function NewIncidentPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const ctx = await requireOrgPage({ incident: ["create"] });
	const sp = await searchParams;
	const fromProvider =
		typeof sp.dienstleister === "string" ? sp.dienstleister : null;
	const t = await getTranslations("Incidents");
	const tNav = await getTranslations("Nav");
	const cov = await getOrgCoverageCached(ctx);
	const fws = cov?.frameworks ?? [];
	const regimes = [
		...(fws.includes("dora") ? (["dora"] as const) : []),
		...(fws.includes("nis2") && !fws.includes("dora")
			? (["nis2"] as const)
			: []),
	];
	const products = fws.includes("cra")
		? await readOrg(toOrgCtx(ctx), (tx) => listProductOptions(tx, ctx.orgId))
		: [];
	const providers = await readOrg(toOrgCtx(ctx), (tx) =>
		listProviderOptions(tx, ctx.orgId),
	);
	return (
		<>
			<PageHeader
				back={{ href: "/vorfaelle", label: tNav("incidents") }}
				title={t("new")}
				lead={t("lead")}
			/>
			<IncidentCreateForm
				regimes={[...regimes]}
				products={products}
				providers={providers}
				defaultProviderId={
					providers.some((p) => p.id === fromProvider) ? fromProvider : null
				}
			/>
		</>
	);
}

export default withMessages(NewIncidentPage, [
	"Approvals",
	"Common",
	"Incidents",
]);
