import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { AccountCard } from "@/components/wallet/account-card";
import {
	EditAccountDialog,
	RetireAccountButton,
} from "@/components/wallet/account-form";
import { CopyButton } from "@/components/wallet/copy-button";
import { TransferList } from "@/components/wallet/transfer-list";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { shortHash } from "@/lib/wallet/display";
import {
	custodyWalletOptions,
	frozenByAccount,
	getWalletAccount,
	issuedAddresses,
	listTransfers,
} from "@/lib/wallet/queries";

export const metadata: Metadata = { title: "Konto" };

const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

export default async function WalletAccountPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const ctx = await requireWalletPage(`/wallet/konten/${id}`);
	const t = await getTranslations("Wallet");
	const canManage = allows(ctx, { wallet: ["manage"] });
	if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const account = await getWalletAccount(tx, ctx.orgId, id);
		if (!account) return null;
		return {
			account,
			frozen: (await frozenByAccount(tx, ctx.orgId)).get(id),
			addresses: await issuedAddresses(tx, ctx.orgId, id),
			transfers: await listTransfers(tx, ctx.orgId, {
				accountId: id,
				limit: 20,
			}),
			custody: await custodyWalletOptions(tx, ctx.orgId),
		};
	});
	if (!data) notFound();
	const { account } = data;
	const custodyName = data.custody.find(
		(c) => c.id === account.custodyWalletId,
	)?.name;
	return (
		<>
			<PageHeader
				eyebrow={NETWORKS[account.network].label}
				title={account.name}
				actions={
					canManage &&
					account.status === "active" && (
						<>
							<EditAccountDialog
								account={{
									id: account.id,
									name: account.name,
									custodyWalletId: account.custodyWalletId,
								}}
								custodyWallets={data.custody}
							/>
							<RetireAccountButton id={account.id} name={account.name} />
						</>
					)
				}
			/>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<AccountCard account={account} frozen={data.frozen} link={false} />
				<dl className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-4 text-sm">
					<div>
						<dt className="text-muted-foreground text-xs">{t("colKind")}</dt>
						<dd className="flex flex-wrap gap-1.5">
							<Badge variant="outline">{t(`kind_${account.kind}`)}</Badge>
							<Badge variant="outline">{t(`purpose_${account.purpose}`)}</Badge>
							{account.status === "retired" && (
								<Badge variant="muted">{t("retired")}</Badge>
							)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">
							{t("detailFingerprint")}
						</dt>
						<dd className="font-mono" translate="no">
							{account.keyFingerprint}
						</dd>
					</div>
					<div className="min-w-0">
						<dt className="text-muted-foreground text-xs">{t("detailKey")}</dt>
						<dd className="flex items-center gap-2">
							<span
								className="truncate font-mono text-xs"
								title={account.accountKey}
								translate="no"
							>
								{shortHash(account.accountKey, 14, 10)}
							</span>
							<CopyButton
								value={account.accountKey}
								label={t("detailKey")}
								variant="ghost"
								iconOnly
							/>
						</dd>
					</div>
					{account.balanceHeight !== null && (
						<div>
							<dt className="text-muted-foreground text-xs">{t("colSync")}</dt>
							<dd>{t("detailHeight", { height: account.balanceHeight })}</dd>
						</div>
					)}
					{custodyName && (
						<div>
							<dt className="text-muted-foreground text-xs">
								{t("detailCustody")}
							</dt>
							<dd>
								<Link
									href="/verwahrung"
									className="text-primary underline-offset-4 hover:underline"
								>
									{custodyName}
								</Link>
							</dd>
						</div>
					)}
				</dl>
			</div>

			<section className="mt-10" aria-labelledby="acc-addresses">
				<h2
					id="acc-addresses"
					className="mb-3 font-serif-display text-xl text-primary"
				>
					{t("detailAddresses")}
				</h2>
				<ul className="divide-y divide-border/60 text-sm">
					{data.addresses.map((a) => (
						<li
							key={a.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
						>
							<span className="w-8 shrink-0 text-muted-foreground tabular-nums">
								#{a.index}
							</span>
							<span
								className="min-w-0 grow truncate font-mono text-xs"
								title={a.address}
								translate="no"
							>
								{a.address}
							</span>
							{a.label && (
								<span className="text-muted-foreground text-xs">{a.label}</span>
							)}
							<Badge variant={a.firstSeenAt ? "success" : "muted"}>
								{a.firstSeenAt ? t("detailUsed") : t("detailUnused")}
							</Badge>
							{a.issuedAt && (
								<span className="text-muted-foreground text-xs">
									{fmtTime.format(a.issuedAt)}
								</span>
							)}
						</li>
					))}
				</ul>
			</section>

			<section className="mt-10" aria-labelledby="acc-moves">
				<h2
					id="acc-moves"
					className="mb-1 font-serif-display text-xl text-primary"
				>
					{t("detailMovements")}
				</h2>
				<TransferList rows={data.transfers.rows} showAccount={false} />
			</section>
		</>
	);
}
