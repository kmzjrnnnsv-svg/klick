import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { BasicPicture } from "@/components/relations/basic-picture";
import { FrameworkLinks } from "@/components/relations/framework-links";
import { ProcessSteps } from "@/components/relations/process-steps";
import {
	RelationMap,
	RelationTable,
} from "@/components/relations/relation-map";
import { ThemeSections } from "@/components/relations/theme-sections";
import { requireOrgPage } from "@/lib/auth/gates";
import { THEMES } from "@/lib/compliance/catalog/themes";
import {
	controlsByFramework,
	themeGroups,
	topPairs,
} from "@/lib/compliance/framework-map";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";

// Zusammenhänge (Teil Z6): das Grundbild, eine Übersicht als Mindmap, die
// Maßnahmen je Thema und die Rahmenwerke untereinander, alles für die
// Rahmenwerke der Org und nur mit anwendbaren Anforderungen. Rechnet aus
// dem Katalog, liest nur Rahmenwerke und Anwendbarkeit der Org.

export default async function RelationsPage({
	searchParams,
}: {
	searchParams: Promise<{ thema?: string }>;
}) {
	const { thema } = await searchParams;
	const ctx = await requireOrgPage();
	const t = await getTranslations("Relations");
	const cov = await getOrgCoverageCached(ctx);
	const opts = {
		frameworks: cov?.frameworks ?? [],
		applicability: new Map(
			[...(cov?.applicabilityDetail ?? [])].map(([k, d]) => [k, d.applicable]),
		),
	};
	const map = controlsByFramework(opts);
	const frameworks = [...map.keys()];
	const groups = themeGroups(opts);
	const open = THEMES.find((x) => x === thema);

	return (
		<>
			<PageHeader title={t("pageTitle")} lead={t("pageLead")} />
			<div className="flex flex-col gap-8">
				<ProcessSteps links />
				<BasicPicture collapsedTitle={t("bikeTitle")} />
				{frameworks.length === 0 ? (
					<EmptyState title={t("emptyTitle")} lead={t("emptyLead")} />
				) : (
					<>
						<section className="flex flex-col gap-3">
							<h2 className="font-semibold text-title-3">{t("mapHeading")}</h2>
							<p className="text-muted-foreground text-subhead">
								{t("mapLead", {
									frameworks: frameworks.length,
									controls: groups.reduce((n, g) => n + g.controls.length, 0),
								})}
							</p>
							<RelationMap
								frameworks={frameworks}
								groups={groups}
								centerLabel={t("centerOrg")}
								frameworkHref={(slug) => `/rahmenwerke/${slug}`}
								themeHref={(theme) =>
									`/zusammenhaenge?thema=${theme}#thema-${theme}`
								}
							/>
							<RelationTable frameworks={frameworks} groups={groups} />
						</section>
						<section className="flex flex-col gap-3">
							<h2 className="font-semibold text-title-3">
								{t("themesHeading")}
							</h2>
							<p className="text-muted-foreground text-subhead">
								{t("themesLead")}
							</p>
							<ThemeSections
								groups={groups}
								open={open}
								controlHref={(code) => `/controls/${code}#wer-verlangt-das`}
							/>
						</section>
						{frameworks.length > 1 && (
							<section className="flex flex-col gap-3">
								<h2 className="font-semibold text-title-3">
									{t("linksHeading")}
								</h2>
								<FrameworkLinks
									frameworks={frameworks}
									pairs={topPairs(map, 6)}
									compareHref={(a, b) =>
										`/synergien?tab=vergleich&a=${a}&b=${b}`
									}
								/>
							</section>
						)}
					</>
				)}
			</div>
		</>
	);
}
