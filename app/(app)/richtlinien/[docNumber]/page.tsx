import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AckButton } from "@/components/documents/ack-button";
import { PageHeader } from "@/components/page-header";
import { PolicyBody } from "@/components/policies/policy-list";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { policiesFor } from "@/lib/policies/queries";

// Eine Richtlinie in der gültigen Fassung: Text oder Datei, „gilt seit“,
// Kenntnisnahme. Nur, was der Verteiler der Person erreicht.
export default async function PolicyPage({
	params,
}: {
	params: Promise<{ docNumber: string }>;
}) {
	const { docNumber: raw } = await params;
	const docNumber = decodeURIComponent(raw);
	const ctx = await requireOrgPage({ policy: ["read"] });
	const t = await getTranslations("Policies");
	const tn = await getTranslations("Nav");
	const policy = await readOrg(toOrgCtx(ctx), async (tx) =>
		(
			await policiesFor(tx, ctx.orgId, {
				userId: ctx.userId,
				role: ctx.orgRole,
			})
		).find((p) => p.docNumber === docNumber),
	);
	if (!policy) notFound();
	return (
		<>
			<BackLink href="/richtlinien" label={tn("policies")} />
			<PageHeader
				eyebrow={t("meta", {
					number: policy.docNumber,
					version: policy.version,
					date: fmtDate.format(policy.publishedAt),
				})}
				title={policy.title}
				actions={
					policy.acknowledgedAt ? (
						<Badge variant="success">
							{t("ackDone", { date: fmtDate.format(policy.acknowledgedAt) })}
						</Badge>
					) : (
						<AckButton documentId={policy.documentId} />
					)
				}
			/>
			<PolicyBody
				policy={policy}
				fileHref={`/api/richtlinien/datei/${policy.versionId}`}
			/>
		</>
	);
}
