import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { WalletUnlock } from "@/components/wallet/unlock";
import { requireWalletAreaPage } from "@/lib/auth/gates";
import { walletReturnPath } from "@/lib/wallet/return-path";

export const metadata: Metadata = { title: "Wallet öffnen" };

// Eingangstür zum Wallet-Bereich: ein Knopf, kein Formular. Nur Passkey
// (Zweck „wallet“), 15 Minuten fest — TOTP und Mail-Link zählen nicht.
export default async function WalletUnlockPage({
	searchParams,
}: {
	searchParams: Promise<{ zurueck?: string }>;
}) {
	const ctx = await requireWalletAreaPage();
	const back = walletReturnPath((await searchParams).zurueck);
	if (ctx.walletUnlocked) redirect(back);
	const t = await getTranslations("Wallet");
	return (
		<div className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-brown/10 text-brown">
				<KeyRound className="size-5" aria-hidden />
			</div>
			<h1 className="mt-6 text-balance font-serif-display text-3xl text-primary">
				{t("unlockTitle")}
			</h1>
			<p className="mt-3 text-pretty text-muted-foreground text-sm leading-relaxed">
				{t("unlockLead")}
			</p>
			<div className="mt-8">
				{ctx.hasPasskey ? (
					<WalletUnlock returnTo={back} />
				) : (
					<div className="rounded-md border border-border/60 p-4 text-sm">
						<p className="text-pretty">{t("unlockNoPasskey")}</p>
						<Link
							href="/einstellungen?tab=security"
							className="mt-3 inline-block text-primary underline-offset-4 hover:underline"
						>
							{t("unlockNoPasskeyLink")}
						</Link>
					</div>
				)}
			</div>
			<p className="mt-6 flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
				<ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
				<span>{t("unlockNetworkTest")}</span>
			</p>
			<details className="mt-6 text-sm">
				<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
					{t("unlockWhy")}
				</summary>
				<p className="mt-2 text-pretty text-muted-foreground leading-relaxed">
					{t("unlockWhyBody")}
				</p>
			</details>
			<Link
				href="/heute"
				className="mt-10 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
			>
				{t("unlockBack")}
			</Link>
		</div>
	);
}
