import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StepUpDialog } from "@/components/auth/step-up-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { OrgContext } from "@/lib/auth/guards";
import type { NavGroup } from "@/lib/nav";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import type { BellItem } from "./notification-bell";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

const ROLE_LABEL: Record<OrgContext["orgRole"], string> = {
	owner: "Inhaber:in",
	editor: "Bearbeiter:in",
	viewer: "Lesend",
	auditor: "Prüfer:in",
};

export async function AppShell({
	ctx,
	orgName,
	groups,
	bell,
	children,
}: {
	ctx: OrgContext;
	orgName: string;
	groups: NavGroup[];
	bell: { items: BellItem[]; unread: number };
	children: ReactNode;
}) {
	const t = await getTranslations("Common");
	return (
		<div className="flex min-h-dvh">
			{/* Sidebar klebt in Fensterhöhe; nur die Navigation scrollt. Flex-Kinder
			    in Spalten ohne feste Höhe nie mit `flex-1` (Basis 0 %) — Safari
			    rechnet die Shell sonst auf Fensterhöhe herunter, der Header
			    schrumpft und die Sidebar endet mitten auf der Seite. */}
			<aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 shrink-0 items-center gap-2 border-border/60 border-b px-4">
					<Link
						href="/heute"
						className="lv-wordmark truncate text-[0.8rem] hover:opacity-70"
					>
						{t("productName")}
					</Link>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-4">
					<p className="lv-eyebrow mb-2 truncate px-1 text-[0.58rem] text-muted-foreground">
						{orgName}
					</p>
					<SidebarNav groups={groups} />
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-border/60 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
					<MobileNav groups={groups} orgName={orgName} />
					<Link href="/heute" className="lv-wordmark text-[0.8rem] lg:hidden">
						{t("productName")}
					</Link>
					<div className="ml-auto flex items-center gap-1">
						<CommandPalette groups={groups} />
						<NotificationBell items={bell.items} unread={bell.unread} />
						<ThemeSwitcher />
						<UserMenu
							name={ctx.name}
							email={ctx.email}
							roleLabel={ROLE_LABEL[ctx.orgRole]}
							isPlatformAdmin={ctx.isPlatformAdmin}
						/>
					</div>
				</header>
				<main className="mx-auto w-full max-w-6xl grow px-4 py-6 sm:px-6 sm:py-8">
					{children}
				</main>
				<StepUpDialog />
			</div>
		</div>
	);
}
