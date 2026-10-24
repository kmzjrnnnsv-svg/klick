import { SendForm } from "@wallet/components/wallet/send-form";
import { SignerNotice } from "@wallet/components/wallet/signer-notice";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { sendOptions } from "@wallet/lib/wallet/payouts/queries";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { NETWORKS } from "@/lib/wallet/core/networks";

export const metadata: Metadata = { title: "Senden" };

// /send — Auszahlung aus einem Hot-Konto an eine aktive Zieladresse.
// Bestätigt wird auf der Bestätigungsseite, signiert und gesendet vom Job.
export default async function SendPage() {
	const ctx = await requireUnlockedPage("/send");
	const t = await getTranslations("Wallet");
	const { state } = await signerState(ctx.orgId);
	const canInitiate = roleAllows(ctx.role, "wallet:initiate");
	const { accounts, destinations, anchor } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			...(await sendOptions(tx, ctx.orgId)),
			anchor: await loadSignerAnchor(tx, ctx.orgId),
		}),
	);
	const usable = accounts.filter((a) => !NETWORKS[a.network].live);

	return (
		<>
			<PageHeader title={t("sendTitle")} lead={t("sendLead")} />
			<SignerNotice state={state} own={isOwnSigner(state, anchor)} />
			{!canInitiate ? (
				<EmptyState title={t("sendNoRight")} lead={t("sendNoRightLead")} />
			) : usable.length === 0 ? (
				<EmptyState
					title={t("sendNoAccount")}
					lead={t("sendNoAccountLead")}
					actions={
						<Link className="text-primary underline" href="/accounts">
							{t("sendToAccounts")}
						</Link>
					}
				/>
			) : destinations.length === 0 ? (
				<EmptyState
					title={t("sendNoDestination")}
					lead={t("sendNoDestinationLead")}
					actions={
						<Link className="text-primary underline" href="/address-book">
							{t("sendToAddressBook")}
						</Link>
					}
				/>
			) : state !== "ready" ? null : (
				<SendForm
					accounts={usable.map((a) => ({
						...a,
						networkLabel: NETWORKS[a.network].label,
					}))}
					destinations={destinations}
				/>
			)}
		</>
	);
}
