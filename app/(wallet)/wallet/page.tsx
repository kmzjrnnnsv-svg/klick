import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireWalletPage } from "@/lib/auth/gates";

export const metadata: Metadata = { title: "Wallet" };

// /wallet — Startseite des Wallet-Bereichs (entsperrt). Konten, Saldo und
// Bewegungen folgen mit wallet_accounts.
export default async function WalletHomePage() {
	await requireWalletPage("/wallet");
	const t = await getTranslations("Wallet");
	return (
		<>
			<PageHeader title={t("homeTitle")} lead={t("homeLead")} />
			<EmptyState title={t("homeEmptyTitle")} lead={t("homeEmptyBody")} />
		</>
	);
}
