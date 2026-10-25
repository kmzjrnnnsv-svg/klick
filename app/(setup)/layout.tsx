import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { LegalLinks } from "@/components/shell/legal-links";
import { getSessionCtx } from "@/lib/auth/guards";

// Geführte Einrichtung (D0): ruhiges Layout ohne Sidebar, breiter als die
// Anmeldeseiten. Sitzung je Request — nie statisch vorrendern.
export const dynamic = "force-dynamic";

export default async function SetupLayout({
	children,
}: {
	children: ReactNode;
}) {
	const [t, sctx] = await Promise.all([
		getTranslations("Common"),
		getSessionCtx(),
	]);
	return (
		<>
			<header className="material-bar sticky top-0 z-30 w-full border-border/60 border-b">
				<div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link
						href="/heute"
						className="font-bold text-headline text-foreground hover:opacity-70"
					>
						{t("productName")}
					</Link>
				</div>
			</header>
			<main
				id="inhalt"
				className="mx-auto flex w-full max-w-4xl grow flex-col px-4 py-8 sm:px-6 sm:py-10"
			>
				{children}
			</main>
			<LegalLinks />
			{/* nach abgeschlossener Einrichtung verlangen Änderungen Step-up */}
			<StepUpDialog
				passkey={Boolean(sctx?.user.hasPasskey)}
				totp={Boolean(sctx?.user.twoFactorEnabled)}
			/>
		</>
	);
}
