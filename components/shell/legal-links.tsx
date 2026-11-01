import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Rechtliche Links unten in jedem Layout ohne Marketing-Fußzeile (App,
// Einrichtung, Wallet, Admin, externe Seiten, 404): Impressum und
// Datenschutz müssen von jeder Seite aus erreichbar sein (§ 5 DDG,
// Art. 13 DSGVO). Test `legal` prüft die Layouts.
export async function LegalLinks({
	children,
	compact = false,
	className,
}: {
	children?: ReactNode;
	// klein unten in der Seitenleiste (ab 1024 px, wie in iPad-/Mac-Apps)
	compact?: boolean;
	className?: string;
}) {
	const t = await getTranslations("Footer");
	const links = [
		{ href: "/impressum", label: t("imprint") },
		{ href: "/datenschutz-erklaerung", label: t("privacy") },
		{ href: "/nutzungsbedingungen", label: t("terms") },
		{ href: "/lizenzen", label: t("licenses") },
	];
	if (compact)
		return (
			<footer className={cn("border-border/60 border-t", className)}>
				<nav
					aria-label={t("legalNav")}
					className="flex flex-wrap gap-x-3 px-5 py-2 text-caption text-muted-foreground"
				>
					{links.map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="hit-area inline-flex min-h-7 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{l.label}
						</Link>
					))}
					{children}
				</nav>
			</footer>
		);
	return (
		<footer className={cn("mt-auto border-border/60 border-t", className)}>
			<nav
				aria-label={t("legalNav")}
				className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 px-4 py-2 text-footnote text-muted-foreground sm:px-6"
			>
				{links.map((l) => (
					<Link
						key={l.href}
						href={l.href}
						className="inline-flex min-h-8 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
					>
						{l.label}
					</Link>
				))}
				{children}
			</nav>
		</footer>
	);
}
