import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { HeaderMobileMenu } from "@/components/header-mobile-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

export async function Header() {
	const t = await getTranslations("Header");
	const session = await auth();
	const role =
		(session?.user as { role?: "candidate" | "employer" | "admin" } | undefined)
			?.role ?? null;
	const isLoggedIn = !!session?.user;
	const userEmail = session?.user?.email ?? null;
	const userName = session?.user?.name ?? null;

	const navLinks: { href: string; label: string }[] =
		role === "employer"
			? [{ href: "/jobs", label: t("openJobs") }]
			: role === "admin"
				? [{ href: "/admin", label: t("openAdmin") }]
				: role === "candidate"
					? [
							{ href: "/vault", label: t("openVault") },
							{ href: "/profile", label: t("openProfile") },
							{ href: "/matches", label: t("openMatches") },
							{ href: "/jobs/browse", label: t("openBrowse") },
							{ href: "/requests", label: t("openRequests") },
						]
					: [];

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
					{navLinks.length > 0 && (
						<nav className="hidden gap-5 sm:flex">
							{navLinks.map((l) => (
								<Link
									key={l.href}
									href={l.href}
									className="lv-nav px-1 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
								>
									{l.label}
								</Link>
							))}
						</nav>
					)}
				</div>
				<div className="flex items-center gap-1">
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
						links={navLinks}
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
