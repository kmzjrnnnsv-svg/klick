import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BasicPicture } from "@/components/relations/basic-picture";
import { FrameworkLinks } from "@/components/relations/framework-links";
import { FrameworkProfileList } from "@/components/relations/framework-profile";
import { ProcessSteps } from "@/components/relations/process-steps";
import {
	RelationMap,
	RelationTable,
} from "@/components/relations/relation-map";
import { ThemeSections } from "@/components/relations/theme-sections";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import { THEMES } from "@/lib/compliance/catalog/themes";
import {
	controlsByFramework,
	themeGroups,
	topPairs,
} from "@/lib/compliance/framework-map";
import { shortFrameworkName } from "@/lib/compliance/framework-names";

// Öffentliche Fassung der Zusammenhänge (Teil Z6): alle Rahmenwerke aus dem
// Katalog, ohne Daten einer Org. Für Außenstehende, verlinkt von /funktionen.

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Relations");
	return { title: t("publicTitle"), description: t("publicLead") };
}

export default async function SimplePage({
	searchParams,
}: {
	searchParams: Promise<{ thema?: string; rahmenwerk?: string }>;
}) {
	const { thema, rahmenwerk } = await searchParams;
	const t = await getTranslations("Relations");
	const frameworks = [...CATALOG_FRAMEWORKS]
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((f) => ({ slug: f.slug, name: shortFrameworkName(f.slug) }));
	const slugs = frameworks.map((f) => f.slug);
	const map = controlsByFramework();
	const groups = themeGroups();
	const total = groups.reduce((n, g) => n + g.controls.length, 0);
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 pt-10 pb-20 sm:px-6 sm:pt-16"
		>
			<header className="flex flex-col gap-4">
				<h1 className="font-bold text-title-1 sm:text-large-title">
					{t("publicTitle")}
				</h1>
				<p className="max-w-[60ch] text-body">{t("publicLead")}</p>
			</header>

			<ProcessSteps />

			<BasicPicture />

			<section className="flex flex-col gap-3" aria-labelledby="ee-map">
				<h2 id="ee-map" className="font-semibold text-title-2">
					{t("mapHeading")}
				</h2>
				<p className="max-w-[60ch] text-muted-foreground text-subhead">
					{t("mapLead", { frameworks: slugs.length, controls: total })}
				</p>
				<RelationMap
					frameworks={slugs}
					groups={groups}
					centerLabel={t("centerOrg")}
					frameworkHref={(slug) =>
						`/einfach-erklaert?rahmenwerk=${slug}#rw-${slug}`
					}
					themeHref={(theme) =>
						`/einfach-erklaert?thema=${theme}#thema-${theme}`
					}
				/>
				<RelationTable frameworks={slugs} groups={groups} />
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="ee-fw">
				<h2 id="ee-fw" className="font-semibold text-title-2">
					{t("profilesHeading")}
				</h2>
				<p className="max-w-[60ch] text-muted-foreground text-subhead">
					{t("profilesLead")}
				</p>
				<FrameworkProfileList
					frameworks={frameworks}
					open={slugs.find((s) => s === rahmenwerk)}
				/>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="ee-themes">
				<h2 id="ee-themes" className="font-semibold text-title-2">
					{t("themesHeading")}
				</h2>
				<p className="max-w-[60ch] text-muted-foreground text-subhead">
					{t("themesLead")}
				</p>
				<ThemeSections groups={groups} open={THEMES.find((x) => x === thema)} />
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="ee-links">
				<h2 id="ee-links" className="font-semibold text-title-2">
					{t("linksHeading")}
				</h2>
				<FrameworkLinks frameworks={slugs} pairs={topPairs(map, 8)} />
			</section>

			<footer className="flex flex-col gap-2 text-muted-foreground text-subhead">
				<p>{t("publicNote")}</p>
				<p>
					<Link
						href="/funktionen#fuer-wen"
						className="text-primary hover:underline underline-offset-4"
					>
						{t("publicForYou")}
					</Link>
				</p>
			</footer>
		</main>
	);
}
