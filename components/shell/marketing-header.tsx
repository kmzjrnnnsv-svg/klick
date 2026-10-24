import { Menu } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function MarketingHeader({
	showLogin = true,
}: {
	showLogin?: boolean;
}) {
	const t = await getTranslations("Common");
	const tf = await getTranslations("Footer");
	const links = [
		{ href: "/funktionen", label: tf("features") },
		{ href: "/leistungen", label: tf("services") },
		{ href: "/preise", label: tf("pricing") },
		{ href: "/vertrauen", label: tf("trust") },
	];
	return (
		<header className="sticky top-0 z-30 w-full bg-background/90 backdrop-blur">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
				<Link
					href="/"
					className="lv-wordmark text-[0.95rem] text-foreground hover:opacity-70"
				>
					{t("productName")}
				</Link>
				<nav className="hidden items-center gap-6 sm:flex">
					{links.map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="lv-eyebrow text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							{l.label}
						</Link>
					))}
				</nav>
				<div className="flex items-center gap-1">
					{/* Telefon: Menü ohne Skript; volle Navigation (a statt Link), damit es sich schließt */}
					<details className="group relative sm:hidden">
						<summary
							aria-label={tf("menu")}
							className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
						>
							<Menu className="size-5" aria-hidden="true" />
						</summary>
						<nav className="absolute right-0 z-40 mt-2 flex w-56 flex-col rounded-md border bg-background p-2 shadow-lg">
							{links.map((l) => (
								<a
									key={l.href}
									href={l.href}
									className="rounded-sm px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{l.label}
								</a>
							))}
						</nav>
					</details>
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
