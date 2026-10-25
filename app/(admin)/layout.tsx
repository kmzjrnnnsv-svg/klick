import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { LegalLinks } from "@/components/shell/legal-links";
import { buttonVariants } from "@/components/ui/button";
import { gateAdmin } from "@/lib/auth/gates";
import { getSessionCtx } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	await gateAdmin();
	const [t, sctx] = await Promise.all([
		getTranslations("Admin"),
		getSessionCtx(),
	]);
	const tabs = [
		{ href: "/admin", label: t("overview") },
		{ href: "/admin/orgs", label: t("orgs") },
		{ href: "/admin/users", label: t("users") },
		{ href: "/admin/audit", label: t("audit") },
		{ href: "/admin/anfragen", label: t("inquiries") },
		{ href: "/admin/preise", label: t("prices") },
		{ href: "/admin/cms", label: t("cms") },
	];
	return (
		<>
			<header className="material-bar sticky top-0 z-30 shrink-0 border-border/60 border-b">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
					<Link href="/heute" className="font-bold text-headline">
						Klick
					</Link>
					<span className="font-medium text-footnote text-muted-foreground">
						{t("title")}
					</span>
					<AdminNav tabs={tabs} variant="bar" />
					<div className="ml-auto flex items-center gap-1">
						<Link
							href="/heute"
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							Zur App
						</Link>
					</div>
				</div>
				{/* Handy: dieselben Reiter als waagrecht scrollende Leiste */}
				<AdminNav tabs={tabs} variant="chips" />
			</header>
			<main
				id="inhalt"
				className="mx-auto w-full max-w-6xl grow px-4 py-8 sm:px-6"
			>
				{children}
			</main>
			<LegalLinks />
			<StepUpDialog
				passkey={Boolean(sctx?.user.hasPasskey)}
				totp={Boolean(sctx?.user.twoFactorEnabled)}
			/>
		</>
	);
}
