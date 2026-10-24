// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/app/(welcome)/layout.tsx.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LegalLinks } from "@/components/shell/legal-links";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { WalletLockStrip } from "@/components/wallet/lock-strip";
import { requireWalletAreaPage } from "@/lib/auth/gates";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";

// Einführung in den Wallet-Bereich: ruhiges Layout ohne Sidebar (wie die
// geführte Einrichtung). Entsperrt wird je Seite (requireWalletPage).
export const dynamic = "force-dynamic";

export default async function WalletIntroLayout({
	children,
}: {
	children: ReactNode;
}) {
	const ctx = await requireWalletAreaPage();
	const t = await getTranslations("Common");
	const tn = await getTranslations("Nav");
	const closesAt =
		ctx.walletUnlocked && ctx.walletUnlockedAt
			? new Date(ctx.walletUnlockedAt.getTime() + WALLET_UNLOCK_MS)
			: null;
	return (
		<>
			<header className="sticky top-0 z-30 w-full border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
					<Link
						href="/wallet"
						className="flex items-baseline gap-2 hover:opacity-70"
					>
						<span className="lv-wordmark text-[0.95rem] text-foreground">
							{t("productName")}
						</span>
						<span className="text-muted-foreground text-sm">
							{tn("groupWallet")}
						</span>
					</Link>
					<ThemeSwitcher />
				</div>
			</header>
			<main
				id="inhalt"
				className="mx-auto flex w-full max-w-3xl grow flex-col px-4 py-6 sm:px-6 sm:py-10"
			>
				{closesAt && <WalletLockStrip closesAt={closesAt.toISOString()} />}
				{children}
			</main>
			<LegalLinks />
		</>
	);
}
