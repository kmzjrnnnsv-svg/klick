import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminNav, type AdminNavSection } from "@/components/admin/admin-nav";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { LegalLinks } from "@/components/shell/legal-links";
import { buttonVariants } from "@/components/ui/button";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { PageFind } from "@/components/ui/page-find";
import { ScrollReset } from "@/components/ui/scroll-reset";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { gateAdmin } from "@/lib/auth/gates";
import { getSessionCtx } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Rahmen des Plattform-Admins: Kopf mit „Zur App“, ab 1024 px Seitenleiste mit
// Gruppen (lib/admin/nav.ts) wie in der App, darunter Kapseln.
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
	// Wie der Rahmen der App (components/shell/app-shell.tsx): ab 1024 px
	// steht das Fenster, links die Seitenleiste in voller Höhe (scrollt für
	// sich, Fußzeile unten), rechts Kopf und Inhalt als eigener Scrollbereich;
	// darunter Kopf mit den Seiten als Kapseln, das Fenster scrollt
	return (
		<div className="flex min-h-dvh lg:h-dvh lg:overflow-hidden">
			<aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 shrink-0 items-center gap-2 px-5">
					<Link
						href="/admin"
						className="hit-area font-bold text-headline hover:opacity-70"
					>
						Klick
					</Link>
					<span className="font-medium text-footnote text-muted-foreground">
						{t("title")}
					</span>
				</div>
				<ContainedScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
					<AdminNav sections={sections} variant="sidebar" />
				</ContainedScroll>
				<LegalLinks compact className="shrink-0" />
			</aside>
			<div
				data-scroll-root
				className="relative flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-y-auto lg:overscroll-contain"
			>
				<ScrollReset />
				<PageFind />
				<header className="material-bar sticky top-0 z-30 shrink-0 border-border/60 border-b">
					<div className="flex h-14 items-center gap-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6">
						<Link href="/admin" className="font-bold text-headline lg:hidden">
							Klick
						</Link>
						<span className="font-medium text-footnote text-muted-foreground lg:hidden">
							{t("title")}
						</span>
						<div className="ml-auto flex items-center gap-1">
							<Link
								href="/heute"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
								)}
							>
								{t("toApp")}
							</Link>
						</div>
					</div>
					{/* Handy und Tablet: dieselben Seiten als waagrecht scrollende Leiste */}
					<AdminNav sections={sections} variant="chips" />
				</header>
				<main
					id="inhalt"
					className="mx-auto w-full max-w-6xl grow px-4 py-6 sm:px-6 sm:py-8 min-[100rem]:max-w-[88rem] min-[140rem]:max-w-[100rem]"
				>
					{children}
				</main>
				<LegalLinks className="lg:hidden" />
			</div>
			<StepUpDialog
				passkey={Boolean(sctx?.user.hasPasskey)}
				totp={Boolean(sctx?.user.twoFactorEnabled)}
			/>
		</div>
	);
}
