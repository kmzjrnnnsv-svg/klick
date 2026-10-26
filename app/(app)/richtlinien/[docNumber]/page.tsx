import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AckButton } from "@/components/documents/ack-button";
import { MarkdownView } from "@/components/markdown-view";
import { PageHeader } from "@/components/page-header";
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
			<div className="flex max-w-3xl flex-col gap-4">
				{policy.fileEvidenceId && (
					<p className="text-subhead">
						<a
							href={`/api/richtlinien/datei/${policy.versionId}`}
							className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
						>
							<Download aria-hidden="true" className="size-4" />
							{t("download")}
						</a>
					</p>
				)}
				{policy.bodyMarkdown ? (
					<div className="rounded-2xl bg-card p-4">
						<MarkdownView source={policy.bodyMarkdown} />
					</div>
				) : (
					!policy.fileEvidenceId && (
						<p className="text-muted-foreground text-subhead">{t("noText")}</p>
					)
				)}
			</div>
		</>
	);
}
