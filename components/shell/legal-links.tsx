import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

// Rechtliche Links unten in jedem Layout ohne Marketing-Fußzeile (App,
// Einrichtung, Wallet, Admin, externe Seiten, 404): Impressum und
// Datenschutz müssen von jeder Seite aus erreichbar sein (§ 5 DDG,
// Art. 13 DSGVO). Test `legal` prüft die Layouts.
export async function LegalLinks({ children }: { children?: ReactNode }) {
	const t = await getTranslations("Footer");
	const links = [
		{ href: "/impressum", label: t("imprint") },
		{ href: "/datenschutz-erklaerung", label: t("privacy") },
		{ href: "/nutzungsbedingungen", label: t("terms") },
		{ href: "/lizenzen", label: t("licenses") },
	];
	return (
		<footer className="mt-auto border-border/60 border-t">
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
