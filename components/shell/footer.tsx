import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations("Footer");
	const links = [
		{ href: "/preise", label: t("pricing") },
		{ href: "/vertrauen", label: t("trust") },
		{ href: "/datenschutz-erklaerung", label: t("privacy") },
		{ href: "/impressum", label: t("imprint") },
	];
	return (
		<footer className="mt-auto border-border/60 border-t">
			<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6">
				<p className="lv-eyebrow text-[0.62rem] text-muted-foreground">
					{t("tagline")}
				</p>
				<nav className="flex gap-6">
					{links.map((l) => (
						<Link
							key={l.href}
							href={l.href}
							className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
						>
							{l.label}
						</Link>
					))}
				</nav>
			</div>
		</footer>
	);
}
