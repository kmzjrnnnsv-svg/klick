import { LegalFooter } from "@wallet/components/legal/footer";
import type { OrgContext } from "@wallet/lib/auth/guards";
import { ROLE_LABEL, roleAllows } from "@wallet/lib/auth/permissions";
import { walletNav } from "@wallet/lib/nav";
import type { Membership } from "@wallet/lib/orgs/memberships";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { PageFind } from "@/components/ui/page-find";
import { ScrollReset } from "@/components/ui/scroll-reset";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";
import { StepUpDialog } from "../auth/step-up-dialog";
import { Bell, type BellItem } from "./bell";
import { CommandPalette, SidebarSearch } from "./command-palette";
import { SidebarLinks, TabBar } from "./nav-links";
import { OrgMenu } from "./org-menu";
import { UnlockStatus } from "./unlock-status";
import { UserMenu } from "./user-menu";

// Rahmen von both.money nach Apple HIG, gleich aufgebaut wie Klick
// (components/shell/app-shell.tsx): Seitenleiste ab 1024 px mit Suchfeld
// (⌘K), Org und Menü (eigener Scrollbereich, Rechtslinks unten), Kopf als
// Material mit Entsperr-Status, Glocke und Konto; darunter Kopf mit Org und
// die Tab-Leiste (lib/nav.ts); ⌘F springt ins Suchfeld der Seite (PageFind);
// Step-up-Dialog gemountet.
export async function AppShell({
	ctx,
	orgs,
	bell,
	send,
	banner,
	children,
}: {
	ctx: OrgContext;
	orgs: Membership[];
	bell: { items: BellItem[]; unread: number };
	// Senden nur mit eigenem Signer (isOwnSigner)
	send: boolean;
	banner?: React.ReactNode;
	children: React.ReactNode;
}) {
	const t = await getTranslations("Shell");
	const nav = walletNav({
		send,
		members: roleAllows(ctx.role, "members:read"),
		audit: roleAllows(ctx.role, "audit:read"),
		exportManage: roleAllows(ctx.role, "export:manage"),
		access: roleAllows(ctx.role, "settings:update"),
		mandates: roleAllows(ctx.role, "wallet:initiate"),
	});
	const current = { id: ctx.orgId, name: ctx.orgName };
	const orgList = orgs.map((o) => ({ id: o.orgId, name: o.name }));
	const until =
		ctx.unlocked && ctx.unlockedAt
			? new Date(ctx.unlockedAt.getTime() + WALLET_UNLOCK_MS).toISOString()
			: null;
	return (
		// Ab 1024 px wie in iPad-/Mac-Apps: das Fenster steht, Seitenleiste und
		// Inhalt scrollen je für sich (rechte Spalte = data-scroll-root, die
		// Kopfleiste klebt darin), Rechtslinks klein unten in der Seitenleiste.
		// Darunter scrollt das Fenster, Tab-Leiste unten — nur so gehen am
		// iPhone das Antippen der Statusleiste und die einklappende Leiste.
		<div
			data-app-shell
			className="flex min-h-full grow lg:h-dvh lg:overflow-hidden"
		>
			<a
				href="#inhalt"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2"
			>
				{t("skip")}
			</a>
			<aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start border-border/60 border-r bg-sidebar text-sidebar-foreground lg:flex">
				<div className="flex h-14 shrink-0 items-center px-5">
					<Link
						href="/"
						className="hit-area rounded-sm font-bold text-headline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						both.money
					</Link>
				</div>
				<div className="shrink-0 px-5 pb-2">
					<SidebarSearch />
				</div>
				<ContainedScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
					<div className="mb-3 px-2">
						<OrgMenu sidebar current={current} orgs={orgList} />
					</div>
					<SidebarLinks groups={nav} />
				</ContainedScroll>
				<LegalFooter compact className="shrink-0" />
			</aside>
			<div
				data-scroll-root
				className="relative flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-y-auto lg:overscroll-contain"
			>
				<ScrollReset />
				<PageFind />
				<CommandPalette groups={nav} />
				<header className="material-bar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-border/60 border-b pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:gap-3 sm:px-6">
					<Link
						href="/"
						className="hit-area shrink-0 rounded-sm px-1 font-bold text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
					>
						both.money
					</Link>
					<span
						className="hidden text-muted-foreground sm:inline lg:hidden"
						aria-hidden
					>
						/
					</span>
					{/* ab 1024 px steht die Org oben in der Seitenleiste (wie Klick) */}
					<div className="min-w-0 grow lg:hidden">
						<OrgMenu current={current} orgs={orgList} />
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
						<UnlockStatus until={until} />
						<Bell items={bell.items} unread={bell.unread} />
						<UserMenu
							name={ctx.name}
							email={ctx.email}
							role={ROLE_LABEL[ctx.role]}
						/>
					</div>
				</header>
				{/* Breite wie in Klick: wächst mit dem Bildschirm, aber nicht endlos —
				    72rem bis Laptop, 88rem ab 1600 px, 100rem ab 2240 px */}
				<main
					id="inhalt"
					className="mx-auto w-full min-w-0 max-w-6xl grow px-4 py-6 sm:px-6 sm:py-8 min-[100rem]:max-w-[88rem] min-[140rem]:max-w-[100rem]"
				>
					{banner}
					{children}
				</main>
			</div>
			<TabBar send={send} />
			<StepUpDialog />
		</div>
	);
}
