import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminNav, type AdminNavSection } from "@/components/admin/admin-nav";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { LegalLinks } from "@/components/shell/legal-links";
import { ScrollReset } from "@/components/shell/scroll-reset";
import { buttonVariants } from "@/components/ui/button";
import { ContainedScroll } from "@/components/ui/contained-scroll";
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
	// Ab 1024 px wie die App: Kopf steht, Seitenleiste und Inhalt scrollen je
	// für sich, die Fußzeile sitzt unten in der Seitenleiste
	return (
		<div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
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
			<div className="mx-auto flex w-full max-w-7xl grow gap-8 px-4 py-8 sm:px-6 lg:min-h-0 lg:py-0">
				<div className="hidden w-56 shrink-0 flex-col lg:flex">
					<ContainedScroll
						as="aside"
						className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-8"
					>
						<AdminNav sections={sections} variant="sidebar" />
					</ContainedScroll>
					<LegalLinks compact className="shrink-0 [&_nav]:px-0" />
				</div>
				<main
					id="inhalt"
					data-scroll-root
					className="relative min-w-0 grow lg:overflow-y-auto lg:overscroll-contain lg:py-8"
				>
					<ScrollReset />
					{children}
				</main>
			</div>
			<LegalLinks className="lg:hidden" />
			<StepUpDialog
				passkey={Boolean(sctx?.user.hasPasskey)}
				totp={Boolean(sctx?.user.twoFactorEnabled)}
			/>
		</div>
	);
}
