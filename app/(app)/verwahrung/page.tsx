import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WalletForm } from "@/components/custody/custody-forms";
import {
	ReconciliationForm,
	ReviewReconciliationButton,
} from "@/components/custody/reconciliation-form";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { assets, keyCeremonies, providers, wallets } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import {
	custodyControlStatus,
	listReconciliations,
	listWallets,
} from "@/lib/custody/queries";
import { previousBusinessDay, reconcile } from "@/lib/custody/reconcile";
import { readOrg } from "@/lib/db/with-org";
import { CONTROL_STATUS } from "@/lib/entities/control";

const TABS = ["wallets", "abstimmung", "zeremonien"] as const;

// /verwahrung — Wallet-Register, tägliche Abstimmung des Kundenvermögens
// und Zeremonien (MiCAR Art. 70/75, CCSS).
export default async function CustodyPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const ctx = await requireOrgPage({ crypto_asset: ["read"] });
	const t = await getTranslations("Custody");
	const ts = await getTranslations("Status");
	const sp = await searchParams;
	const tab = TABS.find((x) => x === sp.tab) ?? "wallets";
	const canCreate = allows(ctx, { crypto_asset: ["create"] });
	const canEdit = allows(ctx, { crypto_asset: ["update"] });
	const now = new Date();
	const stichtag = previousBusinessDay(now);

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [walletRows, recs, members, controlStatus, provs, hsms, ceremonies] =
			await Promise.all([
				listWallets(tx, ctx.orgId, now),
				listReconciliations(tx, ctx.orgId, 30),
				listMembersForPicker(tx, ctx.orgId),
				custodyControlStatus(tx, ctx.orgId),
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
				tab === "zeremonien"
					? tx
							.select({
								id: keyCeremonies.id,
								walletId: keyCeremonies.walletId,
								code: wallets.code,
								name: wallets.name,
								kind: keyCeremonies.kind,
								heldAt: keyCeremonies.heldAt,
								result: keyCeremonies.result,
							})
							.from(keyCeremonies)
							.innerJoin(wallets, eq(wallets.id, keyCeremonies.walletId))
							.where(eq(keyCeremonies.organizationId, ctx.orgId))
							.orderBy(desc(keyCeremonies.heldAt))
							.limit(100)
					: Promise.resolve([]),
			]);
		const names = await userNames(
			tx,
			recs.flatMap((r) => [r.preparedByUserId, r.reviewedByUserId]),
		);
		return {
			walletRows,
			recs,
			members,
			controlStatus,
			provs,
			hsms,
			ceremonies,
			names,
		};
	});
	const { walletRows, recs, members, controlStatus, provs, hsms, ceremonies } =
		data;
	const clientWallets = walletRows.filter(
		(w) => w.wallet.purpose === "client" && w.wallet.status === "active",
	);
	const lastDay = recs[0]?.day ?? null;
	const overdue = clientWallets.length > 0 && (!lastDay || lastDay < stichtag);
	const symbols = [
		...new Set(
			recs[0]
				? recs[0].lines.map((l) => l.symbol)
				: clientWallets.flatMap((w) => w.wallet.assetSymbols),
		),
	];

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate && tab === "wallets" ? (
						<WalletForm members={members} providers={provs} hsmAssets={hsms} />
					) : undefined
				}
			/>
			{overdue && (
				<p
					role="status"
					className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
				>
					{t("overdueBanner", { day: fmtDate.format(new Date(stichtag)) })}{" "}
					<Link
						href="/verwahrung?tab=abstimmung"
						className="underline underline-offset-4"
					>
						{t("overdueLink")}
					</Link>
				</p>
			)}
			<UrlTabs
				base="/verwahrung"
				active={tab}
				tabs={[
					{
						value: "wallets",
						label: t("tabWallets"),
						count: walletRows.length,
					},
					{ value: "abstimmung", label: t("tabReconciliation") },
					{ value: "zeremonien", label: t("tabCeremonies") },
				]}
			/>

			{tab === "wallets" &&
				(walletRows.length === 0 ? (
					<EmptyState title={t("emptyTitle")} lead={t("emptyLead")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("colWallet")}</TableHead>
								<TableHead>{t("colType")}</TableHead>
								<TableHead>{t("colQuorum")}</TableHead>
								<TableHead>{t("colBackupTest")}</TableHead>
								<TableHead>{t("colIssues")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{walletRows.map(({ wallet: w, activeHolders, issues }) => (
								<TableRow key={w.id} className="align-top">
									<TableCell>
										<Link
											href={`/verwahrung/${w.id}`}
											className="font-medium underline-offset-4 hover:underline"
										>
											<span className="whitespace-nowrap font-mono text-xs">
												{w.code}
											</span>{" "}
											{w.name}
										</Link>
										<p className="text-muted-foreground text-xs">
											{t(`purpose_${w.purpose}`)}
											{w.status === "retired" && ` · ${t("status_retired")}`}
											{w.assetSymbols.length > 0 &&
												` · ${w.assetSymbols.join(", ")}`}
										</p>
									</TableCell>
									<TableCell className="text-sm">
										{t(`kind_${w.kind}`)} · {t(`tech_${w.technology}`)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-sm tabular-nums">
										{t("quorumValue", {
											m: w.quorumRequired,
											n: w.quorumTotal,
										})}
										<p className="text-muted-foreground text-xs">
											{t("holderCount", { n: activeHolders })}
										</p>
									</TableCell>
									<TableCell className="whitespace-nowrap text-sm">
										{w.nextBackupTestDue
											? fmtDate.format(new Date(w.nextBackupTestDue))
											: "—"}
									</TableCell>
									<TableCell>
										{issues.length === 0 ? (
											<Badge variant="outline">{t("noIssues")}</Badge>
										) : (
											<ul className="flex flex-wrap gap-1">
												{issues.map((i) => (
													<li key={i}>
														<Badge variant="destructive">
															{t(`issue_${i}`)}
														</Badge>
													</li>
												))}
											</ul>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			{tab === "abstimmung" && (
				<div className="flex flex-col gap-6">
					<p className="max-w-3xl text-muted-foreground text-sm">
						{t("reconLead")}
					</p>
					<ReconciliationForm
						defaultDay={stichtag}
						symbols={symbols}
						canEdit={canEdit}
					/>
					{recs.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("day")}</TableHead>
									<TableHead>{t("colResult")}</TableHead>
									<TableHead>{t("colDifferences")}</TableHead>
									<TableHead>{t("colPeople")}</TableHead>
									<TableHead className="text-right">
										<span className="sr-only">{t("colActions")}</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{recs.map((r) => {
									const res = reconcile(r.lines);
									const off = res.symbols.filter((s) => s.state !== "ok");
									return (
										<TableRow key={r.id} className="align-top">
											<TableCell className="whitespace-nowrap">
												{fmtDate.format(new Date(r.day))}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														r.shortfall
															? "destructive"
															: r.status === "difference"
																? "outline"
																: "default"
													}
												>
													{r.shortfall
														? t("stateShortfall")
														: t(`recon_${r.status}`)}
												</Badge>
												{r.status === "reviewed" && r.shortfall && (
													<p className="mt-1 text-muted-foreground text-xs">
														{t("recon_reviewed")}
													</p>
												)}
											</TableCell>
											<TableCell className="text-sm tabular-nums">
												{off.length === 0
													? t("allMatched", { n: res.symbols.length })
													: off
															.map((s) => `${s.symbol} ${s.difference}`)
															.join(" · ")}
												{r.explanation && (
													<p className="mt-1 max-w-sm text-muted-foreground text-xs">
														{r.explanation}
													</p>
												)}
												{r.nonconformityId && (
													<Link
														href={`/abweichungen/${r.nonconformityId}`}
														className="mt-1 block text-xs underline underline-offset-4"
													>
														{t("toNonconformity")}
													</Link>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{t("preparedBy", {
													name: data.names.get(r.preparedByUserId ?? "") ?? "—",
												})}
												{r.reviewedByUserId && (
													<p>
														{t("reviewedBy", {
															name: data.names.get(r.reviewedByUserId) ?? "—",
														})}
													</p>
												)}
											</TableCell>
											<TableCell className="text-right">
												{canEdit && r.status !== "reviewed" && (
													<ReviewReconciliationButton
														id={r.id}
														day={fmtDate.format(new Date(r.day))}
														needsExplanation={r.status === "difference"}
														explanation={r.explanation}
													/>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</div>
			)}

			{tab === "zeremonien" &&
				(ceremonies.length === 0 ? (
					<EmptyState
						title={t("ceremoniesEmpty")}
						lead={t("ceremoniesEmptyLead")}
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("heldAt")}</TableHead>
								<TableHead>{t("colWallet")}</TableHead>
								<TableHead>{t("ceremonyKind")}</TableHead>
								<TableHead>{t("result")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{ceremonies.map((c) => (
								<TableRow key={c.id}>
									<TableCell className="whitespace-nowrap">
										{fmtDate.format(new Date(c.heldAt))}
									</TableCell>
									<TableCell>
										<Link
											href={`/verwahrung/${c.walletId}`}
											className="underline-offset-4 hover:underline"
										>
											<span className="font-mono text-xs">{c.code}</span>{" "}
											{c.name}
										</Link>
									</TableCell>
									<TableCell>{t(`ceremony_${c.kind}`)}</TableCell>
									<TableCell>
										<Badge
											variant={c.result === "pass" ? "default" : "destructive"}
										>
											{t(`result_${c.result}`)}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			<section aria-labelledby="custody-controls" className="mt-10">
				<h2 id="custody-controls" className="mb-3 font-medium">
					{t("controlsTitle")}
				</h2>
				<ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
					{controlStatus.map((c) => (
						<li
							key={c.code}
							className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
						>
							<Link
								href={`/controls/${c.code}`}
								className="min-w-0 underline-offset-4 hover:underline"
							>
								<span className="whitespace-nowrap font-mono text-xs">
									{c.code}
								</span>{" "}
								{c.title}
							</Link>
							<span className="whitespace-nowrap text-muted-foreground text-xs">
								{c.status
									? ts(CONTROL_STATUS.labelKey[c.status] as "notStarted")
									: t("controlNotInScope")}
							</span>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
