import { ArrowUpRight, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { fmtDate } from "@/lib/compliance/page-data";
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
			<ListGroup>
				<ListSection
					title={t("policies")}
					footer={policies.length === 0 ? t("empty") : undefined}
				>
					{policies.map((p) => (
						<ListRow
							key={p.documentId}
							href={`/richtlinien/${encodeURIComponent(p.docNumber)}`}
							title={p.title}
							subtitle={t("meta", {
								number: p.docNumber,
								version: p.version,
								date: fmtDate.format(p.publishedAt),
							})}
							accessory={
								p.acknowledgedAt ? (
									<Badge variant="success">
										{t("ackDone", { date: fmtDate.format(p.acknowledgedAt) })}
									</Badge>
								) : (
									<Badge variant="warning">{t("ackOpen")}</Badge>
								)
							}
						/>
					))}
				</ListSection>
				{shared.length > 0 && (
					<ListSection title={t("shared")} footer={t("sharedFooter")}>
						{shared.map((e) => (
							<ListRow
								key={e.id}
								accessory={
									e.fileName ? (
										<a
											href={`/api/richtlinien/nachweis/${e.id}`}
											className="hit-area inline-flex items-center gap-1 text-primary text-subhead hover:underline"
										>
											<Download aria-hidden="true" className="size-4" />
											{t("downloadShort")}
										</a>
									) : e.url ? (
										<a
											href={e.url}
											target="_blank"
											rel="noopener noreferrer"
											className="hit-area inline-flex items-center gap-1 text-primary text-subhead hover:underline"
										>
											{t("openLink")}
											<ArrowUpRight aria-hidden="true" className="size-4" />
										</a>
									) : undefined
								}
								title={e.title}
								subtitle={
									e.validUntil
										? t("validUntil", {
												date: fmtDate.format(new Date(e.validUntil)),
											})
										: (e.description ?? undefined)
								}
							/>
						))}
					</ListSection>
				)}
			</ListGroup>
		</>
	);
}
