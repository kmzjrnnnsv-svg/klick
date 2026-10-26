import { ArrowUpRight, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MarkdownView } from "@/components/markdown-view";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { fmtDate } from "@/lib/compliance/page-data";
import type { PolicyItem, SharedEvidence } from "@/lib/policies/queries";

// Gültige Richtlinien mit Stand der Kenntnisnahme und freigegebene
// Nachweise — gleich in der App (/richtlinien) und im Portal (/portal/<slug>).
export async function PolicyList({
	policies,
	shared,
	detailBase,
	evidenceBase,
}: {
	policies: PolicyItem[];
	shared: SharedEvidence[];
	// /richtlinien bzw. /portal/<slug>
	detailBase: string;
	// Download-Route freigegebener Nachweise (…/<id>)
	evidenceBase: string;
}) {
	const t = await getTranslations("Policies");
	return (
		<ListGroup>
			<ListSection
				title={t("policies")}
				footer={policies.length === 0 ? t("empty") : undefined}
			>
				{policies.map((p) => (
					<ListRow
						key={p.documentId}
						href={`${detailBase}/${encodeURIComponent(p.docNumber)}`}
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
										href={`${evidenceBase}/${e.id}`}
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
	);
}

// Text bzw. Datei der gültigen Fassung (Detailseiten).
export async function PolicyBody({
	policy,
	fileHref,
}: {
	policy: PolicyItem;
	fileHref: string;
}) {
	const t = await getTranslations("Policies");
	return (
		<div className="flex max-w-3xl flex-col gap-4">
			{policy.fileEvidenceId && (
				<p className="text-subhead">
					<a
						href={fileHref}
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
	);
}
