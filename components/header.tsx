import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function Header() {
	const t = await getTranslations("Header");
	const session = await auth();
	const role =
		(session?.user as { role?: "candidate" | "employer" | "admin" } | undefined)
			?.role ?? null;

	const navLinks: { href: string; label: string }[] =
		role === "employer"
			? [{ href: "/jobs", label: t("openJobs") }]
			: role === "admin"
				? [{ href: "/admin", label: t("openAdmin") }]
				: role === "candidate"
					? [
							{ href: "/vault", label: t("openVault") },
							{ href: "/profile", label: t("openProfile") },
						]
					: [];

	return (
		<header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
				<div className="flex items-center gap-4">
					<Link
						href="/"
						className="font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
					>
						{t("productName")}
					</Link>
					{navLinks.length > 0 && (
						<nav className="hidden gap-1 sm:flex">
							{navLinks.map((l) => (
								<Link
									key={l.href}
									href={l.href}
									className="rounded-md px-2 py-1 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
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
					{!session?.user && (
						<Link
							href="/login"
							className={cn(buttonVariants({ size: "sm" }), "ml-1")}
						>
							{t("login")}
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
