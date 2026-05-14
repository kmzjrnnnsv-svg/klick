import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Tab-Bar oben auf /profile — wechselt zwischen DE/EN Editoren. Beide
// Tabs sind gleichwertig: jeder editiert das Profil in seiner Sprache.
// origin ist nur intern — der User soll nicht zwischen "Quelle" und
// "Übersetzung" unterscheiden müssen.
export async function ProfileTabSwitcher({
	currentTab,
}: {
	currentTab: "de" | "en";
	origin?: "de" | "en";
}) {
	const t = await getTranslations("Profile");
	return (
		<nav
			className="mb-5 inline-flex items-center gap-1 rounded-full border border-border bg-background p-1"
			aria-label={t("editTabsLabel")}
		>
			{(["de", "en"] as const).map((tab) => {
				const active = tab === currentTab;
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
					</Link>
				);
			})}
		</nav>
	);
}
