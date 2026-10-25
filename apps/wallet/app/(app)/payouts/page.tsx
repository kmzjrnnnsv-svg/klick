import { SignerNotice } from "@wallet/components/wallet/signer-notice";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { listPayouts } from "@wallet/lib/wallet/payouts/queries";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import { Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { amountText, fmtDateTime, PAYOUT_BADGE } from "@/lib/wallet/display";

export const metadata: Metadata = { title: "Auszahlungen" };

// /payouts — alle Auszahlungen mit Stand
export default async function PayoutsPage() {
	const ctx = await requireUnlockedPage("/payouts");
	const t = await getTranslations("Wallet");
	const { state } = await signerState(ctx.orgId);
	const { rows, anchor } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listPayouts(tx, ctx.orgId),
		anchor: await loadSignerAnchor(tx, ctx.orgId),
	}));

	return (
		<>
			<PageHeader
				title={t("payoutsTitle")}
				lead={t("payoutsLead")}
				actions={
					roleAllows(ctx.role, "wallet:initiate") && (
						<Button asChild>
							<Link href="/send">
								<Send aria-hidden />
								{t("sendTitle")}
							</Link>
						</Button>
					)
				}
			/>
			<SignerNotice state={state} own={isOwnSigner(state, anchor)} />
			{rows.length === 0 ? (
				<EmptyState title={t("payoutsEmpty")} lead={t("payoutsEmptyLead")} />
			) : (
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
					{rows.map(({ payout: p, account }) => (
						<li key={p.id}>
							<Link
								href={`/payouts/${p.id}`}
								className="flex flex-col gap-1 px-4 py-3 text-subhead hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4"
							>
								<span className="font-medium font-mono tabular-nums sm:w-44 sm:shrink-0">
									{amountText(account.network, p.asset, p.amount)}
								</span>
								<span className="min-w-0 grow truncate">
									{t("payoutTo", { label: p.destinationLabel })}
									<span className="text-muted-foreground">
										{" · "}
										{account.name}
									</span>
								</span>
								<span className="flex items-center gap-3">
									<Badge variant={PAYOUT_BADGE[p.status]}>
										{t(`payoutStatus_${p.status}`)}
									</Badge>
									<span className="whitespace-nowrap text-muted-foreground">
										{fmtDateTime.format(p.createdAt)}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
