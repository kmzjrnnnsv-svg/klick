import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BiaWizard } from "@/components/bcm/bia-wizard";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { getProcessByCode } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { orgRiskMethod } from "@/lib/org/queries";

// Geführte BIA je Prozess: Schaden je Schadensart über die Zeit → Vorschlag
// für MTPD, RTO und RPO (lib/bcm/bia.ts).
async function ProcessBiaPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const { code: raw } = await params;
	const code = decodeURIComponent(raw);
	if (!/^P-\d{2,3}$/.test(code)) notFound();
	const ctx = await requireOrgPage({ process: ["update"] });
	const t = await getTranslations("Bcm");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const p = await getProcessByCode(tx, ctx.orgId, code);
		if (!p) return null;
		return { p: p.process, method: await orgRiskMethod(tx, ctx.orgId) };
	});
	if (!data) notFound();
	const { p, method } = data;
	const anchors = Object.fromEntries(
		method.dimensions.map((d) => [d.key, d.anchors]),
	);
	return (
		<>
			<PageHeader
				back={{
					href: `/prozesse/${encodeURIComponent(p.code)}`,
					label: `${p.code} ${p.name}`,
				}}
				title={t("pageTitle")}
				lead={t("pageLead", { name: p.name })}
			/>
			<BiaWizard
				processId={p.id}
				code={p.code}
				initial={p.bia}
				dimensions={method.dimensions.map((d) => ({
					key: d.key,
					label: d.label,
					enabled: d.enabled,
				}))}
				impactLabels={method.impact}
				anchors={anchors}
				current={{
					rtoHours: p.rtoHours,
					rpoHours: p.rpoHours,
					mtpdHours: p.mtpdHours,
					criticality: p.criticality,
				}}
			/>
		</>
	);
}

export default withMessages(ProcessBiaPage, [
	"Approvals",
	"Bcm",
	"Common",
	"Processes",
]);
