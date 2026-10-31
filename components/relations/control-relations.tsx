import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import { Badge } from "@/components/ui/badge";
import { ListSection } from "@/components/ui/list";
import { CONTROL_EXPLAINERS } from "@/lib/compliance/catalog/control-explainers";
import {
	type ControlRelations,
	controlRelations,
} from "@/lib/compliance/control-relations";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import { shortFrameworkName as baseName } from "@/lib/compliance/framework-names";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import { formatParam } from "@/lib/compliance/params";

// Einfach erklärt (Z3) und „Wer verlangt das – und was genau?“ (Z4) auf der
// Seite einer Maßnahme. Server-Komponente; die Daten rechnet
// controlRelations aus dem Katalog.

export async function ControlExplainerCard({ code }: { code: string }) {
	const ex = CONTROL_EXPLAINERS[code];
	if (!ex) return null;
	const t = await getTranslations("Relations");
	return (
		<Section title={t("simpleTitle")}>
			<div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
				<p className="text-body">{ex.what}</p>
				<p className="text-subhead">
					<span className="font-semibold">{t("why")} </span>
					{ex.why}
				</p>
				<p className="text-muted-foreground text-subhead">{ex.example}</p>
			</div>
		</Section>
	);
}

const STATUS_VARIANT: Record<
	ReqCoverage,
	"success" | "warning" | "muted" | "outline"
> = {
	covered: "success",
	partial: "warning",
	not_applicable: "muted",
	open: "outline",
};

export async function ControlRelationsSection({
	code,
	orgFrameworks,
	statusByRequirement,
	showAll,
	allHref,
	mineHref,
	catalog,
}: {
	code: string;
	// Katalog der Org (R4): eigene Rahmenwerke zählen mit
	catalog?: OrgCatalog;
	// Rahmenwerke der Org; leer = alle zeigen
	orgFrameworks: readonly string[];
	statusByRequirement?: ReadonlyMap<string, ReqCoverage>;
	showAll: boolean;
	allHref: string;
	mineHref: string;
}) {
	const t = await getTranslations("Relations");
	const tes = await getTranslations("EvidenceStudio");
	const shortFrameworkName = (slug: string) => baseName(slug, catalog);
	const all = controlRelations(code, { catalog });
	const scoped =
		showAll || orgFrameworks.length === 0
			? all
			: controlRelations(code, { frameworks: orgFrameworks, catalog });
	const hidden = all.frameworks.length - scoped.frameworks.length;
	const rel: ControlRelations = scoped;
	const names = (slugs: readonly string[]) =>
		slugs.map((s) => shortFrameworkName(s)).join(", ");
	const topicLabel = (topic: string) =>
		tes(`topic_${topic.replace(":", "_")}` as "topic_retention");

	return (
		<Section
			id="wer-verlangt-das"
			title={t("whoTitle")}
			actions={
				orgFrameworks.length > 0 && (hidden > 0 || showAll) ? (
					<Link
						href={showAll ? mineHref : allHref}
						className="text-primary text-subhead hover:underline underline-offset-4"
					>
						{showAll ? t("onlyMine") : t("showAll", { n: hidden })}
					</Link>
				) : undefined
			}
		>
			<p className="text-subhead">
				{rel.frameworks.length === 0
					? t("noneForYou")
					: rel.frameworks.length === 1
						? t("whoOne", { name: names([rel.frameworks[0]?.slug ?? ""]) })
						: t("whoMany", {
								n: rel.frameworks.length,
								names: names(rel.frameworks.map((f) => f.slug)),
							})}
			</p>
			{rel.frameworks.length > 1 && (
				<p className="text-muted-foreground text-subhead">{t("sameCore")}</p>
			)}

			{rel.frameworks.length > 0 && (
				<ListSection>
					{rel.frameworks.map((f) => (
						<li
							key={f.slug}
							className="relative flex flex-col gap-1.5 px-4 py-3 before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<Link
									href={`/rahmenwerke/${f.slug}`}
									className="font-semibold text-body hover:underline underline-offset-4 sm:text-subhead"
								>
									{shortFrameworkName(f.slug)}
								</Link>
								<span className="text-muted-foreground text-footnote">
									{f.full ? t("coversFull") : t("coversPartial")}
								</span>
							</div>
							<ul className="flex flex-col gap-1">
								{f.requirements.map((r) => {
									const status = statusByRequirement?.get(r.key);
									return (
										<li key={r.key} className="flex flex-col gap-0.5">
											<div className="flex flex-wrap items-center gap-2 text-subhead">
												<Link
													href={`/rahmenwerke/${f.slug}/${encodeURIComponent(r.code)}`}
													className="min-w-0 flex-1 hover:underline underline-offset-4"
												>
													<span className="whitespace-nowrap font-mono text-footnote text-muted-foreground">
														{r.code}
													</span>{" "}
													{r.title}
												</Link>
												{r.coverage === "partial" && (
													<span className="text-footnote text-muted-foreground">
														{t("partial")}
													</span>
												)}
												{status && (
													<Badge variant={STATUS_VARIANT[status]}>
														{t(`status_${status}`)}
													</Badge>
												)}
											</div>
											{r.coverage === "partial" && r.note && (
												<p className="text-footnote text-muted-foreground">
													{t("missingHere")} {r.note}
												</p>
											)}
										</li>
									);
								})}
							</ul>
						</li>
					))}
				</ListSection>
			)}

			{rel.topics.some((tp) => tp.perFramework.length > 1) && (
				<div className="mt-3 flex flex-col gap-2">
					<h3 className="font-semibold text-subhead">{t("stricterTitle")}</h3>
					<ListSection
						footer={
							rel.topics.some((tp) => tp.topic.startsWith("deadline:"))
								? t("stricterDeadlineHint")
								: t("stricterIntervalHint")
						}
					>
						{rel.topics
							.filter((tp) => tp.perFramework.length > 1)
							.map((tp) => (
								<li
									key={tp.topic}
									className="relative flex flex-col gap-1.5 px-4 py-3 before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden"
								>
									<p className="font-medium text-subhead">
										{topicLabel(tp.topic)}
									</p>
									<ul className="flex flex-wrap gap-x-4 gap-y-1 text-subhead">
										{tp.perFramework.map((p) => (
											<li key={p.slug}>
												<span className="text-muted-foreground">
													{shortFrameworkName(p.slug)}:
												</span>{" "}
												{formatParam(p.param)}
												{tp.differs && tp.strictest.includes(p.slug) && (
													<span className="font-semibold">
														{" "}
														· {t("strictest")}
													</span>
												)}
											</li>
										))}
									</ul>
								</li>
							))}
					</ListSection>
				</div>
			)}

			{rel.conflicts.map((c) => (
				<div
					key={c.hint}
					role="note"
					className="flex flex-col gap-1 rounded-2xl bg-warning/14 p-4 text-subhead dark:bg-warning/20"
				>
					<p className="font-semibold">
						{t("conflictTitle", { names: names(c.frameworks) })}
					</p>
					<p>{c.hint}</p>
				</div>
			))}
		</Section>
	);
}
