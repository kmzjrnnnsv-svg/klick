import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	CeremonyForm,
	KeyHolderForm,
	RevokeHolderButton,
	WalletForm,
} from "@/components/custody/custody-forms";
import { ActivityStream } from "@/components/entity/activity-stream";
import { CommentForm } from "@/components/entity/comment-form";
import {
	EntityLayout,
	MetaItem,
	Section,
} from "@/components/entity/entity-layout";
import { OwnerChip } from "@/components/entity/owner-chip";
import { QuickCreateTask } from "@/components/entity/quick-create-task";
import { SourceRisksBlock } from "@/components/risks/source-risks";
import { Badge } from "@/components/ui/badge";
import { assets, providers, sites } from "@/db/schema";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listComments,
	listMembersForPicker,
	listTasks,
	userNames,
} from "@/lib/compliance/queries";
import { getWallet } from "@/lib/custody/queries";
import { walletIssues } from "@/lib/custody/wallet-rules";
import { readOrg } from "@/lib/db/with-org";
import {
	type ActivityEntry,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";
import { responsibleValue } from "@/lib/validation/responsible";

// /verwahrung/[id] — eine Wallet: Quorum, Schlüsselinhaber:innen (Ort
// feldverschlüsselt), Zeremonien und Tests, Aufgaben, Aktivität.
export default async function WalletDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ crypto_asset: ["read"] });
	const t = await getTranslations("Custody");
	const tNav = await getTranslations("Nav");
	const te = await getTranslations("Entity");
	const canEdit = allows(ctx, { crypto_asset: ["update"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const detail = await getWallet(tx, ctx.orgId, id);
		if (!detail) return null;
		const [comments, history, members, tasks, siteRows, provs, hsms] =
			await Promise.all([
				listComments(tx, ctx.orgId, "wallet", id),
				historyFor(tx, `wallet:${id}`),
				listMembersForPicker(tx, ctx.orgId),
				listTasks(tx, ctx.orgId, { entityType: "wallet", entityId: id }),
				tx
					.select({ id: sites.id, name: sites.name })
					.from(sites)
					.where(eq(sites.organizationId, ctx.orgId))
					.orderBy(sites.name),
				tx
					.select({ id: providers.id, name: providers.name })
					.from(providers)
					.where(eq(providers.organizationId, ctx.orgId))
					.orderBy(providers.name),
				tx
					.select({ id: assets.id, name: assets.name })
					.from(assets)
					.where(
						and(
							eq(assets.organizationId, ctx.orgId),
							inArray(assets.type, ["hsm", "key_material"]),
						),
					)
					.orderBy(assets.name),
			]);
		const names = await userNames(tx, [
			detail.wallet.ownerUserId,
			...detail.holders.map((h) => h.userId),
			...detail.ceremonies.flatMap((c) => c.participantUserIds),
			...history.map((h) => h.actorUserId),
			...comments.map((c) => c.authorUserId),
		]);
		return {
			...detail,
			comments,
			history,
			members,
			tasks,
			siteRows,
			provs,
			hsms,
			names,
		};
	});
	if (!data) notFound();
	const { wallet: w, holders, ceremonies, names } = data;
	const issues = walletIssues(w, holders);
	const siteName = new Map(data.siteRows.map((s) => [s.id, s.name]));
	const entries: ActivityEntry[] = mergeActivity(
		toHistoryItems(data.history),
		data.comments.map((c) => ({
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
	const day = (v: string | null) => (v ? fmtDate.format(new Date(v)) : "—");

	return (
		<EntityLayout
			back={{ href: "/verwahrung", label: tNav("custody") }}
			eyebrow={`${w.code} · ${t(`purpose_${w.purpose}`)}`}
			title={w.name}
			subtitle={w.notes ?? undefined}
			status={
				<Badge variant={w.status === "active" ? "default" : "outline"}>
					{t(`status_${w.status}`)}
				</Badge>
			}
			actions={
				canEdit ? (
					<WalletForm
						members={data.members}
						providers={data.provs}
						hsmAssets={data.hsms}
						initial={{
							id: w.id,
							name: w.name,
							kind: w.kind,
							technology: w.technology,
							purpose: w.purpose,
							quorumRequired: w.quorumRequired,
							quorumTotal: w.quorumTotal,
							addressLabel: w.addressLabel,
							providerId: w.providerId,
							hsmAssetId: w.hsmAssetId,
							ownerUserId: responsibleValue(w),
							status: w.status,
							notes: w.notes,
							networks: w.networks.join(", "),
							assetSymbols: w.assetSymbols.join(", "),
						}}
					/>
				) : undefined
			}
			meta={
				<>
					<MetaItem label={t("kind")}>
						{t(`kind_${w.kind}`)} · {t(`tech_${w.technology}`)}
					</MetaItem>
					<MetaItem label={t("colQuorum")}>
						{t("quorumValue", { m: w.quorumRequired, n: w.quorumTotal })}
					</MetaItem>
					<MetaItem label={t("owner")}>
						<OwnerChip
							ownerFunction={w.ownerFunction}
							name={names.get(w.ownerUserId ?? "")}
						/>
					</MetaItem>
					<MetaItem label={t("colBackupTest")}>
						{day(w.nextBackupTestDue)}
					</MetaItem>
				</>
			}
			aside={
				<>
					<SourceRisksBlock ctx={ctx} kind="wallet" id={w.id} />
					<Section title={te("activity")}>
						<CommentForm
							entityType="wallet"
							entityId={w.id}
							link={`/verwahrung/${w.id}`}
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
					<Section
						title={te("tasks")}
						actions={
							canEdit ? (
								<QuickCreateTask
									entityType="wallet"
									entityId={w.id}
									members={data.members}
									sourceKind="remediation"
								/>
							) : null
						}
					>
						{data.tasks.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{te("tasksEmpty")}
							</p>
						) : (
							<ul className="flex flex-col gap-2 text-subhead">
								{data.tasks.map((task) => (
									<li key={task.id} className="rounded-2xl bg-card p-2">
										<p className="break-words">{task.title}</p>
										<p className="text-muted-foreground text-footnote">
											{task.assigneeName ?? "—"}
											{task.dueAt ? ` · ${day(task.dueAt)}` : ""}
										</p>
									</li>
								))}
							</ul>
						)}
					</Section>
				</>
			}
		>
			{issues.length > 0 && (
				<section aria-labelledby="w-issues" className="flex flex-col gap-2">
					<h2 id="w-issues" className="font-medium">
						{t("issuesTitle")}
					</h2>
					<ul className="flex flex-col gap-1 text-subhead">
						{issues.map((i) => (
							<li key={i} className="flex gap-2">
								<Badge variant="destructive">{t(`issue_${i}`)}</Badge>
								<span className="text-muted-foreground">
									{t(`issueHint_${i}`)}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-subhead sm:grid-cols-2">
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("assetSymbols")}
					</dt>
					<dd>{w.assetSymbols.join(", ") || "—"}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("networks")}
					</dt>
					<dd>{w.networks.join(", ") || "—"}</dd>
				</div>
				<div className="sm:col-span-2">
					<dt className="text-muted-foreground text-footnote">
						{t("addressLabel")}
					</dt>
					<dd className="break-all font-mono text-footnote" translate="no">
						{w.addressLabel ?? "—"}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("provider")}
					</dt>
					<dd>
						{w.providerId ? (
							<Link
								href={`/dienstleister/${w.providerId}`}
								className="underline underline-offset-4"
							>
								{data.provs.find((p) => p.id === w.providerId)?.name ?? "—"}
							</Link>
						) : (
							"—"
						)}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("hsmAsset")}
					</dt>
					<dd>{data.hsms.find((a) => a.id === w.hsmAssetId)?.name ?? "—"}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("lastBackupTest")}
					</dt>
					<dd>{day(w.lastBackupTestAt)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-footnote">
						{t("lastCeremony")}
					</dt>
					<dd>{day(w.lastCeremonyAt)}</dd>
				</div>
			</dl>

			<Section
				title={t("holdersTitle")}
				actions={
					canEdit ? (
						<KeyHolderForm
							walletId={w.id}
							members={data.members}
							sites={data.siteRows}
						/>
					) : null
				}
			>
				{holders.length === 0 ? (
					<p className="text-muted-foreground text-subhead">
						{t("holdersEmpty")}
					</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{holders.map((h) => {
							const name =
								(h.userId ? names.get(h.userId) : null) ??
								h.externalName ??
								"—";
							return (
								<li
									key={h.id}
									className="flex flex-wrap items-start justify-between gap-2 p-3"
								>
									<div className="min-w-0">
										<p className="font-medium">
											{name}{" "}
											<span className="font-normal text-muted-foreground">
												· {t(`role_${h.role}`)}
											</span>
										</p>
										<p className="break-words text-muted-foreground text-footnote">
											{[
												h.siteId ? siteName.get(h.siteId) : null,
												h.location,
												h.vettedAt
													? t("vettedOn", { date: day(h.vettedAt) })
													: t("notVetted"),
												h.until ? t("untilDate", { date: day(h.until) }) : null,
											]
												.filter(Boolean)
												.join(" · ")}
										</p>
										{h.status === "revoked" && (
											<p className="text-destructive text-footnote">
												{t("revokedOn", {
													date: h.revokedAt ? fmtDate.format(h.revokedAt) : "—",
													reason: h.revokedReason ?? "",
												})}
											</p>
										)}
									</div>
									{canEdit && h.status === "active" && (
										<RevokeHolderButton id={h.id} name={name} />
									)}
								</li>
							);
						})}
					</ul>
				)}
			</Section>

			<Section
				title={t("ceremoniesTitle")}
				actions={
					canEdit ? (
						<CeremonyForm walletId={w.id} members={data.members} />
					) : null
				}
			>
				{ceremonies.length === 0 ? (
					<p className="text-muted-foreground text-subhead">
						{t("ceremoniesEmptyLead")}
					</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{ceremonies.map((c) => (
							<li
								key={c.id}
								className="flex flex-wrap justify-between gap-2 p-3"
							>
								<div className="min-w-0">
									<p className="font-medium">
										{t(`ceremony_${c.kind}`)} · {day(c.heldAt)}
									</p>
									<p className="break-words text-muted-foreground text-footnote">
										{c.participantUserIds
											.map((u) => names.get(u) ?? "—")
											.join(", ") || "—"}
										{c.witnesses ? ` · ${c.witnesses}` : ""}
									</p>
									{c.notes && <p className="mt-1 text-footnote">{c.notes}</p>}
								</div>
								<Badge
									variant={c.result === "pass" ? "default" : "destructive"}
								>
									{t(`result_${c.result}`)}
								</Badge>
							</li>
						))}
					</ul>
				)}
			</Section>
		</EntityLayout>
	);
}
