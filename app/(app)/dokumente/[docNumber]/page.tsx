import { and, eq, inArray } from "drizzle-orm";
import { ChevronRight, Download, FileText } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApprovalBar } from "@/components/approvals/approval-bar";
import { AckButton } from "@/components/documents/ack-button";
import { ApproverFunctionSelect } from "@/components/documents/approver-select";
import { DistributionEditor } from "@/components/documents/distribution-editor";
import { DocumentFileForm } from "@/components/documents/document-file-form";
import {
	DocumentEditor,
	NewVersionDialog,
} from "@/components/documents/document-forms";
import {
	type SignatureLine,
	SignatureList,
} from "@/components/documents/signature-list";
import {
	DiffView,
	type TrailVersion,
	textDiff,
	VersionChanges,
} from "@/components/documents/version-trail";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { ExportLink } from "@/components/entity/export-link";
import { ResponsibleEditor } from "@/components/entity/responsible-editor";
import { StatusButton } from "@/components/entity/status-button";
import { WatchButton } from "@/components/entity/watch-button";
import { MarkdownView } from "@/components/markdown-view";
import { DecisionRequestsBlock } from "@/components/resolutions/decision-requests-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { nativeSelectCompactClass } from "@/components/ui/input";
import { evidence } from "@/db/schema";
import { canDecideNow } from "@/lib/approvals/rules";
import {
	activeDelegations,
	latestRequestFor,
	loadCandidates,
} from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import { allows } from "@/lib/auth/permissions";
import { hidesSecret, restrictedView } from "@/lib/auth/visibility";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listWatcherIds,
	userNames,
} from "@/lib/compliance/queries";
import { getDocumentByNumber } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { diffLines } from "@/lib/documents/diff";
import { compactDiff, versionTrails } from "@/lib/documents/trail";
import {
	currentPublished,
	type VersionState,
	validRanges,
	versionState,
} from "@/lib/documents/versions";
import { functionLabel } from "@/lib/evidence-studio/generate/doc";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";
import { portalAcknowledgementsFor } from "@/lib/policy-portal/admin";
import {
	checkDocumentSignature,
	documentSignaturesFor,
} from "@/lib/signatures/document";

