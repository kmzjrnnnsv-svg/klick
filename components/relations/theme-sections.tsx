import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { CONTROL_EXPLAINERS } from "@/lib/compliance/catalog/control-explainers";
import { THEME_INFO } from "@/lib/compliance/catalog/themes";
import type { ThemeGroup } from "@/lib/compliance/framework-map";
import {
	type ExtraFrameworkNames,
	shortFrameworkName,
} from "@/lib/compliance/framework-names";

// Die Maßnahmen je Thema (Teil Z6): unter der Übersicht und am Handy statt
// des Bilds. Jedes Thema klappt auf; Maßnahmen mit den meisten Rahmenwerken
// stehen oben. Mit controlHref verlinkt jede Maßnahme auf ihre Seite.

export async function ThemeSections({
	groups,
	open,
	controlHref,
	names,
}: {
	groups: readonly ThemeGroup[];
	// Namen eigener Rahmenwerke der Org (R4)
	names?: ExtraFrameworkNames;
	// Thema, das offen steht (aus ?thema=)
	open?: string;
	controlHref?: (code: string) => string;
}) {
	const t = await getTranslations("Relations");
	return (
		<div className="flex flex-col gap-3">
			{groups
				.filter((g) => g.controls.length > 0)
				.map((g) => {
					const info = THEME_INFO[g.theme];
					const shared = g.controls.filter((c) => c.frameworks.length > 1);
					return (
						<details
							key={g.theme}
							id={`thema-${g.theme}`}
							open={open === g.theme}
							className="group scroll-mt-24 rounded-2xl bg-card"
						>
							<summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
								<ChevronRight
									aria-hidden="true"
									className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
								/>
								<span className="flex min-w-0 flex-1 flex-col gap-1">
									<span className="flex flex-wrap items-baseline justify-between gap-x-3">
										<span className="font-semibold text-headline">
											{info.title}
										</span>
										<span className="text-footnote text-muted-foreground tabular-nums">
											{t("themeCount", {
												n: g.controls.length,
												shared: shared.length,
											})}
										</span>
									</span>
									<span className="text-muted-foreground text-subhead">
										{info.simple}
									</span>
								</span>
							</summary>
							<ul className="border-border/70 border-t">
								{g.controls.map((c) => {
									const control = CONTROL_BY_CODE.get(c.code);
									const ex = CONTROL_EXPLAINERS[c.code];
									const title = control?.title ?? c.code;
									return (
										<li
											key={c.code}
											className="relative flex flex-col gap-1 px-4 py-3 before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden"
										>
											<span className="flex flex-wrap items-baseline justify-between gap-x-3">
												{controlHref ? (
													<Link
														href={controlHref(c.code)}
														className="min-w-0 font-medium text-subhead hover:underline underline-offset-4"
													>
														{title}
													</Link>
												) : (
													<span className="min-w-0 font-medium text-subhead">
														{title}
													</span>
												)}
												<span className="text-footnote text-muted-foreground tabular-nums">
													{t("frameworksCount", { n: c.frameworks.length })}
												</span>
											</span>
											{ex && <span className="text-subhead">{ex.what}</span>}
											<span className="text-footnote text-muted-foreground">
												{c.frameworks
													.map((s) => shortFrameworkName(s, names))
													.join(", ")}
											</span>
										</li>
									);
								})}
							</ul>
						</details>
					);
				})}
		</div>
	);
}
