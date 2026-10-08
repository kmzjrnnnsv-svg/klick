import { getTranslations } from "next-intl/server";
import { AccountabilityView } from "@/components/accountability/accountability-view";
import { PrintButton } from "@/components/organisation/print-button";
import { PageHeader } from "@/components/page-header";
import { listRequestsForUser } from "@/lib/approvals/service";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { buildAccountabilitySections } from "@/lib/compliance/accountability";
import { pendingAcknowledgements } from "@/lib/compliance/queries-p2";
import { accountabilityFor } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";

// „Wofür bin ich verantwortlich?" — druckbare Rechenschaftssicht.
export default async function MyAccountabilityPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Accountability");
	const today = new Date().toISOString().slice(0, 10);
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		acc: await accountabilityFor(tx, ctx.orgId, ctx.userId, today),
		approvals: (await listRequestsForUser(tx, ctx.orgId, ctx.userId)).filter(
			(r) => r.eligible,
		),
		acks: await pendingAcknowledgements(tx, ctx.orgId, ctx.userId, ctx.orgRole),
	}));
	const sections = buildAccountabilitySections(data, today, {
		controls: t("controls"),
		overdueReviews: t("overdueReviews"),
		processes: t("processes"),
		assets: t("assets"),
		documents: t("documents"),
		risks: t("risks"),
		tasks: t("tasks"),
		approvals: t("approvals"),
		acks: t("acks"),
		nonconformities: t("nonconformities"),
		obligations: t("obligations"),
		audits: t("audits"),
	});
	return (
		<>
			<div className="print:hidden">
				<PageHeader
					eyebrow={ctx.name}
					title={t("title")}
					lead={t("lead")}
					actions={<PrintButton label={t("print")} />}
				/>
			</div>
			<h1 className="mb-4 hidden font-serif-display text-2xl print:block">
				{t("title")} — {ctx.name}
			</h1>
			<AccountabilityView
				sections={sections}
				labels={{ none: t("none"), overdue: t("overdue"), total: t("total") }}
			/>
		</>
	);
}
