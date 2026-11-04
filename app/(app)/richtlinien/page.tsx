import { getTranslations } from "next-intl/server";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { PolicyList } from "@/components/policies/policy-list";
import { MyTrainings } from "@/components/trainings/my-trainings";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	listTrainingRequirements,
	listUserTrainingAssignments,
} from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { policiesFor, sharedEvidence } from "@/lib/policies/queries";

// Richtlinien für Mitarbeitende: gültige Fassungen laut Verteiler mit
// Kenntnisnahme, dazu für Mitarbeitende freigegebene Nachweise. Auch für
// alle anderen Rollen als „meine Richtlinien“ erreichbar. Oben die offenen
// Pflichtschulungen der Person (Mitarbeitende haben keine Schulungsseite).
async function PoliciesPage() {
	const ctx = await requireOrgPage({ policy: ["read"] });
	const t = await getTranslations("Policies");
	const { policies, shared, trainings, requirements } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			policies: await policiesFor(tx, ctx.orgId, {
				userId: ctx.userId,
				role: ctx.orgRole,
			}),
			shared: await sharedEvidence(tx, ctx.orgId),
			trainings: await listUserTrainingAssignments(tx, ctx.orgId, ctx.userId),
			requirements: await listTrainingRequirements(tx, ctx.orgId),
		}),
	);
	const today = new Date().toISOString().slice(0, 10);
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
			<MyTrainings
				id="schulungen"
				assignments={trainings}
				requirements={requirements}
				today={today}
				className="mb-6 scroll-mt-20"
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

export default withMessages(PoliciesPage, [
	"Approvals",
	"Auth",
	"Common",
	"Entity",
	"Functions",
	"Organisation",
	"Trainings",
]);
