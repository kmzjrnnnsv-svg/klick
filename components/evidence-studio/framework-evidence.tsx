import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { CatalogFramework } from "@/lib/compliance/catalog/types";
import type { RequirementProgress } from "@/lib/evidence-studio/progress";

// Reiter „Nachweise“ eines Rahmenwerks: jeder Normpunkt mit dem Stand
// seiner Fragen und Nachweise, Klick führt in den Bogen.
export async function FrameworkEvidence({
	framework,
	progress,
	notApplicable,
}: {
	framework: Pick<CatalogFramework, "slug" | "sections" | "requirements">;
	progress: Map<string, RequirementProgress>;
	notApplicable: Set<string>;
}) {
	const t = await getTranslations("EvidenceStudio");
	const live = framework.requirements.filter(
		(r) => !notApplicable.has(`${framework.slug}:${r.code}`),
	);
	const complete = live.filter(
		(r) => progress.get(`${framework.slug}:${r.code}`)?.state === "complete",
	).length;
	const tone = {
		complete: "success",
		partial: "warning",
		open: "outline",
	} as const;
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<p className="text-muted-foreground text-sm">{t("frameworkLead")}</p>
				<p className="text-sm tabular-nums">
					{t("frameworkProgress", { done: complete, total: live.length })}
				</p>
			</div>
			{framework.sections.map((section) => {
				const reqs = live.filter((r) => r.sectionCode === section.code);
				if (reqs.length === 0) return null;
				return (
					<section key={section.code} className="flex flex-col gap-2">
						<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
							{section.code} · {section.title}
						</h2>
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{reqs.map((r) => {
								const p = progress.get(`${framework.slug}:${r.code}`);
								const state = p?.state ?? "open";
								return (
									<li
										key={r.code}
										className="flex flex-wrap items-center gap-2 px-3 py-2"
									>
										<Badge
											variant="outline"
											className="whitespace-nowrap font-mono normal-case tracking-normal"
										>
											{r.code}
										</Badge>
										<Link
											href={`/rahmenwerke/${framework.slug}/${encodeURIComponent(r.code)}#nachweise`}
											className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
										>
											{r.title}
										</Link>
										{p && (
											<span className="text-muted-foreground text-xs tabular-nums">
												{t("colQuestions")} {p.questions.answered}/
												{p.questions.total} · {t("colItems")} {p.items.done}/
												{p.items.total}
												{p.items.mandatoryOpen > 0 && (
													<span className="ml-1 text-destructive">
														·{" "}
														{t("mandatoryOpen", {
															count: p.items.mandatoryOpen,
														})}
													</span>
												)}
											</span>
										)}
										<Badge variant={tone[state]}>
											{t(
												state === "complete"
													? "statusComplete"
													: state === "partial"
														? "statusPartial"
														: "statusOpen",
											)}
										</Badge>
									</li>
								);
							})}
						</ul>
					</section>
				);
			})}
		</div>
	);
}
