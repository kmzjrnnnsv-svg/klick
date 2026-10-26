import { ArrowUpRight, Download, PenLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ensureEvidenceStepUp } from "@/app/actions/evidence";
import { DeleteEvidenceButton } from "@/components/entity/evidence-delete";
import { EvidenceVersionForm } from "@/components/entity/evidence-version-form";
import { ExportLink } from "@/components/entity/export-link";
import { ResponsibleEditor } from "@/components/entity/responsible-editor";
import { UserChip } from "@/components/entity/user-chip";
import { NewVersionButton } from "@/components/evidence-authoring/start-draft";
import { MarkdownView } from "@/components/markdown-view";
import { PageHeader } from "@/components/page-header";
import { SignButton } from "@/components/signatures/sign-button";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { ownRoleIdOf } from "@/lib/compliance/function-key";
import { fmtDate } from "@/lib/compliance/page-data";
import { evidenceDetail, listMembersForPicker } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { isDbStorageKey } from "@/lib/evidence/aad";
import { s3Configured } from "@/lib/evidence/store";
import { authoredBlocks } from "@/lib/evidence-authoring/render";
import {
	authoredContentOf,
	authoredSignState,
} from "@/lib/evidence-authoring/service";
import { presetOf } from "@/lib/evidence-authoring/templates";
import { functionLabel } from "@/lib/evidence-studio/generate/doc";
import { evidenceSignState } from "@/lib/evidence-studio/generate/service";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { renderBlocksMarkdown } from "@/lib/export/doc-model";
import { orgRoleNames } from "@/lib/org/roles";

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
	const ta = await getTranslations("Authoring");
	const ts = await getTranslations("Signatures");
	const tf = await getTranslations("Functions");
	const te = await getTranslations("Entity");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const detail = await evidenceDetail(tx, ctx.orgId, id);
		if (!detail) return null;
		const { row } = detail;
		return {
			...detail,
			members: await listMembersForPicker(tx, ctx.orgId),
			roleNames: await orgRoleNames(tx, ctx.orgId),
			authored: row.templateKey
				? await authoredContentOf(tx, ctx.orgId, row.id)
				: null,
			sign: row.templateKey
				? await authoredSignState(tx, ctx.orgId, row.id, ctx.userId)
				: row.kindCode
					? await evidenceSignState(
							tx,
							ctx.orgId,
							row.kindCode,
							row.id,
							ctx.userId,
						)
					: null,
		};
	});
	if (!data) notFound();
	const { row, authored, sign, roleNames } = data;
	// eigene Rolle (`role:<id>`, ADR-024) mit Namen
	const fnLabel = (f: string) =>
		f === "-"
			? ta("authorSlot")
			: ownRoleIdOf(f)
				? (roleNames[ownRoleIdOf(f) as string] ?? f)
				: tf.has(f as "other")
					? tf(f as "other")
					: functionLabel(f);
	const canCreate = allows(ctx, { evidence: ["create"] });
	// S3-Objekt ohne eingerichteten Objektspeicher ist nicht abrufbar
	const fileReadable =
		row.storageKey !== null &&
		(isDbStorageKey(row.storageKey) || s3Configured());
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
		"inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-full bg-muted px-3 font-medium text-footnote hover:bg-foreground/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<>
			<BackLink href="/nachweise" label={t("back")} />
			<PageHeader
				eyebrow={
					authored
						? `${authored.template.code} · ${presetOf(authored.template, authored.preset)?.title ?? authored.template.title}`
						: kind
							? `${kind.code} · ${kind.title}`
							: t(`type_${row.type}`)
				}
				title={row.title}
				lead={row.description ?? undefined}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{fileReadable && (
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
								{t("openLink")}
								<ArrowUpRight className="size-4" aria-hidden="true" />
							</a>
						)}
						{authored && canCreate && !data.supersededBy && (
							<NewVersionButton evidenceId={row.id} />
						)}
						{canCreate &&
							!row.supersededAt &&
							!authored &&
							!row.kindCode &&
							row.source !== "document" &&
							fileReadable && (
								<EvidenceVersionForm
									evidenceId={row.id}
									title={row.title}
									validUntilRequired={row.validUntil !== null}
								/>
							)}
						{canDelete && data.signatureCount === 0 && (
							<DeleteEvidenceButton id={row.id} />
						)}
					</div>
				}
			/>
			{data.supersededBy && (
				<p className="mb-6 rounded-xl bg-warning/12 px-3 py-2 text-subhead">
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
					<h2 id="ev-details" className="font-semibold text-headline">
						{t("details")}
					</h2>
					<dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-subhead sm:grid-cols-[11rem_minmax(0,1fr)]">
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
							{row.supersededAt ? (
								<Badge variant="muted">{t("superseded")}</Badge>
							) : (
								expired && <Badge variant="warning">{t("expired")}</Badge>
							)}
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
									{row.storageKey && !fileReadable && (
										<span className="block text-muted-foreground text-footnote">
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
								<dd
									className="break-all font-mono text-footnote"
									translate="no"
								>
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
						<dt className="text-muted-foreground">{te("owner")}</dt>
						<dd>
							<ResponsibleEditor
								entity="evidence"
								id={row.id}
								ownerUserId={row.ownerUserId}
								ownerFunction={row.ownerFunction}
								ownerName={data.ownerName}
								members={data.members}
								canEdit={canCreate}
							/>
						</dd>
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
						<h2 id="ev-controls" className="font-semibold text-headline">
							{t("controlsTitle")}
						</h2>
						{data.controls.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("controlsEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-1.5 text-subhead">
								{data.controls.map((c) => (
									<li key={c.code} className="flex min-w-0 gap-2">
										<Link
											href={`/controls/${c.code}`}
											className="whitespace-nowrap font-mono text-primary text-footnote hover:underline"
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
						<h2 id="ev-signatures" className="font-semibold text-headline">
							{t("signaturesTitle")}
						</h2>
						<p className="text-muted-foreground text-subhead">
							{t("signaturesCount", { count: data.signatureCount })}
						</p>
						{sign && sign.signatures.length > 0 && (
							<ul className="flex flex-col gap-1 text-subhead">
								{sign.signatures.map((s) => (
									<li key={`${s.name}-${s.signedAt}`}>
										{ts("signedLine", {
											name: s.name,
											fn: s.function ? fnLabel(s.function) : "—",
											date: fmtDate.format(new Date(s.signedAt)),
										})}
									</li>
								))}
							</ul>
						)}
						{sign && sign.open.length > 0 && (
							<p className="text-subhead text-warning">
								{ts("openFor", { fns: sign.open.map(fnLabel).join(", ") })}
							</p>
						)}
						{sign?.signAs && !row.supersededAt && (
							<div>
								<SignButton
									evidenceIds={[row.id]}
									fn={sign.signAs}
									purpose={kind?.signPurpose ?? "approve"}
									label={
										kind?.signPurpose === "acknowledge"
											? ts("acknowledge")
											: ts("sign")
									}
									fullLabel={
										kind?.signPurpose === "acknowledge"
											? ts("acknowledgeAs", { fn: fnLabel(sign.signAs) })
											: ts("signAs", { fn: fnLabel(sign.signAs) })
									}
									variant="default"
								/>
							</div>
						)}
						{data.signatureCount > 0 && (
							<Link
								href={`/nachweise/${row.id}/unterschriften`}
								className="inline-flex items-center gap-1.5 text-primary text-subhead hover:underline"
							>
								<PenLine className="size-4" aria-hidden="true" />
								{t("signaturesCheck")}
							</Link>
						)}
					</section>
				</div>
			</div>
			{authored && (
				<section
					aria-labelledby="ev-content"
					className="mt-10 flex flex-col gap-3 rounded-2xl bg-card p-4"
				>
					<h2 id="ev-content" className="font-semibold text-headline">
						{ta("contentTitle")}
					</h2>
					<MarkdownView
						source={renderBlocksMarkdown(
							authoredBlocks(
								authored.template,
								authored.content,
								authored.preset,
							),
						)}
					/>
				</section>
			)}
		</>
	);
}
