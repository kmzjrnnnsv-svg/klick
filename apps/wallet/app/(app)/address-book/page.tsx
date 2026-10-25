import {
	ProposeDestinationDialog,
	VetoDestinationButton,
} from "@wallet/components/wallet/address-book";
import { SignerNotice } from "@wallet/components/wallet/signer-notice";
import type { AddressBookStatus } from "@wallet/db/schema";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { userNames } from "@wallet/lib/orgs/user-names";
import {
	effectiveStatus,
	listAddressBook,
} from "@wallet/lib/wallet/address-book";
import { configuredNetworks } from "@wallet/lib/wallet/node-clients";
import { confirmUrl } from "@wallet/lib/wallet/signer/client";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { fmtDateTime } from "@/lib/wallet/display";

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

// /address-book — Zieladressen für Auszahlungen: vorschlagen,
// per Sicherheitsschlüssel freigeben (Bestätigungsseite), Wartezeit, Veto
export default async function AddressBookPage() {
	const ctx = await requireUnlockedPage("/address-book");
	const t = await getTranslations("Wallet");
	const canInitiate = roleAllows(ctx.role, "wallet:initiate");
	const canApprove = roleAllows(ctx.role, "wallet:initiate");
	const { state, hello } = await signerState(ctx.orgId);
	const { rows, names, anchor } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const rows = await listAddressBook(tx, ctx.orgId);
		return {
			rows,
			anchor: await loadSignerAnchor(tx, ctx.orgId),
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
				className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead"
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
								className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-subhead hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{t("abConfirm")}
								<ArrowUpRight className="size-4" aria-hidden />
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
			<SignerNotice state={state} own={isOwnSigner(state, anchor)} />
			{rows.length === 0 ? (
				<EmptyState title={t("abEmpty")} lead={t("abEmptyLead")} />
			) : (
				<div className="flex flex-col gap-8">
					{open.length > 0 && (
						<ul className="flex flex-col gap-3">{open.map(entry)}</ul>
					)}
					{closed.length > 0 && (
						<section className="flex flex-col gap-3">
							<h2 className="font-semibold text-headline">{t("abClosed")}</h2>
							<ul className="flex flex-col gap-3">{closed.map(entry)}</ul>
						</section>
					)}
				</div>
			)}
		</>
	);
}
