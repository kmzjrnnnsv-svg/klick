import { ArrowLeft, Download, ExternalLink, PenLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ensureEvidenceStepUp } from "@/app/actions/evidence";
import { DeleteEvidenceButton } from "@/components/entity/evidence-delete";
import { ExportLink } from "@/components/entity/export-link";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { fmtDate } from "@/lib/compliance/page-data";
import { evidenceDetail } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { berlinToday } from "@/lib/evidence-studio/queries";

const fmtSize = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const size = (bytes: number) =>
	bytes < 1024 * 1024
		? `${fmtSize.format(bytes / 1024)} KB`
		: `${fmtSize.format(bytes / 1024 / 1024)} MB`;

// Ein Nachweis: Angaben, Datei oder Link, belegte Controls, Fassungen,
// Unterschriften. Herunterladen läuft auditiert über /api/nachweise/[id]
// (vertraulich und geheim nur nach Step-up).
export default async function EvidenceDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ evidence: ["read"] });
	const t = await getTranslations("Evidence");
	const td = await getTranslations("Dlp");
	const data = await readOrg(toOrgCtx(ctx), (tx) =>
		evidenceDetail(tx, ctx.orgId, id),
	);
	if (!data) notFound();
	const { row } = data;
	const e = env();
	const storageAvailable = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);
	const canDelete = allows(ctx, { evidence: ["delete"] });
	const kind = row.kindCode ? EVIDENCE_KIND_BY_CODE.get(row.kindCode) : null;
	const expired = row.validUntil !== null && row.validUntil < berlinToday();
	const sensitive =
		row.classification === "confidential" || row.classification === "secret";
	const dlpHits =
		row.dlp && row.dlp.action !== "allow"
			? row.dlp.findings.reduce((s, f) => s + f.count, 0)
			: 0;
	const download = `/api/nachweise/${row.id}`;
	const btn =
		"inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<>
			<Link
				href="/nachweise"
				className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-4" aria-hidden />
				{t("back")}
			</Link>
			<PageHeader
				eyebrow={kind ? `${kind.code} · ${kind.title}` : t(`type_${row.type}`)}
				title={row.title}
				lead={row.description ?? undefined}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{row.storageKey && storageAvailable && (
							<ExportLink
								href={download}
								className={btn}
								ensure={sensitive ? ensureEvidenceStepUp : undefined}
							>
								<Download className="size-4" aria-hidden="true" />
								{t("download")}
							</ExportLink>
						)}
						{row.url && (
							<a
								href={row.url}
								target="_blank"
								rel="noopener noreferrer"
								className={btn}
							>
								<ExternalLink className="size-4" aria-hidden="true" />
								{t("openLink")}
							</a>
						)}
						{canDelete && data.signatureCount === 0 && (
							<DeleteEvidenceButton id={row.id} />
						)}
					</div>
				}
			/>
			{data.supersededBy && (
				<p className="mb-6 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
					{t("supersededNote")}{" "}
					<Link
						href={`/nachweise/${data.supersededBy.id}`}
						className="text-primary hover:underline"
					>
						{data.supersededBy.title}
					</Link>
				</p>
			)}
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<section aria-labelledby="ev-details" className="flex flex-col gap-3">
					<h2
						id="ev-details"
						className="font-serif-display text-lg text-primary"
					>
						{t("details")}
					</h2>
					<dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
						<dt className="text-muted-foreground">{t("typeField")}</dt>
						<dd>{t(`type_${row.type}`)}</dd>
						<dt className="text-muted-foreground">{t("classification")}</dt>
						<dd className="flex flex-wrap items-center gap-2">
							{t(`class_${row.classification}`)}
							{dlpHits > 0 && (
								<Badge variant="outline">
									{td("badgeHits", { count: dlpHits })}
								</Badge>
							)}
						</dd>
						<dt className="text-muted-foreground">{t("source")}</dt>
						<dd>{t(`source_${row.source}`)}</dd>
						<dt className="text-muted-foreground">{t("validUntil")}</dt>
						<dd className="flex flex-wrap items-center gap-2">
							{row.validUntil
								? fmtDate.format(new Date(row.validUntil))
								: t("noValidity")}
							{expired && <Badge variant="warning">{t("expired")}</Badge>}
						</dd>
						<dt className="text-muted-foreground">{t("file")}</dt>
						<dd className="min-w-0 break-words">
							{row.fileName ? (
								<>
									{row.fileName}
									{row.sizeBytes !== null && (
										<span className="text-muted-foreground">
											{" "}
											· {size(row.sizeBytes)}
										</span>
									)}
									{row.storageKey && !storageAvailable && (
										<span className="block text-muted-foreground text-xs">
											{t("storageMissing")}
										</span>
									)}
								</>
							) : (
								<span className="text-muted-foreground">{t("noFile")}</span>
							)}
						</dd>
						{row.sha256 && (
							<>
								<dt className="text-muted-foreground">{t("sha256")}</dt>
								<dd className="break-all font-mono text-xs" translate="no">
									{row.sha256}
								</dd>
							</>
						)}
						{row.url && (
							<>
								<dt className="text-muted-foreground">{t("url")}</dt>
								<dd className="min-w-0 break-all">
									<a
										href={row.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										{row.url}
									</a>
								</dd>
							</>
						)}
						{data.supersedes && (
							<>
								<dt className="text-muted-foreground">{t("supersedes")}</dt>
								<dd>
									<Link
										href={`/nachweise/${data.supersedes.id}`}
										className="text-primary hover:underline"
									>
										{data.supersedes.title}
									</Link>
								</dd>
							</>
						)}
						<dt className="text-muted-foreground">{t("createdAt")}</dt>
						<dd className="flex flex-wrap items-center gap-2">
							{fmtDate.format(row.createdAt)}
							{data.createdByName && (
								<>
									<span className="text-muted-foreground">{t("by")}</span>
									<UserChip name={data.createdByName} />
								</>
							)}
						</dd>
					</dl>
				</section>
				<div className="flex flex-col gap-8">
					<section
						aria-labelledby="ev-controls"
						className="flex flex-col gap-3"
					>
						<h2
							id="ev-controls"
							className="font-serif-display text-lg text-primary"
						>
							{t("controlsTitle")}
						</h2>
						{data.controls.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("controlsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-1.5 text-sm">
								{data.controls.map((c) => (
									<li key={c.code} className="flex min-w-0 gap-2">
										<Link
											href={`/controls/${c.code}`}
											className="whitespace-nowrap font-mono text-primary text-xs hover:underline"
										>
											{c.code}
										</Link>
										<span className="min-w-0 break-words">{c.title}</span>
									</li>
								))}
							</ul>
						)}
					</section>
					<section
						aria-labelledby="ev-signatures"
						className="flex flex-col gap-3"
					>
						<h2
							id="ev-signatures"
							className="font-serif-display text-lg text-primary"
						>
							{t("signaturesTitle")}
						</h2>
						<p className="text-muted-foreground text-sm">
							{t("signaturesCount", { count: data.signatureCount })}
						</p>
						{data.signatureCount > 0 && (
							<Link
								href={`/nachweise/${row.id}/unterschriften`}
								className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
							>
								<PenLine className="size-4" aria-hidden="true" />
								{t("signaturesCheck")}
							</Link>
						)}
					</section>
				</div>
			</div>
		</>
	);
}
