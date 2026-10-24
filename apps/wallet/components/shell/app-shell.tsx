import type { OrgContext } from "@wallet/lib/auth/guards";
import { ROLE_LABEL, roleAllows } from "@wallet/lib/auth/permissions";
import type { Membership } from "@wallet/lib/orgs/memberships";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";
import { StepUpDialog } from "../auth/step-up-dialog";
import { Bell, type BellItem } from "./bell";
import { type NavItem, NavLinks } from "./nav-links";
import { OrgMenu } from "./org-menu";
import { UnlockStatus } from "./unlock-status";
import { UserMenu } from "./user-menu";

// Rahmen von both.money: Kopf mit Org, Entsperr-Status, Glocke und Konto;
// Navigation links (ab md), darunter als Leiste; Step-up-Dialog gemountet.
export async function AppShell({
	ctx,
	orgs,
	bell,
	children,
}: {
	ctx: OrgContext;
	orgs: Membership[];
	bell: { items: BellItem[]; unread: number };
	children: React.ReactNode;
}) {
	const t = await getTranslations("Shell");
	const nav: NavItem[] = [
		{ href: "/", label: t("overview") },
		...(roleAllows(ctx.role, "members:read")
			? [{ href: "/members", label: t("members") }]
			: []),
		...(roleAllows(ctx.role, "audit:read")
			? [{ href: "/audit", label: t("audit") }]
			: []),
	];
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
			<header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3">
					<Link
						href="/"
						className="shrink-0 font-serif-display text-lg text-primary sm:text-xl focus-visible:outline-2 focus-visible:outline-primary"
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
			<div className="mx-auto flex w-full max-w-6xl grow flex-col gap-6 px-4 py-6 md:flex-row">
				<aside className="md:w-48 md:shrink-0">
					<NavLinks items={nav} label={t("nav")} />
				</aside>
				<main id="inhalt" className="min-w-0 grow">
					{children}
				</main>
			</div>
			<StepUpDialog />
		</div>
	);
}
