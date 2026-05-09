import { Bell } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { unreadCount } from "@/app/actions/notifications";
import { auth } from "@/auth";
import { HeaderMobileMenu } from "@/components/header-mobile-menu";
import { HeaderNavDropdown } from "@/components/header-nav-dropdown";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; links: NavLink[] };
type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
	return "links" in item;
}

export async function Header() {
	const t = await getTranslations("Header");
	const session = await auth();
	const role =
		(session?.user as { role?: "candidate" | "employer" | "admin" } | undefined)
			?.role ?? null;
	const isLoggedIn = !!session?.user;
	const userEmail = session?.user?.email ?? null;
	const userName = session?.user?.name ?? null;

	const navItems: NavItem[] =
		role === "employer"
			? [
					{ href: "/jobs", label: t("openJobs") },
					{
						label: t("groupActivity"),
						links: [
							{ href: "/offers", label: t("openOffers") },
							{ href: "/agency/team", label: t("openTeam") },
						],
					},
				]
			: role === "admin"
				? [{ href: "/admin", label: t("openAdmin") }]
				: role === "candidate"
					? [
							{ href: "/jobs/browse", label: t("openBrowse") },
							{ href: "/profile", label: t("openProfile") },
							{
								label: t("groupSearch"),
								links: [
									{ href: "/matches", label: t("openMatches") },
									{ href: "/searches", label: t("openSearches") },
									{ href: "/vault", label: t("openVault") },
								],
							},
							{
								label: t("groupActivity"),
								links: [
									{ href: "/applications", label: t("openApplications") },
									{ href: "/offers", label: t("openOffers") },
									{ href: "/requests", label: t("openRequests") },
								],
							},
						]
					: [];

	// Mobile keeps the flat list — dropdowns expand inline.
	const mobileLinks: NavLink[] = navItems.flatMap((it) =>
		isGroup(it) ? it.links : [it],
	);

	let unread = 0;
	if (isLoggedIn) {
		try {
			unread = await unreadCount();
		} catch {
			unread = 0;
		}
	}

	return (
		<header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-3 sm:px-6">
				<div className="flex items-center gap-4">
					<Link
						href="/"
						className="lv-wordmark text-[0.95rem] text-foreground transition-opacity hover:opacity-70"
					>
						{t("productName")}
					</Link>
					{navItems.length > 0 && (
						<nav className="hidden items-center gap-5 sm:flex">
							{navItems.map((it) =>
								isGroup(it) ? (
									<HeaderNavDropdown
										key={it.label}
										label={it.label}
										links={it.links}
									/>
								) : (
									<Link
										key={it.href}
										href={it.href}
										className="lv-nav px-1 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
									>
										{it.label}
									</Link>
								),
							)}
						</nav>
					)}
				</div>
				<div className="flex items-center gap-1">
					{isLoggedIn && (
						<Link
							href="/notifications"
							aria-label={t("notifications")}
							className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
						>
							<Bell className="h-4 w-4" strokeWidth={1.5} />
							{unread > 0 && (
								<span className="-top-0.5 -right-0.5 absolute flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 font-medium text-[0.55rem] text-primary-foreground">
									{unread > 9 ? "9+" : unread}
								</span>
							)}
						</Link>
					)}
					<LocaleSwitcher />
					<ThemeSwitcher />
					{isLoggedIn && userEmail && role && (
						<UserMenu email={userEmail} name={userName} role={role} />
					)}
					{!isLoggedIn && (
						<Link
							href="/login"
							className={cn(
								buttonVariants({ size: "sm" }),
								"ml-1 hidden sm:inline-flex",
							)}
						>
							{t("login")}
						</Link>
					)}
					<HeaderMobileMenu
						links={mobileLinks}
						loginLabel={t("login")}
						isLoggedIn={isLoggedIn}
						openLabel={t("openMenu")}
						closeLabel={t("closeMenu")}
					/>
				</div>
			</div>
		</header>
	);
}
