import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminNav, type AdminNavSection } from "@/components/admin/admin-nav";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { LegalLinks } from "@/components/shell/legal-links";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { gateAdmin } from "@/lib/auth/gates";
import { getSessionCtx } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Rahmen des Plattform-Admins: Kopf mit „Zur App“, ab 1024 px Seitenleiste mit
// Gruppen (lib/admin/nav.ts), darunter Kapseln.
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
	const sections: AdminNavSection[] = ADMIN_NAV.map((g) => ({
		label: t(g.labelKey),
		items: g.items.map((i) => ({
			href: i.href,
			label: t(i.labelKey),
			icon: i.icon,
		})),
	}));
	return (
		<>
			<header className="material-bar sticky top-0 z-30 shrink-0 border-border/60 border-b">
				<div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
					<Link href="/heute" className="font-bold text-headline">
						Klick
					</Link>
					<span className="font-medium text-footnote text-muted-foreground">
						{t("title")}
					</span>
					<div className="ml-auto flex items-center gap-1">
						<Link
							href="/heute"
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							{t("toApp")}
						</Link>
					</div>
				</div>
				{/* Handy und Tablet: dieselben Seiten als waagrecht scrollende Leiste */}
				<AdminNav sections={sections} variant="chips" />
			</header>
			<div className="mx-auto flex w-full max-w-7xl grow gap-8 px-4 py-8 sm:px-6">
				<aside className="sticky top-22 hidden h-fit w-56 shrink-0 lg:block">
					<AdminNav sections={sections} variant="sidebar" />
				</aside>
				<main id="inhalt" className="min-w-0 grow">
					{children}
				</main>
			</div>
			<LegalLinks />
			<StepUpDialog
				passkey={Boolean(sctx?.user.hasPasskey)}
				totp={Boolean(sctx?.user.twoFactorEnabled)}
			/>
		</>
	);
}
