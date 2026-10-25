import { LinkActions } from "@wallet/components/export/link-actions";
import { LinkCreateDialog } from "@wallet/components/export/link-create-dialog";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { walletEnv } from "@wallet/lib/env";
import { listLinks } from "@wallet/lib/export/queries";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/wallet/display";

export const metadata: Metadata = { title: "Compliance-Export" };

const fmtDate = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

const PAUSE_REASONS = ["manual", "unauthorized", "forbidden", "gone"] as const;
type PauseReason = (typeof PAUSE_REASONS)[number];
const isPauseReason = (r: string | null): r is PauseReason =>
	PAUSE_REASONS.includes(r as PauseReason);

// Nachlieferung standardmäßig ab dem 1. Januar (Berlin) dieses Jahres
function startOfYear(now: Date): string {
	const year = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
	}).format(now);
	return `${year}-01-01`;
}

// /settings/export — Verbindungen nach Klick: Stand, Verzug, Fehler;
// verbinden, pausieren, Token erneuern, trennen (Plan both.money, W4)
export default async function ExportSettingsPage() {
	const ctx = await requireUnlockedPage("/settings/export", "export:manage");
	const t = await getTranslations("Export");
	const tShell = await getTranslations("Shell");
	const { links, revoked, accounts } = await listLinks(toOrgCtx(ctx));
	const origins = walletEnv().WALLET_KLICK_ORIGINS;

	return (
		<>
			<PageHeader
				back={{ href: "/settings", label: tShell("settings") }}
				title={t("title")}
				lead={t("lead")}
				actions={
					<LinkCreateDialog
						origins={origins}
						accounts={accounts}
						defaultFrom={startOfYear(new Date())}
					/>
				}
			/>
			<p className="mb-8 max-w-2xl text-muted-foreground text-subhead">
				{t("how")}
			</p>
			{links.length === 0 ? (
				<EmptyState title={t("emptyTitle")} lead={t("emptyBody")} />
			) : (
				<div className="flex flex-col gap-8">
					{links.map((l) => {
						const org = l.klickOrgName ?? l.origin;
						const facts: [string, React.ReactNode][] = [
							[
								t("origin"),
								<code
									key="o"
									className="font-mono text-footnote"
									translate="no"
								>
									{l.origin}
								</code>,
							],
							[
								t("token"),
								`${t("tokenEnds", { hint: l.tokenHint })}${
									l.tokenExpiresAt
										? `, ${t("tokenExpires", { date: fmtDate.format(l.tokenExpiresAt) })}`
										: ""
								}`,
							],
							[
								t("scope"),
								l.accounts
									? t("accountsSome", {
											count: l.accounts.length,
											names: l.accounts.map((a) => a.name).join(", "),
										})
									: t("accountsAll"),
							],
							[
								t("backfill"),
								!l.backfilledAt
									? t("backfillOpen")
									: l.backfillFrom
										? t("backfillFrom", {
												date: fmtDate.format(l.backfillFrom),
											})
										: t("backfillAll"),
							],
							[
								t("lastSuccess"),
								l.lastSuccessAt
									? fmtDateTime.format(l.lastSuccessAt)
									: t("never"),
							],
							[
								t("pending"),
								<span key="p" className="tabular-nums">
									{t("pendingCount", { count: l.pending })}
									{l.pending > 0 && l.oldestPendingAt
										? `, ${t("oldest", { time: fmtDateTime.format(l.oldestPendingAt) })}`
										: ""}
								</span>,
							],
						];
						return (
							<section
								key={l.id}
								aria-labelledby={`link-${l.id}`}
								className="flex flex-col gap-4 rounded-2xl bg-card p-4 sm:p-5"
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<h2
										id={`link-${l.id}`}
										className="flex min-w-0 items-center gap-3 font-semibold text-headline"
									>
										<span className="truncate">{org}</span>
										<Badge
											variant={l.status === "active" ? "success" : "warning"}
										>
											{t(
												`status_${l.status === "active" ? "active" : "paused"}`,
											)}
										</Badge>
									</h2>
									{l.status !== "revoked" && (
										<LinkActions
											linkId={l.id}
											status={l.status === "active" ? "active" : "paused"}
											org={org}
										/>
									)}
								</div>
								{l.status === "paused" && (
									<p
										role="status"
										className="rounded-xl bg-warning/12 px-3 py-2 text-subhead"
									>
										{isPauseReason(l.pausedReason)
											? t(`paused_${l.pausedReason}`)
											: t("paused_other", { reason: l.pausedReason ?? "—" })}
									</p>
								)}
								{l.status === "active" && l.nextAttemptAt && l.lastError && (
									<p
										role="status"
										className="rounded-xl bg-warning/12 px-3 py-2 text-subhead"
									>
										{t("retryAt", {
											time: fmtDateTime.format(l.nextAttemptAt),
											attempts: l.attempts,
											error: l.lastError,
										})}
									</p>
								)}
								<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-subhead sm:grid-cols-[12rem_minmax(0,1fr)]">
									{facts.map(([k, v]) => (
										<div key={k} className="contents">
											<dt className="text-muted-foreground">{k}</dt>
											<dd className="min-w-0 break-words">{v}</dd>
										</div>
									))}
								</dl>
								{l.rejected.length > 0 && (
									<div className="flex flex-col gap-2">
										<h3 className="font-medium text-subhead">
											{t("rejectedTitle")}
										</h3>
										<p className="max-w-2xl text-muted-foreground text-subhead">
											{t("rejectedLead")}
										</p>
										<div className="overflow-x-auto rounded-2xl bg-card">
											<table className="w-full text-subhead">
												<thead className="bg-muted/40 text-left text-muted-foreground">
													<tr>
														<th className="px-3 py-2 font-normal">
															{t("colSeq")}
														</th>
														<th className="px-3 py-2 font-normal">
															{t("colType")}
														</th>
														<th className="px-3 py-2 font-normal">
															{t("colCode")}
														</th>
														<th className="px-3 py-2 font-normal">
															{t("colAt")}
														</th>
													</tr>
												</thead>
												<tbody className="divide-y">
													{l.rejected.map((r) => (
														<tr key={r.id}>
															<td className="whitespace-nowrap px-3 py-2 tabular-nums">
																{r.seq}
															</td>
															<td className="whitespace-nowrap px-3 py-2">
																<code
																	className="font-mono text-footnote"
																	translate="no"
																>
																	{r.type}
																</code>
															</td>
															<td className="whitespace-nowrap px-3 py-2">
																<code
																	className="font-mono text-footnote"
																	translate="no"
																>
																	{r.code ?? "—"}
																</code>
															</td>
															<td className="whitespace-nowrap px-3 py-2 tabular-nums">
																{fmtDateTime.format(new Date(r.at))}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								)}
							</section>
						);
					})}
				</div>
			)}
			{revoked.length > 0 && (
				<section
					aria-labelledby="revoked"
					className="mt-10 flex flex-col gap-3"
				>
					<h2 id="revoked" className="font-semibold text-headline">
						{t("revokedTitle")}
					</h2>
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card text-subhead">
						{revoked.map((r) => (
							<li
								key={r.id}
								className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
							>
								<span className="min-w-0 grow truncate">
									{r.klickOrgName ?? r.origin}
								</span>
								<span className="whitespace-nowrap text-muted-foreground tabular-nums">
									{fmtDate.format(r.createdAt)}
								</span>
								<Badge variant="muted">{t("status_revoked")}</Badge>
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}
