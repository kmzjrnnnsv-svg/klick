import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations("Footer");
	return (
		<footer className="mt-auto border-t border-border/60">
			<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
				<p>{t("tagline")}</p>
				<nav className="flex gap-4">
					<a
						className="hover:text-foreground transition-opacity"
						href="/datenschutz"
					>
						{t("privacy")}
					</a>
					<a
						className="hover:text-foreground transition-opacity"
						href="/impressum"
					>
						{t("imprint")}
					</a>
				</nav>
			</div>
		</footer>
	);
}
