import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function MarketingHeader({
	showLogin = true,
}: {
	showLogin?: boolean;
}) {
	const t = await getTranslations("Common");
	const tf = await getTranslations("Footer");
	return (
		<header className="sticky top-0 z-30 w-full border-border/60 border-b bg-background/85 backdrop-blur">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
				<Link
					href="/"
					className="lv-wordmark text-[0.95rem] text-foreground hover:opacity-70"
				>
					{t("productName")}
				</Link>
				<nav className="hidden items-center gap-6 sm:flex">
					<Link
						href="/preise"
						className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
					>
						{tf("pricing")}
					</Link>
					<Link
						href="/vertrauen"
						className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
					>
						{tf("trust")}
					</Link>
				</nav>
				<div className="flex items-center gap-1">
					<ThemeSwitcher />
					{showLogin && (
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
