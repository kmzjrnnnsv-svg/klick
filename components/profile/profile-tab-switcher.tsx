import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Tab-Bar oben auf /profile — wechselt zwischen Quell-Sprache-Editor
// (Default: DE) und Übersetzungs-Editor (EN). Server-Component, kein
// Client-State nötig — Tab kommt aus dem URL-Param.
export async function ProfileTabSwitcher({
	currentTab,
	origin,
}: {
	currentTab: "de" | "en";
	origin: "de" | "en";
}) {
	const t = await getTranslations("Profile");
	return (
		<nav
			className="mb-5 inline-flex items-center gap-1 rounded-full border border-border bg-background p-1"
			aria-label={t("editTabsLabel")}
		>
			{(["de", "en"] as const).map((tab) => {
				const active = tab === currentTab;
				const isOrigin = tab === origin;
				return (
					<Link
						key={tab}
						href={`/profile?tab=${tab}`}
						scroll={false}
						className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						<span>{tab === "de" ? t("tabDe") : t("tabEn")}</span>
						{isOrigin && (
							<span
								className={`rounded-sm border px-1 py-px text-[9px] ${
									active
										? "border-primary-foreground/40 text-primary-foreground/80"
										: "border-border text-muted-foreground"
								}`}
							>
								{t("tabSourceMark")}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