export default async function DocumentDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ docNumber: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { docNumber: raw } = await params;
	const sp = await searchParams;
	const one = (v: string | string[] | undefined) =>
		Array.isArray(v) ? v[0] : v;
	const docNumber = decodeURIComponent(raw);
	const ctx = await requireOrgPage({ document: ["read"] });
	const t = await getTranslations("Documents");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const d = await getDocumentByNumber(tx, ctx.orgId, docNumber);
		if (!d) return null;
		const [comments, history, watcherIds, members, approval, candidates, dels] =
			await Promise.all([
				listComments(tx, ctx.orgId, "document", d.doc.id),
				// länger als der Aktivitätsstrom: der Verlauf je Fassung reicht
				// bis zur ersten Fassung zurück
				historyFor(tx, `document:${d.doc.id}`, 2000),
				listWatcherIds(tx, ctx.orgId, "document", d.doc.id),
				listMembersForPicker(tx, ctx.orgId),
				latestRequestFor(tx, ctx.orgId, "document", d.doc.id),
				loadCandidates(tx, ctx.orgId),
				activeDelegations(tx, ctx.orgId),
			]);
		const signatures = await documentSignaturesFor(tx, ctx.orgId, d.doc.id);
		// Dateien der Fassungen (Name, Prüfsumme) für „Datei ersetzt“
		const fileIds = d.versions
			.map((v) => v.fileEvidenceId)
			.filter((x): x is string => x !== null);
		const files =
			fileIds.length > 0
				? await tx
						.select({
							id: evidence.id,
							fileName: evidence.fileName,
							sha256: evidence.sha256,
						})
						// evidence:any-version — Dateien von Dokumentfassungen per ID
						.from(evidence)
						.where(
							and(
								eq(evidence.organizationId, ctx.orgId),
								inArray(evidence.id, fileIds),
							),
						)
				: [];
		const names = await userNames(tx, [
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
			...(approval?.decisions.map((x) => x.approverUserId) ?? []),
		]);
		for (const [k, v] of d.names) names.set(k, v);
		return {
			...d,
			comments,
			history,
			watcherIds,
			members,
			approval,
			candidates,
			dels,
			names,
			signatures,
			files,
		};
	});
	if (!data) notFound();
	const {
		doc,
		versions,
		controls,
		acks,
		comments,
		history,
		watcherIds,
		members,
		approval,
		candidates,
		dels,
		names,
		signatures,
		files,
	} = data;
	// Unterschriften je Fassung mit Prüfung (Prüfsumme der Fassung jetzt)
	const signEnv = { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID };
	const signLines = new Map<string, SignatureLine[]>();
	for (const sig of signatures) {
		const v = versions.find((x) => x.id === sig.versionId);
		const line: SignatureLine = {
			id: sig.id,
			signerName: sig.signerName,
			functionLabel: sig.function ? functionLabel(sig.function) : null,
			signedAt: sig.signedAt,
			valid: checkDocumentSignature(sig, signEnv, v?.contentSha256 ?? null)
				.valid,
		};
		signLines.set(sig.versionId, [
			...(signLines.get(sig.versionId) ?? []),
			line,
		]);
	}
	// Prüfer-Sicht: nur die gültige Fassung, keine Arbeitskopie, Freigabe
	// oder Verlauf; streng geheim ohne Grant nur der Hinweis
	const restricted = restrictedView(ctx);
	const canEdit = allows(ctx, { document: ["update"] }) && !restricted;
	const me = candidates.find((c) => c.userId === ctx.userId);
	const step = approval?.steps.find((s) => s.order === approval.currentStep);
	const eligible = Boolean(
		approval &&
			approval.status === "pending" &&
			step &&
			me &&
			canDecideNow(
				step,
				me,
				{
					requesterUserId: approval.requestedByUserId,
					entityOwnerUserId: doc.ownerUserId,
					delegations: dels,
				},
				candidates,
				approval.decisions.filter((d) => d.step === approval.currentStep),
			),
	);
	// Gültig ist die zuletzt veröffentlichte, nicht zurückgezogene Fassung;
	// die Arbeitskopie (Entwurf, in Prüfung, freigegeben) steht getrennt
	const current = currentPublished(versions);
	if (restricted && !current) notFound();
	if (hidesSecret(ctx, doc))
		return (
			<EntityLayout
				back={{ href: "/dokumente", label: tNav("documents") }}
				eyebrow={doc.docNumber}
				title={t("secretTitle")}
				aside={null}
			>
				<p className="text-muted-foreground text-subhead">{t("secretLead")}</p>
			</EntityLayout>
		);
	const ranges = validRanges(versions);
	const working =
		doc.status === "draft" ||
		doc.status === "in_review" ||
		doc.status === "approved";
	const acksForCurrent = current
		? acks.filter((a) => a.documentVersionId === current.id)
		: [];
	const myAck = acksForCurrent.some((a) => a.userId === ctx.userId);
	// Kenntnisnahmen über das Richtlinien-Portal (Leser:innen ohne Konto)
	const portalAcks =
		current && !restricted
			? await readOrg(toOrgCtx(ctx), (tx) =>
					portalAcknowledgementsFor(tx, ctx.orgId, current.id),
				)
			: [];
	const diff =
		working && current && doc.bodyMarkdown && current.bodyMarkdown
			? diffLines(current.bodyMarkdown, doc.bodyMarkdown)
			: null;
	// Altbestand: veröffentlichte Fassung trägt einen anderen Text als die
	// Arbeitskopie (vor Migration 0042 möglich) — neu einreichen
	const stale =
		!working &&
		current !== null &&
		((current.bodyMarkdown ?? "") !== (doc.bodyMarkdown ?? "") ||
			(current.fileEvidenceId ?? null) !== (doc.fileEvidenceId ?? null));
	const stateVariant: Record<
		VersionState,
		"success" | "default" | "outline" | "muted" | "warning"
	> = {
		current: "success",
		approved: "default",
		in_review: "warning",
		draft: "outline",
		superseded: "muted",
		retired: "muted",
	};
	const basisVersions = versions
		.filter((v) => v.approvedAt || v.publishedAt)
		.map((v) => v.version);
	const workingTitle =
		doc.status === "in_review"
			? t("workingCopyReview", { version: doc.version })
			: doc.status === "approved"
				? t("workingCopyApproved", { version: doc.version })
				: t("workingCopy", { version: doc.version });
	// PDF „Gelenkte Fassung“ (Step-up im Dialog, dann Download)
	const canExport = allows(ctx, { export: ["create"] });
	const pdfHref = (version: string) =>
		`/api/export/dokument.pdf?nr=${encodeURIComponent(doc.docNumber)}&fassung=${encodeURIComponent(version)}`;
	const pdfLink = (version: string, label: string) => (
		<ExportLink
			href={pdfHref(version)}
			className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
		>
			<FileText aria-hidden="true" className="size-4" />
			{label}
		</ExportLink>
	);
	const fileLink = (id: string, label: string) => (
		<p className="text-subhead">
			<a
				href={`/api/nachweise/${id}`}
				className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
			>
				<Download aria-hidden="true" className="size-4" />
				{label}
			</a>
		</p>
	);

	// Verlauf je Fassung aus dem Protokoll (wer begonnen, bearbeitet,
	// eingereicht, veröffentlicht hat) und Text/Datei je Fassung
	const trails = versionTrails(
		versions.at(-1)?.version ?? doc.version,
		history.map((h) => ({
			at: h.at,
			actorUserId: h.actorUserId,
			action: h.action,
			after: h.after,
		})),
	);
	const fileById = new Map(files.map((f) => [f.id, f]));
	const trailVersion = (v: (typeof versions)[number]): TrailVersion => {
		const f = v.fileEvidenceId ? fileById.get(v.fileEvidenceId) : undefined;
		return {
			version: v.version,
			bodyMarkdown: v.bodyMarkdown,
			file: f ? { name: f.fileName ?? "Datei", sha256: f.sha256 } : null,
		};
	};
	// Vergleich zweier beliebiger Fassungen (?von=&bis=)
	const cmpFrom = versions.find((v) => v.version === one(sp.von));
	const cmpTo = versions.find((v) => v.version === one(sp.bis));
	const compare =
		!restricted && cmpFrom && cmpTo
			? (() => {
					const d = textDiff(cmpFrom.bodyMarkdown, cmpTo.bodyMarkdown);
					return {
						from: cmpFrom,
						to: cmpTo,
						added: d.added,
						removed: d.removed,
						lines: compactDiff(d.lines, 2),
					};
				})()
			: null;

	const entries: ActivityEntry[] = mergeActivity(
		toHistoryItems(history.slice(0, 200)),
		comments.map((c) => ({
			type: "comment" as const,
			at: c.createdAt,
			comment: {
				id: c.id,
				authorUserId: c.authorUserId,
				bodyMarkdown: c.bodyMarkdown,
				parentId: c.parentId,
				editedAt: c.editedAt,
			},
		})),
	);

	return (
		<EntityLayout
			back={{ href: "/dokumente", label: tNav("documents") }}
			eyebrow={`${doc.docNumber} · ${t(`type_${doc.type}`)} · v${restricted && current ? current.version : doc.version}`}
			title={doc.title}
			status={
				restricted ? (
					<Badge variant="success">{t("state_current")}</Badge>
				) : (
					<StatusButton
						target={{
							kind: "document",
							documentId: doc.id,
							status: doc.status,
						}}
						disabled={!canEdit}
					/>
				)
			}
			actions={
				<>
					{current && !myAck && !restricted && (
						<AckButton documentId={doc.id} />
					)}
					{canEdit && !working && (
						<NewVersionDialog
							documentId={doc.id}
							version={doc.version}
							basisVersions={basisVersions}
						/>
					)}
					<WatchButton
						entityType="document"
						entityId={doc.id}
						watching={watcherIds.includes(ctx.userId)}
					/>
				</>
			}
			meta={
				<>
					<MetaItem label={t("current")}>
						{current
							? t("inForceSince", {
									version: current.version,
									date: fmtDate.format(current.publishedAt ?? new Date()),
								})
							: t("currentNone")}
					</MetaItem>
					<MetaItem label={t("owner")}>
						<ResponsibleEditor
							entity="document"
							id={doc.id}
							ownerUserId={doc.ownerUserId}
							ownerFunction={doc.ownerFunction}
							ownerName={names.get(doc.ownerUserId ?? "") ?? null}
							members={members}
							canEdit={canEdit}
						/>
					</MetaItem>
					<MetaItem label={t("approver")}>
						<ApproverFunctionSelect
							documentId={doc.id}
							value={doc.approverFunction}
							canEdit={canEdit}
						/>
					</MetaItem>
					<MetaItem label={t("classification")}>{doc.classification}</MetaItem>
					<MetaItem label={t("distribution")}>
						<DistributionEditor
							documentId={doc.id}
							value={doc.distribution}
							canEdit={canEdit}
						/>
					</MetaItem>
					<MetaItem label={t("nextReview")}>
						{doc.nextReviewAt
							? fmtDate.format(new Date(doc.nextReviewAt))
							: "—"}
					</MetaItem>
				</>
			}
			aside={
				<>
					{!restricted && (
						<DecisionRequestsBlock
							ctx={ctx}
							kind="document"
							id={doc.id}
							title={`${doc.docNumber} ${doc.title}`}
						/>
					)}
					{!restricted && (
						<Section title={te("activity")}>
							<CommentForm
								entityType="document"
								entityId={doc.id}
								link={`/dokumente/${encodeURIComponent(doc.docNumber)}`}
							/>
							<ActivityStream
								entries={entries}
								names={names}
								labels={{
									empty: te("activityEmpty"),
									changed: te("changed"),
									commented: te("commented"),
									system: te("system"),
								}}
							/>
						</Section>
					)}
					<Section title={t("controls")}>
						{controls.length === 0 ? (
							<p className="text-muted-foreground text-subhead">—</p>
						) : (
							<ul className="flex flex-wrap gap-1.5">
								{controls.map((c) => (
									<Link
										key={c.code}
										href={`/controls/${c.code}`}
										title={c.title}
									>
										<Badge variant="outline" className="font-mono">
											{c.code}
										</Badge>
									</Link>
								))}
							</ul>
						)}
						{doc.legalBasisRefs.length > 0 && (
							<p className="text-muted-foreground text-footnote">
								{t("requirements")}: {doc.legalBasisRefs.join(" · ")}
							</p>
						)}
					</Section>
				</>
			}
		>
			{!restricted && (
				<ApprovalBar
					data={
						approval
							? {
									...approval,
									decisions: approval.decisions.map((d) => ({
										step: d.step,
										approverUserId: d.approverUserId,
										decision: d.decision,
										note: d.note,
										decidedAt: d.decidedAt,
									})),
								}
							: null
					}
					names={names}
					eligible={eligible}
					currentUserId={ctx.userId}
					signDocumentId={doc.id}
				/>
			)}

			<Section
				title={t("inForce")}
				actions={
					current && canExport
						? pdfLink(current.version, t("pdfDownload"))
						: null
				}
			>
				{current ? (
					<>
						<p className="text-muted-foreground text-footnote">
							{t("inForceSince", {
								version: current.version,
								date: fmtDate.format(current.publishedAt ?? new Date()),
							})}
						</p>
						{stale && (
							<Alert variant="warning">
								<AlertDescription>{t("staleText")}</AlertDescription>
							</Alert>
						)}
						<SignatureList lines={signLines.get(current.id) ?? []} />
						{current.fileEvidenceId &&
							fileLink(
								current.fileEvidenceId,
								t("fileOfVersion", { version: current.version }),
							)}
						{current.bodyMarkdown && working ? (
							// während ein Entwurf läuft: Text eingeklappt, der Unterschied
							// steht unten
							<details className="group rounded-2xl bg-card text-subhead">
								<summary className="flex min-h-(--control-h) cursor-pointer items-center gap-2 px-4 text-primary">
									<ChevronRight
										aria-hidden="true"
										className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
									/>
									{t("showCurrentText", { version: current.version })}
								</summary>
								<div className="border-border/60 border-t px-4 pb-4">
									<MarkdownView source={current.bodyMarkdown} />
								</div>
							</details>
						) : current.bodyMarkdown ? (
							<MarkdownView source={current.bodyMarkdown} />
						) : (
							!current.fileEvidenceId && (
								<p className="text-muted-foreground text-subhead">
									{t("noContent")}
								</p>
							)
						)}
					</>
				) : (
					<p className="text-muted-foreground text-subhead">
						{doc.status === "retired" ? t("inForceRetired") : t("inForceNone")}
					</p>
				)}
			</Section>

			{working && !restricted && (
				<Section
					title={workingTitle}
					actions={
						canEdit && doc.status === "draft" ? (
							<DocumentFileForm
								documentId={doc.id}
								hasFile={doc.fileEvidenceId !== null}
							/>
						) : null
					}
				>
					{current && (
						<p className="text-muted-foreground text-footnote">
							{t("workingCopyLead", { version: current.version })}
						</p>
					)}
					{doc.changeSummary && (
						<p className="text-subhead">{doc.changeSummary}</p>
					)}
					{canExport && (
						<p className="text-subhead">
							{pdfLink(doc.version, t("pdfWorking", { version: doc.version }))}
						</p>
					)}
					{doc.fileEvidenceId &&
						fileLink(
							doc.fileEvidenceId,
							t("fileOfVersion", { version: doc.version }),
						)}
					<DocumentEditor
						documentId={doc.id}
						body={doc.bodyMarkdown ?? ""}
						editable={canEdit && doc.status === "draft"}
					/>
				</Section>
			)}

			{diff && !restricted && (
				<Section title={t("diff")}>
					<pre className="max-h-96 overflow-auto rounded-xl bg-muted p-3 font-mono text-footnote">
						{diff.map((l, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
								key={`${i}-${l.type}`}
								className={
									l.type === "add"
										? "bg-success/15"
										: l.type === "del"
											? "bg-destructive/10 line-through"
											: ""
								}
							>
								{l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
								{l.text}
							</div>
						))}
					</pre>
				</Section>
			)}

			{!restricted && (
				<Section title={t("versions")}>
					{versions.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("versionsEmpty")}
						</p>
					) : (
						<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
							{versions.map((v, i) => {
								const state = versionState(v, doc, versions);
								const range = ranges.get(v.id);
								return (
									<li key={v.id} className="flex flex-col gap-1 px-4 py-2.5">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium tabular-nums">
												v{v.version}
											</span>
											<Badge variant={stateVariant[state]}>
												{t(`state_${state}`)}
											</Badge>
											<span className="min-w-0 flex-1 break-words">
												{v.changeSummary}
											</span>
										</div>
										<p className="flex flex-wrap gap-x-3 text-muted-foreground text-footnote">
											{range && (
												<span>
													{range.until
														? t("validRange", {
																from: fmtDate.format(range.from),
																until: fmtDate.format(range.until),
															})
														: t("validFrom", {
																from: fmtDate.format(range.from),
															})}
												</span>
											)}
											{v.approvedAt && (
												<span>
													{names.get(v.approvedByUserId ?? "")
														? t("approvedBy", {
																name: names.get(v.approvedByUserId ?? "") ?? "",
																date: fmtDate.format(v.approvedAt),
															})
														: t("approvedOn", {
																date: fmtDate.format(v.approvedAt),
															})}
												</span>
											)}
											{canExport && pdfLink(v.version, t("pdfShort"))}
											{v.fileEvidenceId && (
												<a
													href={`/api/nachweise/${v.fileEvidenceId}`}
													className="hit-area inline-flex items-center gap-1 text-primary hover:underline"
												>
													<Download aria-hidden="true" className="size-3.5" />
													{t("file")}
												</a>
											)}
										</p>
										<SignatureList lines={signLines.get(v.id) ?? []} />
										<VersionChanges
											version={trailVersion(v)}
											previous={
												versions[i + 1] ? trailVersion(versions[i + 1]) : null
											}
											trail={trails.get(v.version)}
											names={names}
										/>
									</li>
								);
							})}
						</ul>
					)}
				</Section>
			)}

			{!restricted && versions.length > 1 && (
				<Section title={t("compareTitle")}>
					<Form
						action={`/dokumente/${encodeURIComponent(doc.docNumber)}`}
						scroll={false}
						className="flex flex-wrap items-end gap-2"
					>
						<label className="flex flex-col gap-1 text-footnote">
							<span className="text-muted-foreground">{t("compareFrom")}</span>
							<select
								name="von"
								defaultValue={compare?.from.version ?? versions[1]?.version}
								className={nativeSelectCompactClass}
							>
								{versions.map((v) => (
									<option key={v.id} value={v.version}>
										v{v.version}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-footnote">
							<span className="text-muted-foreground">{t("compareTo")}</span>
							<select
								name="bis"
								defaultValue={compare?.to.version ?? versions[0]?.version}
								className={nativeSelectCompactClass}
							>
								{versions.map((v) => (
									<option key={v.id} value={v.version}>
										v{v.version}
									</option>
								))}
							</select>
						</label>
						<button
							type="submit"
							className={buttonVariants({ variant: "secondary", size: "sm" })}
						>
							{t("compareApply")}
						</button>
					</Form>
					{compare && (
						<>
							<p className="text-subhead">
								{compare.added + compare.removed === 0
									? t("compareSame", {
											from: compare.from.version,
											to: compare.to.version,
										})
									: t("compareResult", {
											from: compare.from.version,
											to: compare.to.version,
											added: compare.added,
											removed: compare.removed,
										})}
							</p>
							{compare.lines.length > 0 && <DiffView lines={compare.lines} />}
						</>
					)}
				</Section>
			)}

			{current && !restricted && (
				<Section title={t("acknowledgements")}>
					<p className="text-subhead">
						{t("ackFor", { version: current.version })} ·{" "}
						{t("ackQuota", {
							done: acksForCurrent.length,
							total: members.length,
						})}
					</p>
					<ul className="flex flex-wrap gap-1.5 text-footnote">
						{members.map((m) => {
							const done = acksForCurrent.some((a) => a.userId === m.userId);
							return (
								<Badge key={m.userId} variant={done ? "success" : "muted"}>
									{m.name}
								</Badge>
							);
						})}
					</ul>
					{portalAcks.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<p className="text-subhead">
								{t("ackPortal", { count: portalAcks.length })}
							</p>
							<ul className="flex flex-wrap gap-1.5 text-footnote">
								{portalAcks.map((a) => (
									<Badge key={a.email} variant="success">
										<span translate="no">{a.email}</span>
									</Badge>
								))}
							</ul>
							<p className="text-muted-foreground text-footnote">
								{t("ackPortalNote")}
							</p>
						</div>
					)}
				</Section>
			)}
		</EntityLayout>
	);
}
