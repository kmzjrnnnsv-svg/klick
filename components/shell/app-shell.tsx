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
		<div className="flex min-h-full">
			<aside className="hidden w-60 shrink-0 flex-col border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 items-center gap-2 border-border/60 border-b px-4">
					<Link
						href="/heute"
						className="lv-wordmark truncate text-[0.8rem] hover:opacity-70"
					>
						{t("productName")}
					</Link>
				</div>
				<div className="px-4 pt-4 pb-2">
					<p className="lv-eyebrow truncate text-[0.58rem] text-muted-foreground">
						{orgName}
					</p>
				</div>
				<div className="flex-1 overflow-y-auto px-3 pb-4">
					<SidebarNav groups={groups} />
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-border/60 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
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
				<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
					{children}
				</main>
				<StepUpDialog />
			</div>
		</div>
	);
}
