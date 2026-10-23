import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { PayoutActions } from "@/components/wallet/payout-actions";
import { SignerNotice } from "@/components/wallet/signer-notice";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { amountText, fmtDateTime, PAYOUT_BADGE } from "@/lib/wallet/display";
import { payoutDetail } from "@/lib/wallet/payouts/queries";
import { confirmUrl } from "@/lib/wallet/signer/client";
import { signerState } from "@/lib/wallet/signer/status";

export const metadata: Metadata = { title: "Auszahlung" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /wallet/auszahlungen/[id] — Stand, Zeitstrahl, Bestätigungslink (nur mit
// wallet:approve), Abbrechen und Beschleunigen
export default async function PayoutPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const ctx = await requireWalletPage(`/wallet/auszahlungen/${id}`);
	const t = await getTranslations("Wallet");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const row = await payoutDetail(tx, ctx.orgId, id);
		if (!row) return null;
		const names = await userNames(tx, [row.payout.createdByUserId]);
		return { ...row, names };
	});
	if (!data) notFound();
	const { payout: p, account, names } = data;
	const { state } = await signerState(ctx.orgId);
	const net = NETWORKS[account.network];
	const feeAsset = net.chain === "bitcoin" ? "BTC" : "ETH";
	const link =
		p.status === "awaiting_approval" && allows(ctx, { wallet: ["approve"] })
			? confirmUrl(p.intentId)
			: null;
	const open = [
		"awaiting_approval",
		"approved",
		"signed",
		"broadcast",
	].includes(p.status);
	const steps: {
		key: "created" | "approved" | "signed" | "broadcast" | "confirmed";
		at: Date | null;
	}[] = [
		{ key: "created", at: p.createdAt },
		{ key: "approved", at: p.approvedAt },
		{ key: "signed", at: p.signedAt },
		{ key: "broadcast", at: p.broadcastAt },
		{ key: "confirmed", at: p.confirmedAt },
	];
	const facts: [string, React.ReactNode][] = [
		[t("payoutAccount"), `${account.name} · ${net.label}`],
		[
			t("payoutDestination"),
			<span key="d" className="flex flex-col gap-0.5">
				<span>{p.destinationLabel}</span>
				<code className="break-all font-mono text-[13px]" translate="no">
					{p.destination}
				</code>
			</span>,
		],
		[t("payoutSpeed"), t(`speed_${p.speed}`)],
		[t("payoutFeeCap"), amountText(account.network, feeAsset, p.feeCap)],
		...(p.fee
			? ([[t("payoutFee"), amountText(account.network, feeAsset, p.fee)]] as [
					string,
					React.ReactNode,
				][])
			: []),
		...(p.txid
			? ([
					[
						t("payoutTxid"),
						<code
							key="t"
							className="break-all font-mono text-[13px]"
							translate="no"
						>
							{p.txid}
						</code>,
					],
				] as [string, React.ReactNode][])
			: []),
		[
			t("payoutCreatedBy"),
			`${(p.createdByUserId && names.get(p.createdByUserId)) || "—"} · ${fmtDateTime.format(p.createdAt)}`,
		],
		...(p.status === "awaiting_approval"
			? ([[t("payoutExpires"), fmtDateTime.format(p.expiresAt)]] as [
					string,
					React.ReactNode,
				][])
			: []),
	];
	const earlier = (p.txids ?? []).filter((x) => x !== p.txid);

	return (
		<>
			<PageHeader
				title={amountText(account.network, p.asset, p.amount)}
				lead={t("payoutTo", { label: p.destinationLabel })}
				eyebrow={t("payoutEyebrow")}
				actions={
					<Badge variant={PAYOUT_BADGE[p.status]}>
						{t(`payoutStatus_${p.status}`)}
					</Badge>
				}
			/>
			<SignerNotice state={state} />
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="flex flex-col gap-6">
					{link && (
						<section className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
							<p>{t("payoutConfirmHint")}</p>
							<div>
								<a
									href={link}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<ExternalLink className="size-4" aria-hidden />
									{t("payoutConfirm")}
								</a>
							</div>
						</section>
					)}
					{p.signableAt && p.status === "approved" && (
						<p className="text-muted-foreground text-sm">
							{t("payoutSignableAt", { at: fmtDateTime.format(p.signableAt) })}
						</p>
					)}
					{p.error && open && (
						<p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
							{t.has(`error_${p.error}` as never)
								? t(`error_${p.error}` as never)
								: t("payoutRetrying")}
						</p>
					)}
					<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
						{facts.map(([k, v]) => (
							<div key={k} className="contents">
								<dt className="text-muted-foreground">{k}</dt>
								<dd className="min-w-0">{v}</dd>
							</div>
						))}
					</dl>
					{earlier.length > 0 && (
						<section className="flex flex-col gap-2 text-sm">
							<h2 className="font-medium">{t("payoutEarlier")}</h2>
							<ul className="flex flex-col gap-1">
								{earlier.map((x) => (
									<li key={x}>
										<code
											className="break-all font-mono text-[13px] text-muted-foreground"
											translate="no"
										>
											{x}
										</code>
									</li>
								))}
							</ul>
						</section>
					)}
					<section className="flex flex-col gap-2">
						<h2 className="font-medium text-sm">{t("payoutIntent")}</h2>
						<pre
							className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs"
							translate="no"
						>
							{p.intentText}
						</pre>
					</section>
					{open && (
						<PayoutActions
							id={p.id}
							canCancel={!p.cancelRequested}
							canBump={
								p.status === "broadcast" &&
								!p.bumpRequested &&
								!p.cancelRequested &&
								allows(ctx, { wallet: ["initiate"] })
							}
						/>
					)}
					{(p.bumpRequested || p.cancelRequested) && open && (
						<p className="text-muted-foreground text-sm">
							{p.cancelRequested
								? t("payoutCancelPending")
								: t("payoutBumpPending")}
						</p>
					)}
				</div>
				<ol className="flex flex-col gap-3 text-sm">
					{steps.map((s) => (
						<li key={s.key} className="flex items-start gap-3">
							<span
								aria-hidden
								className={`mt-1.5 size-2.5 shrink-0 rounded-full ${s.at ? "bg-primary" : "border border-muted-foreground/50"}`}
							/>
							<span className="flex flex-col">
								<span className={s.at ? "" : "text-muted-foreground"}>
									{t(`payoutStep_${s.key}`)}
								</span>
								{s.at && (
									<span className="text-muted-foreground text-xs">
										{fmtDateTime.format(s.at)}
									</span>
								)}
							</span>
						</li>
					))}
				</ol>
			</div>
		</>
	);
}
