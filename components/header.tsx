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

	const dashboardHref =
		role === "employer" ? "/jobs" : role === "admin" ? "/admin" : "/vault";

	const dashboardLabel =
		role === "employer"
			? t("openJobs")
			: role === "admin"
				? t("openAdmin")
				: t("openVault");

	return (
		<header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
				<Link
					href="/"
					className="font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
				>
					{t("productName")}
				</Link>
				<div className="flex items-center gap-1">
					<LocaleSwitcher />
					<ThemeSwitcher />
					{session?.user ? (
						<Link
							href={dashboardHref}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"ml-1",
							)}
						>
							{dashboardLabel}
						</Link>
					) : (
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
