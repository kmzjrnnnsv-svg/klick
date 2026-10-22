import { and, desc, eq, notInArray } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { PublishControls } from "@/components/trust-center/publish-controls";
import { RequestActions } from "@/components/trust-center/request-actions";
import { TrustSettingsForm } from "@/components/trust-center/settings-form";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { documents, trustAccessRequests } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { trustPublicPath } from "@/lib/trust/labels";
import { requestState, suggestSlug } from "@/lib/trust/rules";
import {
	defaultTrustSettings,
	loadSnapshotInput,
	loadTrustCenter,
	orgName,
} from "@/lib/trust/service";
import { buildTrustSnapshot } from "@/lib/trust/snapshot";

const TABS = ["inhalt", "anfragen"] as const;

// /trust-center — öffentliche Vertrauensseite der Org pflegen und
// Anfragen nach vertraulichen Unterlagen freigeben.
export default async function TrustCenterAdminPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const ctx = await requireOrgPage({ settings: ["read"] });
	const t = await getTranslations("TrustCenter");
	const sp = await searchParams;
	const tab = TABS.find((x) => x === sp.tab) ?? "inhalt";
	const canEdit = allows(ctx, { settings: ["update"] });
	const now = new Date();

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [center, name, docs, requests] = await Promise.all([
			loadTrustCenter(tx, ctx.orgId),
			orgName(tx, ctx.orgId),
			tx
				.select({
					id: documents.id,
					docNumber: documents.docNumber,
					title: documents.title,
					classification: documents.classification,
					status: documents.status,
				})
				.from(documents)
				.where(
					and(
						eq(documents.organizationId, ctx.orgId),
						notInArray(documents.status, ["retired", "superseded"]),
					),
				)
				.orderBy(documents.docNumber),
			tx
				.select()
				.from(trustAccessRequests)
				.where(eq(trustAccessRequests.organizationId, ctx.orgId))
				.orderBy(desc(trustAccessRequests.createdAt))
				.limit(200),
		]);
		const settings = center?.settings ?? defaultTrustSettings(name);
		const input = await loadSnapshotInput(tx, ctx.orgId, settings, now);
		return {
			center,
			name,
			docs,
			requests,
			settings,
			preview: buildTrustSnapshot(input),
			frameworks: input.activeFrameworks.map((f) => ({
				slug: f,
				name: input.frameworkNames[f] ?? f,
			})),
		};
	});
	const { center, docs, requests, settings, preview, frameworks } = data;
	const pending = requests.filter((r) => r.status === "pending").length;
	const slug = center?.slug ?? suggestSlug(data.name);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					center?.published ? (
						<a
							href={trustPublicPath(center.slug)}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
						>
							{t("openPublic")}
							<ExternalLink className="size-3.5" aria-hidden="true" />
						</a>
					) : undefined
				}
			/>

			<div className="mb-6 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-col gap-1">
					<p className="flex flex-wrap items-center gap-2 font-medium">
						{center?.published ? (
							<Badge>{t("statePublished")}</Badge>
						) : (
							<Badge variant="outline">{t("stateDraft")}</Badge>
						)}
						<span className="break-all font-mono text-sm" translate="no">
							{trustPublicPath(slug)}
						</span>
					</p>
					<p className="text-muted-foreground text-sm">
						{center?.published && center.publishedAt
							? t("publishedAt", { date: fmtDate.format(center.publishedAt) })
							: t("notPublished")}
					</p>
				</div>
				{canEdit && (
					<PublishControls
						saved={Boolean(center)}
						published={Boolean(center?.published)}
					/>
				)}
			</div>

			<UrlTabs
				base="/trust-center"
				active={tab}
				tabs={[
					{ value: "inhalt", label: t("tabContent") },
					{ value: "anfragen", label: t("tabRequests"), count: pending },
				]}
			/>

			{tab === "inhalt" ? (
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<TrustSettingsForm
						slug={slug}
						settings={settings}
						canEdit={canEdit}
						frameworks={frameworks}
						documents={docs}
					/>
					<aside
						aria-label={t("previewTitle")}
						className="flex flex-col gap-3 rounded-md border p-4 text-sm lg:self-start"
					>
						<p className="font-medium">{t("previewTitle")}</p>
						<p className="text-muted-foreground">{t("previewLead")}</p>
						<ul className="flex flex-col gap-1">
							<li>
								{t("previewFrameworks", {
									n: preview.snapshot.frameworks.length,
								})}
							</li>
							<li>
								{t("previewDocuments", {
									pub: preview.snapshot.documents.filter(
										(d) => d.access === "public",
									).length,
									nda: preview.snapshot.documents.filter(
										(d) => d.access === "nda",
									).length,
								})}
							</li>
							{preview.snapshot.subprocessors && (
								<li>
									{t("previewSubprocessors", {
										n: preview.snapshot.subprocessors.length,
									})}
								</li>
							)}
						</ul>
						{preview.warnings.length > 0 && (
							<div className="flex flex-col gap-1">
								<p className="font-medium">{t("previewWarnings")}</p>
								<ul className="flex flex-col gap-1 text-muted-foreground">
									{preview.warnings.map((w) => (
										<li key={`${w.kind}:${w.ref}`}>
											{t(`warning_${w.kind}`, { ref: w.ref })}
										</li>
									))}
								</ul>
							</div>
						)}
					</aside>
				</div>
			) : requests.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("requestsEmpty")}</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("colRequester")}</TableHead>
							<TableHead>{t("colReason")}</TableHead>
							<TableHead>{t("colState")}</TableHead>
							<TableHead>{t("colReceived")}</TableHead>
							<TableHead className="text-right">
								<span className="sr-only">{t("colActions")}</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{requests.map((r) => {
							const state = requestState(r, now);
							return (
								<TableRow key={r.id} className="align-top">
									<TableCell>
										<p className="font-medium">{r.name}</p>
										<p className="text-muted-foreground text-xs">
											{r.company} · {r.email}
										</p>
									</TableCell>
									<TableCell className="max-w-xs text-muted-foreground text-sm">
										{r.reason ?? "—"}
									</TableCell>
									<TableCell>
										<Badge variant={state === "active" ? "default" : "outline"}>
											{t(`reqState_${state}`)}
										</Badge>
										{state === "active" && r.expiresAt && (
											<p className="mt-1 text-muted-foreground text-xs">
												{t("until", { date: fmtDate.format(r.expiresAt) })}
											</p>
										)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground text-sm">
										{fmtDate.format(r.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										{canEdit && (
											<RequestActions id={r.id} name={r.name} state={state} />
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</>
	);
}
