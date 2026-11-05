import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { PageFind } from "@/components/ui/page-find";
import { ScrollReset } from "@/components/ui/scroll-reset";
import type { OrgContext } from "@/lib/auth/guards";
import { isExternal, ROLE_LABEL } from "@/lib/auth/memberships";
import { articlesFor } from "@/lib/help";
import type { NavGroup } from "@/lib/nav";
import { CommandPalette } from "./command-palette";
import { ForbiddenNotice } from "./forbidden-notice";
import { HelpLink } from "./help-link";
import { LegalLinks } from "./legal-links";
import type { BellItem } from "./notification-bell";
import { NotificationBell } from "./notification-bell";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { SidebarSearch } from "./sidebar-search";
import { TabBar } from "./tab-bar";
import { UserMenu } from "./user-menu";

// Zugangsende Externer (ADR-018) in der Seitenleiste
const fmtAccess = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

export async function AppShell({
	ctx,
	orgName,
	orgs,
	groups,
	bell,
	children,
}: {
	ctx: OrgContext;
	orgName: string;
	// alle Mitgliedschaften des Kontos (Umschalter ab zwei)
	orgs: readonly SwitcherOrg[];
	groups: NavGroup[];
	bell: { items: BellItem[]; unread: number };
	children: ReactNode;
}) {
	const t = await getTranslations("Common");
	const te = await getTranslations("Errors");
	const home = "/heute";
	// „Dafür fehlt dir das Recht“ je Rolle (Umleitung aus requireOrgPage)
	const forbiddenText =
		ctx.orgRole === "employee"
			? te("forbiddenEmployee")
			: isExternal(ctx.orgRole)
				? te("forbiddenExternal", { role: ROLE_LABEL[ctx.orgRole] })
				: te("forbiddenMember");
	return (
		// Ab 1024 px wie in iPad-/Mac-Apps: das Fenster steht, Seitenleiste und
		// Inhalt scrollen je für sich (rechte Spalte = data-scroll-root, die
		// Kopfleiste klebt darin). Darunter scrollt das Fenster — nur so gehen
		// am iPhone das Antippen der Statusleiste und die einklappende Leiste.
		<div className="flex min-h-dvh lg:h-dvh lg:overflow-hidden">
			{/* Sidebar klebt in Fensterhöhe; nur die Navigation scrollt. Flex-Kinder
			    in Spalten ohne feste Höhe nie mit `flex-1` (Basis 0 %) — Safari
			    rechnet die Shell sonst auf Fensterhöhe herunter, der Header
			    schrumpft und die Sidebar endet mitten auf der Seite. */}
			<aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 shrink-0 items-center gap-2 px-5">
					<Link
						href={home}
						className="hit-area font-bold text-headline hover:opacity-70"
					>
						{t("productName")}
					</Link>
				</div>
				<div className="shrink-0 px-5 pb-2">
					<SidebarSearch />
				</div>
				<ContainedScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
					{/* wie ein Gruppenkopf (28 px, 2 px Abstand): Org-Name, Kopf der
					    Liste daneben (geteilte Seiten) und erster Eintrag stehen auf
					    einer Linie (SPLIT_TOP in components/ui/source-list.tsx) */}
					<div className="mb-0.5 flex min-h-7 flex-col justify-center px-2 pointer-coarse:min-h-11">
						{orgs.length > 1 ? (
							<div className="-mx-1">
								<OrgSwitcher
									currentOrgId={ctx.orgId}
									currentName={orgName}
									orgs={orgs}
								/>
							</div>
						) : (
							<p className="truncate font-medium text-footnote text-muted-foreground">
								{orgName}
							</p>
						)}
						{isExternal(ctx.orgRole) && (
							<p className="mt-1 text-footnote text-muted-foreground">
								{ctx.accessUntil
									? t("externalAccessUntil", {
											role: ROLE_LABEL[ctx.orgRole],
											date: fmtAccess.format(ctx.accessUntil),
										})
									: t("externalAccess", { role: ROLE_LABEL[ctx.orgRole] })}
							</p>
						)}
					</div>
					<SidebarNav groups={groups} />
				</ContainedScroll>
				<LegalLinks compact className="shrink-0" />
			</aside>
			<div
				data-scroll-root
				className="relative flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-y-auto lg:overscroll-contain"
			>
				<ScrollReset />
				<PageFind />
				<header className="material-bar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-border/60 border-b pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:px-6">
					<Link
						href={home}
						className="hit-area px-1 font-bold text-headline lg:hidden"
					>
						{t("productName")}
					</Link>
					<div className="ml-auto flex items-center gap-1">
						<CommandPalette groups={groups} tabBar />
						<HelpLink
							allowed={
								ctx.orgRole === "employee"
									? articlesFor(ctx.orgRole).map((a) => a.slug)
									: undefined
							}
							auditor={ctx.orgRole === "auditor"}
						/>
						<NotificationBell items={bell.items} unread={bell.unread} />
						<UserMenu
							name={ctx.name}
							email={ctx.email}
							roleLabel={ROLE_LABEL[ctx.orgRole]}
							isPlatformAdmin={ctx.isPlatformAdmin}
						/>
					</div>
				</header>
				{/* Breite wächst mit dem Bildschirm, aber nicht endlos: 72rem bis
				    Laptop, 88rem ab 1600 px, 100rem ab 2240 px Fensterbreite;
				    geteilte Seiten (data-split-page="flush") nutzen alles */}
				<main
					id="inhalt"
					className="mx-auto w-full max-w-6xl grow px-4 py-6 sm:px-6 sm:py-8 min-[100rem]:max-w-[88rem] min-[140rem]:max-w-[100rem]"
				>
					{children}
				</main>
				<LegalLinks className="lg:hidden" />
				<TabBar groups={groups} />
				<StepUpDialog passkey={ctx.hasPasskey} totp={ctx.hasTotp} />
				<Suspense fallback={null}>
					<ForbiddenNotice message={forbiddenText} />
				</Suspense>
			</div>
		</div>
	);
}
