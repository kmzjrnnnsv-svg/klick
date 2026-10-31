import type { OrgContext } from "@wallet/lib/auth/guards";
import { ROLE_LABEL, roleAllows } from "@wallet/lib/auth/permissions";
import { walletNav } from "@wallet/lib/nav";
import type { Membership } from "@wallet/lib/orgs/memberships";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";
import { StepUpDialog } from "../auth/step-up-dialog";
import { Bell, type BellItem } from "./bell";
import { SidebarLinks, TabBar } from "./nav-links";
import { OrgMenu } from "./org-menu";
import { UnlockStatus } from "./unlock-status";
import { UserMenu } from "./user-menu";

// Rahmen von both.money nach Apple HIG: Kopf als Material mit Org,
// Entsperr-Status, Glocke und Konto; Seitenleiste ab 1024 px, darunter die
// Tab-Leiste (lib/nav.ts); Step-up-Dialog gemountet.
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
	const until =
		ctx.unlocked && ctx.unlockedAt
			? new Date(ctx.unlockedAt.getTime() + WALLET_UNLOCK_MS).toISOString()
			: null;
	return (
		<div className="flex min-h-full grow flex-col">
			<a
				href="#inhalt"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2"
			>
				{t("skip")}
			</a>
			<header className="material-bar sticky top-0 z-30 border-border/60 border-b">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-2 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:gap-3">
					<Link
						href="/"
						className="hit-area shrink-0 rounded-sm font-bold text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						both.money
					</Link>
					<span className="hidden text-muted-foreground sm:inline" aria-hidden>
						/
					</span>
					<div className="min-w-0 grow">
						<OrgMenu
							current={{ id: ctx.orgId, name: ctx.orgName }}
							orgs={orgs.map((o) => ({ id: o.orgId, name: o.name }))}
						/>
					</div>
					<UnlockStatus until={until} />
					<Bell items={bell.items} unread={bell.unread} />
					<UserMenu
						name={ctx.name}
						email={ctx.email}
						role={ROLE_LABEL[ctx.role]}
					/>
				</div>
			</header>
			<div className="mx-auto flex w-full max-w-6xl grow gap-8 px-4 py-6 lg:py-8">
				<ContainedScroll
					as="aside"
					className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-52 shrink-0 self-start overflow-y-auto overscroll-contain pb-4 lg:block"
				>
					<SidebarLinks groups={nav} />
				</ContainedScroll>
				<main id="inhalt" className="min-w-0 grow">
					{banner}
					{children}
				</main>
			</div>
			<TabBar send={send} />
			<StepUpDialog />
		</div>
	);
}
