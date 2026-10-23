import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignButton } from "@/components/signatures/sign-button";
import { Badge } from "@/components/ui/badge";
import type { CatalogFramework } from "@/lib/compliance/catalog/types";
import { fmtDate } from "@/lib/compliance/page-data";
import { functionLabel } from "@/lib/evidence-studio/generate/doc";
import type { KindOverviewRow } from "@/lib/evidence-studio/generate/service";
import type { RequirementProgress } from "@/lib/evidence-studio/progress";
import { GenerateAllButton } from "./generate-all-button";
import { GenerateButton } from "./generate-button";

// Reiter „Nachweise“ eines Rahmenwerks: jeder Normpunkt mit dem Stand
// seiner Fragen und Nachweise, Klick führt in den Bogen.
export async function FrameworkEvidence({
	framework,
	progress,
	notApplicable,
	kinds = [],
	canCreate = false,
}: {
	framework: Pick<CatalogFramework, "slug" | "sections" | "requirements">;
	progress: Map<string, RequirementProgress>;
	notApplicable: Set<string>;
	// Nachweisarten dieses Rahmenwerks mit Stand (kindOverview)
	kinds?: KindOverviewRow[];
	canCreate?: boolean;
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
	const due = kinds.filter(
		(k) =>
			k.generatable &&
			(k.state === "missing" || k.state === "stale" || k.state === "expired"),
	).length;
	const ts = await getTranslations("Signatures");
	// Sammelunterschrift: alles, was in derselben Funktion auf mich wartet
	const toSign = kinds.filter((k) => k.signAs && k.latest);
	const fnCounts = new Map<string, number>();
	for (const k of toSign)
		if (k.signAs) fnCounts.set(k.signAs, (fnCounts.get(k.signAs) ?? 0) + 1);
	const batchFn = [...fnCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
	const batchIds = toSign
		.filter((k) => k.signAs === batchFn)
		.flatMap((k) => (k.latest ? [k.latest.id] : []));
	const stateTone = {
		current: "success",
		stale: "warning",
		expired: "destructive",
		missing: "outline",
		manual: "outline",
		per_entity: "outline",
		no_data: "outline",
	} as const;
	return (
		<div className="flex flex-col gap-6">
			{kinds.length > 0 && (
				<section className="flex flex-col gap-3" aria-labelledby="ev-kinds">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="flex max-w-2xl flex-col gap-1">
							<h2 id="ev-kinds" className="font-medium text-sm">
								{t("kindsTitle")}
							</h2>
							<p className="text-muted-foreground text-sm">{t("kindsLead")}</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{batchFn && batchIds.length > 1 && (
								<SignButton
									evidenceIds={batchIds}
									fn={batchFn}
									size="default"
									label={ts("signAll", { count: batchIds.length })}
								/>
							)}
							{canCreate && (
								<GenerateAllButton framework={framework.slug} due={due} />
							)}
						</div>
					</div>
					<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
						{kinds.map((k) => (
							<li
								key={k.code}
								className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
							>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="font-medium">
										{k.title}
										{k.mandatory && (
											<Badge
												variant="outline"
												className="ml-2 align-middle normal-case tracking-normal"
											>
												{t("mandatory")}
											</Badge>
										)}
									</span>
									<span className="text-muted-foreground text-xs">
										{k.latest ? (
											<a
												href={`/api/nachweise/${k.latest.id}`}
												className="text-primary hover:underline"
											>
												{t("kindProduced", {
													date: fmtDate.format(new Date(k.latest.createdAt)),
												})}
											</a>
										) : (
											k.purpose
										)}
									</span>
									{k.signatures.length > 0 && (
										<span className="text-muted-foreground text-xs">
											{ts("signedBy", {
												names: k.signatures
													.map(
														(x) =>
															`${x.name}${x.function ? ` (${functionLabel(x.function)})` : ""}`,
													)
													.join(", "),
											})}
											{k.latest && (
												<>
													{" · "}
													<Link
														href={`/nachweise/${k.latest.id}/unterschriften`}
														className="text-primary hover:underline"
													>
														{ts("check")}
													</Link>
												</>
											)}
										</span>
									)}
									{k.latest && k.openSigners > 0 && (
										<span className="text-warning text-xs">
											{ts("open", { count: k.openSigners })}
										</span>
									)}
								</div>
								<Badge
									variant={stateTone[k.state]}
									className="normal-case tracking-normal"
								>
									{t(`kindState_${k.state}`)}
								</Badge>
								<Link
									href={k.editHref}
									className="text-primary text-xs hover:underline"
								>
									{k.editLabel} →
								</Link>
								{k.signAs && k.latest && (
									<SignButton
										evidenceIds={[k.latest.id]}
										fn={k.signAs}
										label={ts("sign")}
									/>
								)}
								{canCreate && k.generatable && k.state !== "no_data" && (
									<GenerateButton
										kindCode={k.code}
										label={k.latest ? t("regenerate") : t("generate")}
									/>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
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
