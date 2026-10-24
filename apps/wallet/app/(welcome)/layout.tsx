import { UnlockStatus } from "@wallet/components/shell/unlock-status";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import Link from "next/link";
import type { ReactNode } from "react";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";

// Einführung: ruhiges Layout ohne Navigation. Entsperrt wird je Seite.
export default async function WelcomeLayout({
	children,
}: {
	children: ReactNode;
}) {
	const ctx = await requireOrgPage("/welcome/start");
	const until =
		ctx.unlocked && ctx.unlockedAt
			? new Date(ctx.unlockedAt.getTime() + WALLET_UNLOCK_MS).toISOString()
			: null;
	return (
		<>
			<header className="material-bar sticky top-0 z-30 w-full border-border/60 border-b">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
					<Link
						href="/"
						className="hit-area font-bold text-headline focus-visible:outline-2 focus-visible:outline-primary"
					>
						both.money
					</Link>
					<UnlockStatus until={until} />
				</div>
			</header>
			<main
				id="inhalt"
				className="mx-auto flex w-full max-w-3xl grow flex-col px-4 py-6 sm:px-6 sm:py-10"
			>
				{children}
			</main>
		</>
	);
}
