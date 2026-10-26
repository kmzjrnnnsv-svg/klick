import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PolicyList } from "@/components/policies/policy-list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { policiesFor, sharedEvidence } from "@/lib/policies/queries";

// Richtlinien für Mitarbeitende: gültige Fassungen laut Verteiler mit
// Kenntnisnahme, dazu für Mitarbeitende freigegebene Nachweise. Auch für
// alle anderen Rollen als „meine Richtlinien“ erreichbar.
export default async function PoliciesPage() {
	const ctx = await requireOrgPage({ policy: ["read"] });
	const t = await getTranslations("Policies");
	const { policies, shared } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		policies: await policiesFor(tx, ctx.orgId, {
			userId: ctx.userId,
			role: ctx.orgRole,
		}),
		shared: await sharedEvidence(tx, ctx.orgId),
	}));
	const open = policies.filter((p) => !p.acknowledgedAt);
	return (
		<>
			<PageHeader
				title={t("title")}
				lead={
					open.length > 0
						? t("leadOpen", { count: open.length })
						: t("leadDone")
				}
			/>
			<PolicyList
				policies={policies}
				shared={shared}
				detailBase="/richtlinien"
				evidenceBase="/api/richtlinien/nachweis"
			/>
		</>
	);
}
