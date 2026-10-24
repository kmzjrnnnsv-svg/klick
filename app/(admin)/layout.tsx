import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
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
		{ href: "/admin", label: t("title") },
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
					<nav className="ml-4 hidden gap-4 md:flex">
						{tabs.map((tab) => (
							<Link
								key={tab.href}
								href={tab.href}
								className="font-medium text-muted-foreground text-subhead hover:text-foreground"
							>
								{tab.label}
							</Link>
						))}
					</nav>
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
				<nav className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:hidden">
					{tabs.map((tab) => (
						<Link
							key={tab.href}
							href={tab.href}
							className="inline-flex h-(--control-h-sm) shrink-0 items-center rounded-full bg-muted px-3 font-medium text-footnote"
						>
							{tab.label}
						</Link>
					))}
				</nav>
			</header>
			<main
				id="inhalt"
				className="mx-auto w-full max-w-6xl grow px-4 py-8 sm:px-6"
			>
				<p className="mb-6 text-callout text-muted-foreground">{t("lead")}</p>
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
