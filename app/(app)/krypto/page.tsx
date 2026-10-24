import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { DATE_TIME } from "@/lib/history";
import type { PayoutStatus } from "@/lib/wallet/model";
import {
	amountText,
	isLiveNetwork,
	networkLabel,
} from "@/lib/wallet-link-ingest/display";
import { alertOverdue, linkHealth } from "@/lib/wallet-link-ingest/health";
import {
	listCryptoAccounts,
	listCryptoAlerts,
	listCryptoMovements,
	listCryptoPayouts,
	listWalletLinks,
	MOVEMENTS_PAGE,
} from "@/lib/wallet-link-ingest/queries";

const TABS = ["bewegungen", "konten", "auszahlungen", "hinweise"] as const;
const DIRECTIONS = ["in", "out"] as const;

const EFFECT_HREF = {
	incident: (id: string) => `/vorfaelle/${id}`,
	suspicious_report: () => "/aml?tab=verdacht",
	task: () => "/heute/aufgaben",
} as const;

// /krypto — Daten aus both.money (Plan both.money, K4): Bewegungen, Konten
// mit letztem Tagesbestand, Auszahlungen, Hinweise. Nur lesend; die Wallet
// selbst lebt in both.money.
export default async function CryptoPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; richtung?: string; seite?: string }>;
}) {
	const ctx = await requireOrgPage({ crypto_asset: ["read"] });
	const t = await getTranslations("Krypto");
	const sp = await searchParams;
	const tab = TABS.find((x) => x === sp.tab) ?? "bewegungen";
	const direction = DIRECTIONS.find((x) => x === sp.richtung);
	const page = Math.max(1, Number(sp.seite) || 1);
	const now = new Date();

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [links, accounts, movements, payouts, alerts] = await Promise.all([
			listWalletLinks(tx, ctx.orgId),
			listCryptoAccounts(tx, ctx.orgId),
			tab === "bewegungen"
				? listCryptoMovements(tx, ctx.orgId, { direction, page })
				: Promise.resolve(null),
			tab === "auszahlungen"
				? listCryptoPayouts(tx, ctx.orgId)
				: Promise.resolve([]),
			listCryptoAlerts(tx, ctx.orgId),
		]);
		return { links, accounts, movements, payouts, alerts };
	});
	const active = data.links.filter((l) => l.status === "active");
	const openAlerts = data.alerts.filter((a) => !a.resolvedAt);

	if (active.length === 0 && data.accounts.length === 0)
		return (
			<>
				<PageHeader title={t("title")} lead={t("lead")} />
				<EmptyState
					title={t("emptyTitle")}
					lead={t("emptyLead")}
					actions={
						<Link
							href="/einstellungen?tab=integrationen"
							className={buttonVariants({ size: "sm" })}
						>
							{t("connect")}
						</Link>
					}
				/>
			</>
		);

	const qs = (p: Record<string, string | undefined>) => {
		const u = new URLSearchParams();
		u.set("tab", "bewegungen");
		for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
		return `/krypto?${u.toString()}`;
	};

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					allows(ctx, { export: ["create"] }) ? (
						<a
							href="/api/export/krypto-bewegungen.csv"
							className="text-primary text-subhead underline-offset-4 hover:underline"
						>
							{t("exportCsv")}
						</a>
					) : undefined
				}
			/>

			<section
				aria-label={t("statusLabel")}
				className="mb-6 flex flex-col gap-2"
			>
				{active.map((l) => {
					const h = linkHealth(
						{
							walletOrgId: l.walletOrgId,
							createdAt: l.createdAt,
							lastHeartbeatAt: l.lastHeartbeatAt,
							lastDayClosed: l.lastDayClosed,
							sanctionsList: l.sanctionsList,
							tokenExpiresAt: l.tokenExpiresAt,
						},
						now,
					);
					const warnings = [
						!h.bound && t("warnUnbound"),
						h.heartbeatStale && t("warnHeartbeat"),
						h.dayCloseMissing &&
							t("warnDayClose", {
								day: fmtDate.format(new Date(h.dayCloseMissing)),
							}),
						h.sanctionsStale && t("warnSanctions"),
						h.tokenExpiresSoon && t("warnToken"),
					].filter((x): x is string => Boolean(x));
					return (
						<div
							key={l.id}
							className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3 text-subhead"
						>
							<p className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span className="font-medium">{l.walletOrgName ?? l.name}</span>
								<Badge variant={warnings.length === 0 ? "success" : "warning"}>
									{warnings.length === 0 ? t("healthy") : t("attention")}
								</Badge>
								{l.custodyMode && (
									<span className="text-muted-foreground">
										{t("custodyMode", { mode: l.custodyMode })}
									</span>
								)}
							</p>
							<p className="text-muted-foreground tabular-nums">
								{t("heartbeat")}:{" "}
								{l.lastHeartbeatAt ? DATE_TIME.format(l.lastHeartbeatAt) : "—"}
								{" · "}
								{t("dayClosed")}:{" "}
								{l.lastDayClosed
									? fmtDate.format(new Date(l.lastDayClosed))
									: "—"}
								{" · "}
								{t("sanctions")}:{" "}
								{l.sanctionsList
									? t("sanctionsList", {
											version: l.sanctionsList.listVersion,
											total: l.sanctionsList.total,
										})
									: "—"}
								{l.ceremony
									? ` · ${t("ceremony", {
											mode: l.ceremony.policy.mode,
											keys: l.ceremony.keys.active,
										})}`
									: ""}
							</p>
							{warnings.length > 0 && (
								<ul className="list-disc ps-5 text-subhead" role="status">
									{warnings.map((w) => (
										<li key={w}>{w}</li>
									))}
								</ul>
							)}
						</div>
					);
				})}
			</section>

			<UrlTabs
				base="/krypto"
				active={tab}
				tabs={[
					{ value: "bewegungen", label: t("tabMovements") },
					{
						value: "konten",
						label: t("tabAccounts"),
						count: data.accounts.length,
					},
					{ value: "auszahlungen", label: t("tabPayouts") },
					{
						value: "hinweise",
						label: t("tabAlerts"),
						count: openAlerts.length,
					},
				]}
			/>

			{tab === "bewegungen" && data.movements && (
				<div className="flex flex-col gap-4">
					<nav
						aria-label={t("filterLabel")}
						className="flex gap-2 text-subhead"
					>
						{[undefined, ...DIRECTIONS].map((d) => (
							<Link
								key={d ?? "alle"}
								href={qs({ richtung: d })}
								aria-current={direction === d ? "page" : undefined}
								className={buttonVariants({
									size: "sm",
									variant: direction === d ? "default" : "outline",
								})}
							>
								{d ? t(`dir_${d}`) : t("dirAll")}
							</Link>
						))}
					</nav>
					{data.movements.rows.length === 0 ? (
						<EmptyState title={t("noMovements")} />
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("colSeen")}</TableHead>
									<TableHead>{t("colAccount")}</TableHead>
									<TableHead>{t("colDirection")}</TableHead>
									<TableHead className="text-right">{t("colAmount")}</TableHead>
									<TableHead>{t("colStatus")}</TableHead>
									<TableHead>{t("colScreening")}</TableHead>
									<TableHead>{t("colTx")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.movements.rows.map((m) => (
									<TableRow key={m.id}>
										<TableCell className="whitespace-nowrap tabular-nums">
											{DATE_TIME.format(m.firstSeenAt)}
										</TableCell>
										<TableCell>
											{m.accountName}
											{!isLiveNetwork(m.network) && (
												<span className="block text-muted-foreground text-footnote">
													{networkLabel(m.network)}
												</span>
											)}
										</TableCell>
										<TableCell>{t(`dir_${m.direction}`)}</TableCell>
										<TableCell className="whitespace-nowrap text-right tabular-nums">
											{amountText(m.network, m.asset, m.amount)}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													m.status === "confirmed"
														? "success"
														: m.status === "dropped"
															? "muted"
															: "outline"
												}
											>
												{t(
													`transfer_${m.status as "pending" | "confirmed" | "dropped"}`,
												)}
											</Badge>
											{m.frozen && (
												<Badge variant="destructive" className="ms-1">
													{t("frozen")}
												</Badge>
											)}
										</TableCell>
										<TableCell>
											{t(
												`screening_${m.screening as "unchecked" | "clear" | "hit"}`,
											)}
										</TableCell>
										<TableCell>
											<code
												className="whitespace-nowrap font-mono text-footnote"
												translate="no"
												title={m.txid}
											>
												{m.txid.slice(0, 10)}…
											</code>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					{data.movements.total > MOVEMENTS_PAGE && (
						<nav
							aria-label={t("pagesLabel")}
							className="flex items-center gap-3 text-subhead"
						>
							{page > 1 && (
								<Link
									href={qs({ richtung: direction, seite: String(page - 1) })}
									className="text-primary underline-offset-4 hover:underline"
								>
									{t("prev")}
								</Link>
							)}
							<span className="text-muted-foreground tabular-nums">
								{t("pageOf", {
									page,
									pages: Math.ceil(data.movements.total / MOVEMENTS_PAGE),
								})}
							</span>
							{page * MOVEMENTS_PAGE < data.movements.total && (
								<Link
									href={qs({ richtung: direction, seite: String(page + 1) })}
									className="text-primary underline-offset-4 hover:underline"
								>
									{t("next")}
								</Link>
							)}
						</nav>
					)}
				</div>
			)}

			{tab === "konten" &&
				(data.accounts.length === 0 ? (
					<EmptyState title={t("noAccounts")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("colAccount")}</TableHead>
								<TableHead>{t("colNetwork")}</TableHead>
								<TableHead>{t("colKind")}</TableHead>
								<TableHead>{t("colRegister")}</TableHead>
								<TableHead className="text-right">{t("colBalance")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.accounts.map((a) => (
								<TableRow key={a.id} className="align-top">
									<TableCell>
										<span className="font-medium">{a.name}</span>
										{a.status === "retired" && (
											<span className="block text-muted-foreground text-footnote">
												{t("retired")}
											</span>
										)}
									</TableCell>
									<TableCell>{networkLabel(a.network)}</TableCell>
									<TableCell>
										{t(`kind_${a.kind === "hot" ? "hot" : "cold"}`)} ·{" "}
										{t(`purpose_${a.purpose === "client" ? "client" : "own"}`)}
									</TableCell>
									<TableCell>
										{a.walletId ? (
											<Link
												href={`/verwahrung/${a.walletId}`}
												className="whitespace-nowrap font-mono text-footnote underline-offset-4 hover:underline"
											>
												{a.walletCode}
											</Link>
										) : (
											"—"
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{a.balance ? (
											<>
												{Object.entries(a.balance.balances).map(
													([asset, b]) => (
														<span
															key={asset}
															className="block whitespace-nowrap"
														>
															{amountText(a.network, asset, b.confirmed)}
														</span>
													),
												)}
												<span className="block text-muted-foreground text-footnote">
													{t("balanceAt", {
														day: fmtDate.format(new Date(a.balanceDay ?? "")),
														height: a.balance.height ?? "—",
													})}
												</span>
											</>
										) : (
											"—"
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			{tab === "auszahlungen" &&
				(data.payouts.length === 0 ? (
					<EmptyState title={t("noPayouts")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("colRequested")}</TableHead>
								<TableHead>{t("colAccount")}</TableHead>
								<TableHead>{t("colDestination")}</TableHead>
								<TableHead className="text-right">{t("colAmount")}</TableHead>
								<TableHead>{t("colStatus")}</TableHead>
								<TableHead>{t("colApproved")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.payouts.map((p) => (
								<TableRow key={p.id}>
									<TableCell className="whitespace-nowrap tabular-nums">
										{DATE_TIME.format(p.requestedAt)}
									</TableCell>
									<TableCell>{p.accountName}</TableCell>
									<TableCell>
										{p.destinationLabel}
										<code
											className="block font-mono text-muted-foreground text-footnote"
											translate="no"
											title={p.destination}
										>
											{p.destination.slice(0, 14)}…
										</code>
									</TableCell>
									<TableCell className="whitespace-nowrap text-right tabular-nums">
										{amountText(p.network, p.asset, p.amount)}
										{p.fee && (
											<span className="block text-muted-foreground text-footnote">
												{t("fee", {
													fee: amountText(p.network, p.asset, p.fee),
												})}
											</span>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant={p.status === "confirmed" ? "success" : "outline"}
										>
											{t(`payout_${p.status as PayoutStatus}`)}
										</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap tabular-nums">
										{p.approvedAt ? DATE_TIME.format(p.approvedAt) : "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			{tab === "hinweise" &&
				(data.alerts.length === 0 ? (
					<EmptyState title={t("noAlerts")} lead={t("noAlertsLead")} />
				) : (
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
						{data.alerts.map((a) => (
							<li key={a.id} className="flex flex-col gap-1 px-4 py-3">
								<p className="flex flex-wrap items-center gap-2">
									<Badge
										variant={
											a.resolvedAt
												? "muted"
												: a.severity === "critical"
													? "destructive"
													: "warning"
										}
									>
										{a.resolvedAt
											? t("resolved")
											: t(
													`severity_${a.severity as "critical" | "high" | "medium"}`,
												)}
									</Badge>
									<span className="font-medium">{a.title}</span>
									{alertOverdue(a, now) && (
										<span className="text-destructive text-footnote">
											{t("overdue")}
										</span>
									)}
								</p>
								<p className="text-muted-foreground">{a.detail}</p>
								<p className="text-muted-foreground text-footnote tabular-nums">
									{DATE_TIME.format(a.raisedAt)}
									{a.resolvedAt
										? ` · ${t("resolvedAt", { time: DATE_TIME.format(a.resolvedAt) })}`
										: ""}
									{a.effectId && (
										<>
											{" · "}
											<Link
												href={EFFECT_HREF[a.effect](a.effectId)}
												className="text-primary underline-offset-4 hover:underline"
											>
												{t(`effect_${a.effect}`)}
											</Link>
										</>
									)}
								</p>
							</li>
						))}
					</ul>
				))}
		</>
	);
}
