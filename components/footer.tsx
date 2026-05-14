import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations("Footer");
	return (
		<footer className="mt-auto border-t border-border/60">
			<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6">
				<p className="lv-eyebrow text-[0.62rem] text-muted-foreground">
					{t("tagline")}
				</p>
				<nav className="flex gap-6">
					<a
						className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
						href="/arbeitgeber"
					>
						{t("employers")}
					</a>
					<a
						className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
						href="/datenschutz"
					>
						{t("privacy")}
					</a>
					<a
						className="lv-eyebrow text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
						href="/impressum"
					>
						{t("imprint")}
					</a>
				</nav>
			</div>
		</footer>
	);
}
