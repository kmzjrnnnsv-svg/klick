import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

// Auf jeder Seite: Impressum und Datenschutz (§ 5 DDG, Art. 13 DSGVO).
// Ab 1024 px steht sie im App-Rahmen klein unten in der Seitenleiste
// (`compact`, wie in iPad-/Mac-Apps); die Fußzeile des Root-Layouts
// (`data-legal-root`) blendet globals.css dort aus.
export async function LegalFooter({
	compact = false,
	className,
}: {
	compact?: boolean;
	className?: string;
}) {
	const t = await getTranslations("Legal");
	const links = [
		{ href: "/roadmap", label: t("roadmap") },
		{ href: "/imprint", label: t("imprint") },
		{ href: "/privacy", label: t("privacy") },
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
				</nav>
			</footer>
		);
	return (
		<footer data-legal-root className={cn("border-t", className)}>
			<div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-muted-foreground text-footnote">
				<span translate="no">both.money</span>
				{links.map((l) => (
					<Link
						key={l.href}
						href={l.href}
						className="hit-area hover:underline focus-visible:underline"
					>
						{l.label}
					</Link>
				))}
			</div>
		</footer>
	);
}
