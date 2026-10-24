import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import type { OrgContext } from "@/lib/auth/guards";
import { isExternal, ROLE_LABEL } from "@/lib/auth/memberships";
import { allows } from "@/lib/auth/permissions";
import { type NavGroup, navTabs } from "@/lib/nav";
import { AreaSwitcher, type ShellArea } from "./area-switcher";
import { CommandPalette } from "./command-palette";
import { LegalLinks } from "./legal-links";
import { MobileNav } from "./mobile-nav";
import type { BellItem } from "./notification-bell";
import { NotificationBell } from "./notification-bell";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { TabBar } from "./tab-bar";
import { UserMenu } from "./user-menu";

export async function AppShell({
	ctx,
	orgName,
	orgs,
	groups,
	bell,
	area = "compliance",
	walletEnabled = false,
	children,
}: {
	ctx: OrgContext;
	orgName: string;
	// alle Mitgliedschaften des Kontos (Umschalter ab zwei)
	orgs: readonly SwitcherOrg[];
	groups: NavGroup[];
	bell: { items: BellItem[]; unread: number };
	// Compliance oder Wallet: bestimmt Startseite und Umschalter
	area?: ShellArea;
	// Wallet-Bereich für die Org eingeschaltet (org_settings.wallet_enabled)
	walletEnabled?: boolean;
	children: ReactNode;
}) {
	const t = await getTranslations("Common");
	const home = area === "wallet" ? "/wallet" : "/heute";
	const walletAccess = walletEnabled && allows(ctx, { wallet: ["read"] });
	// Am Handy Tab-Leiste (Apple HIG); ohne Tabs (Wallet-Bereich) das Menü
	const tabBar = navTabs(groups).length > 0;
	return (
		<div className="flex min-h-dvh">
			{/* Sidebar klebt in Fensterhöhe; nur die Navigation scrollt. Flex-Kinder
			    in Spalten ohne feste Höhe nie mit `flex-1` (Basis 0 %) — Safari
			    rechnet die Shell sonst auf Fensterhöhe herunter, der Header
			    schrumpft und die Sidebar endet mitten auf der Seite. */}
			<aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 shrink-0 items-center gap-2 px-5">
					<Link
						href={home}
						className="truncate font-bold text-headline hover:opacity-70"
					>
						{t("productName")}
					</Link>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
					<div className="mb-3 px-2">
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
								{t("externalAccess", { role: ROLE_LABEL[ctx.orgRole] })}
							</p>
						)}
					</div>
					<SidebarNav groups={groups} />
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="material-bar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-border/60 border-b pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:px-6">
					{!tabBar && (
						<MobileNav
							groups={groups}
							orgName={orgName}
							canSwitch={orgs.length > 1}
						/>
					)}
					<Link href={home} className="px-1 font-bold text-headline lg:hidden">
						{t("productName")}
					</Link>
					{walletAccess && (
						<div className="ml-1 sm:ml-2 lg:ml-0">
							<AreaSwitcher area={area} />
						</div>
					)}
					<div className="ml-auto flex items-center gap-1">
						<CommandPalette groups={groups} tabBar={tabBar} />
						<NotificationBell items={bell.items} unread={bell.unread} />
						<UserMenu
							name={ctx.name}
							email={ctx.email}
							roleLabel={ROLE_LABEL[ctx.orgRole]}
							isPlatformAdmin={ctx.isPlatformAdmin}
						/>
					</div>
				</header>
				<main
					id="inhalt"
					className="mx-auto w-full max-w-6xl grow px-4 py-6 sm:px-6 sm:py-8"
				>
					{children}
				</main>
				<LegalLinks />
				{tabBar && <TabBar groups={groups} />}
				<StepUpDialog passkey={ctx.hasPasskey} totp={ctx.hasTotp} />
			</div>
		</div>
	);
}
