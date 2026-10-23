import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { SendForm } from "@/components/wallet/send-form";
import { SignerNotice } from "@/components/wallet/signer-notice";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { sendOptions } from "@/lib/wallet/payouts/queries";
import { signerState } from "@/lib/wallet/signer/status";

export const metadata: Metadata = { title: "Senden" };

// /wallet/senden — Auszahlung aus einem Hot-Konto an eine aktive Zieladresse.
// Bestätigt wird auf der Bestätigungsseite, signiert und gesendet vom Job.
export default async function SendPage() {
	const ctx = await requireWalletPage("/wallet/senden");
	const t = await getTranslations("Wallet");
	const { state } = await signerState(ctx.orgId);
	const canInitiate = allows(ctx, { wallet: ["initiate"] });
	const { accounts, destinations } = await readOrg(toOrgCtx(ctx), (tx) =>
		sendOptions(tx, ctx.orgId),
	);
	const usable = accounts.filter((a) => !NETWORKS[a.network].live);

	return (
		<>
			<PageHeader title={t("sendTitle")} lead={t("sendLead")} />
			<SignerNotice state={state} />
			{!canInitiate ? (
				<EmptyState title={t("sendNoRight")} lead={t("sendNoRightLead")} />
			) : usable.length === 0 ? (
				<EmptyState
					title={t("sendNoAccount")}
					lead={t("sendNoAccountLead")}
					actions={
						<Link className="text-primary underline" href="/wallet/konten">
							{t("sendToAccounts")}
						</Link>
					}
				/>
			) : destinations.length === 0 ? (
				<EmptyState
					title={t("sendNoDestination")}
					lead={t("sendNoDestinationLead")}
					actions={
						<Link className="text-primary underline" href="/wallet/adressbuch">
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
