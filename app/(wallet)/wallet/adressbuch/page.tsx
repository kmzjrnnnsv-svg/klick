import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	ProposeDestinationDialog,
	VetoDestinationButton,
} from "@/components/wallet/address-book";
import { SignerNotice } from "@/components/wallet/signer-notice";
import type { AddressBookStatus } from "@/db/schema/wallet";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { effectiveStatus, listAddressBook } from "@/lib/wallet/address-book";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { fmtDateTime } from "@/lib/wallet/display";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import { confirmUrl } from "@/lib/wallet/signer/client";
import { signerState } from "@/lib/wallet/signer/status";

export const metadata: Metadata = { title: "Adressbuch" };

const BADGE: Record<
	AddressBookStatus,
	"warning" | "secondary" | "success" | "destructive" | "muted"
> = {
	proposed: "warning",
	cooling: "secondary",
	active: "success",
	vetoed: "destructive",
	expired: "muted",
};

// /wallet/adressbuch — Zieladressen für Auszahlungen: vorschlagen,
// per Sicherheitsschlüssel freigeben (Bestätigungsseite), Wartezeit, Veto
export default async function AddressBookPage() {
	const ctx = await requireWalletPage("/wallet/adressbuch");
	const t = await getTranslations("Wallet");
	const canInitiate = allows(ctx, { wallet: ["initiate"] });
	const canApprove = allows(ctx, { wallet: ["approve"] });
	const { state, hello } = await signerState(ctx.orgId);
	const { rows, names } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const rows = await listAddressBook(tx, ctx.orgId);
		return {
			rows,
			names: await userNames(
				tx,
				rows.map((r) => r.proposedByUserId),
			),
		};
	});
	const now = new Date();
	const networks =
		state === "ready"
			? configuredNetworks()
					.filter((n) => !NETWORKS[n].live && hello?.networks.includes(n))
					.map((n) => ({ key: n, label: NETWORKS[n].label }))
			: [];
	const open = rows.filter((r) =>
		["proposed", "cooling", "active"].includes(effectiveStatus(r, now)),
	);
	const closed = rows.filter((r) => !open.includes(r));

	const entry = (r: (typeof rows)[number]) => {
		const status = effectiveStatus(r, now);
		const link = confirmUrl(r.intentId);
		return (
			<li
				key={r.id}
				className="flex flex-col gap-2 rounded-md border p-4 text-sm"
			>
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{r.label}</span>
					<Badge variant={BADGE[status]}>{t(`abStatus_${status}`)}</Badge>
					<Badge variant="muted">{NETWORKS[r.network].label}</Badge>
				</div>
				<code
					className="break-all font-mono text-[13px] leading-relaxed"
					translate="no"
				>
					{r.address}
				</code>
				<p className="text-muted-foreground">
					{status === "proposed" &&
						t("abWaiting", { until: fmtDateTime.format(r.expiresAt) })}
					{status === "cooling" &&
						r.activeFrom &&
						t("abCooling", { at: fmtDateTime.format(r.activeFrom) })}
					{status === "active" &&
						r.activeFrom &&
						t("abActiveSince", { at: fmtDateTime.format(r.activeFrom) })}
					{status === "vetoed" &&
						t("abVetoedAt", {
							at: r.vetoedAt ? fmtDateTime.format(r.vetoedAt) : "—",
							reason: r.vetoReason ?? "—",
						})}
					{status === "expired" && t("abExpired")}
					{" · "}
					{t("abProposedBy", {
						name: (r.proposedByUserId && names.get(r.proposedByUserId)) || "—",
						at: fmtDateTime.format(r.createdAt),
					})}
				</p>
				{(status === "proposed" ||
					status === "cooling" ||
					status === "active") && (
					<div className="flex flex-wrap gap-2">
						{status === "proposed" && canApprove && link && (
							<a
								href={link}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ExternalLink className="size-4" aria-hidden />
								{t("abConfirm")}
							</a>
						)}
						<VetoDestinationButton id={r.id} label={r.label} />
					</div>
				)}
			</li>
		);
	};

	return (
		<>
			<PageHeader
				title={t("abTitle")}
				lead={t("abLead")}
				actions={
					canInitiate &&
					networks.length > 0 && (
						<ProposeDestinationDialog networks={networks} />
					)
				}
			/>
			<SignerNotice state={state} />
			{rows.length === 0 ? (
				<EmptyState title={t("abEmpty")} lead={t("abEmptyLead")} />
			) : (
				<div className="flex flex-col gap-8">
					{open.length > 0 && (
						<ul className="flex flex-col gap-3">{open.map(entry)}</ul>
					)}
					{closed.length > 0 && (
						<section className="flex flex-col gap-3">
							<h2 className="font-serif-display text-lg text-primary">
								{t("abClosed")}
							</h2>
							<ul className="flex flex-col gap-3">{closed.map(entry)}</ul>
						</section>
					)}
				</div>
			)}
		</>
	);
}
