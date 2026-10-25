import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionDivider } from "@/components/marketing/landing-decor";
import { buttonVariants } from "@/components/ui/button";
import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	frameworksWithIndex,
	REQUIREMENT_BY_KEY,
	splitRequirementKey,
} from "@/lib/compliance/catalog";
import {
	CATALOG_CONTROL_REFS,
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
} from "@/lib/compliance/catalog-view";
import { computeSynergy } from "@/lib/compliance/synergy";
import { cn } from "@/lib/utils";

const STEPS = ["how1", "how2", "how3"] as const;
const PILLARS = ["pillar1", "pillar2", "pillar3"] as const;

// Beispiel für „Ohne Klick / Mit Klick“: Schulungen versteht jede:r. Welche
// Rahmenwerke das Control erfüllt, kommt aus den Katalog-Kanten, nicht aus dem Text.
const EXAMPLE_CONTROL = "CC-HR-03";

// „DORA — Digital Operational …“ → „DORA“, „GwG (Geldwäschegesetz)“ → „GwG“.
function shortName(name: string): string {
	return name.split(/ — | \(/)[0].trim();
}

const FRAMEWORKS = frameworksWithIndex();

// Alle Rahmenwerke, ohne Profil: wie viele Anforderungen auf wie viele Controls
// zusammenfallen. Statisch, keine Datenbank.
const SYNERGY = computeSynergy(
	FRAMEWORKS.map((f) => f.slug),
	{
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		controls: CATALOG_CONTROL_REFS,
	},
);

const EXAMPLE = {
	title: CONTROL_BY_CODE.get(EXAMPLE_CONTROL)?.title ?? "",
	frameworks: [
		...new Set(
			(EDGES_BY_CONTROL.get(EXAMPLE_CONTROL) ?? [])
				.filter(
					(e) =>
						REQUIREMENT_BY_KEY.get(e.requirement)?.legalStatus !== "repealed",
				)
				.map((e) => splitRequirementKey(e.requirement).framework),
		),
	]
		.flatMap((slug) => FRAMEWORK_BY_SLUG.get(slug) ?? [])
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((f) => shortName(f.name)),
};

export default async function LandingPage() {
	const t = await getTranslations("Landing");
	const count = EXAMPLE.frameworks.length;
	return (
		<main id="inhalt" className="relative flex-1 overflow-hidden">
			<section className="mx-auto max-w-5xl px-4 pt-20 pb-12 sm:px-6 sm:pt-28">
				<h1 className="max-w-3xl text-balance font-bold text-5xl leading-[1.04] tracking-tight sm:text-7xl">
					{t("title")}
				</h1>
				<p className="mt-6 max-w-2xl text-title-3 text-muted-foreground leading-relaxed">
					{t("lead")}
				</p>
				<div className="mt-10 flex flex-wrap gap-3">
					<Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
						{t("ctaLogin")}
					</Link>
					<a
						href="#so-gehts"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
					>
						{t("ctaHow")}
					</a>
				</div>
			</section>

			<section className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
				<h2 className="font-bold text-title-2 sm:text-title-1">
					{t("exampleTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">
					{t("exampleLead", { count })}
				</p>

				<div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
					<article className="flex flex-col rounded-2xl bg-card/60 p-6">
						<p className="font-medium text-footnote text-muted-foreground">
							{t("withoutTitle")}
						</p>
						<ul className="mt-4 flex flex-col gap-2">
							{EXAMPLE.frameworks.map((fw) => (
								<li
									key={fw}
									className="flex items-baseline justify-between gap-3 border-border/60 border-b pb-2 text-subhead"
								>
									<span className="font-medium">{fw}</span>
									<span className="text-right text-muted-foreground text-footnote">
										{t("withoutRow")}
									</span>
								</li>
							))}
						</ul>
						<div className="flex-1" />
						<p className="mt-6 text-muted-foreground text-subhead">
							{t("withoutFooter", { count })}
						</p>
					</article>

					<article className="flex flex-col rounded-2xl bg-primary/8 p-6 ring-1 ring-primary/40">
						<p className="font-medium text-footnote text-muted-foreground">
							{t("withTitle")}
						</p>
						<p className="mt-4 text-muted-foreground text-footnote">
							{t("withLabel")}
						</p>
						<h3 className="mt-1 font-bold text-title-2 leading-tight">
							{EXAMPLE.title}
						</h3>
						<ul className="mt-5 flex flex-wrap gap-2">
							{EXAMPLE.frameworks.map((fw) => (
								<li
									key={fw}
									className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-subhead ring-1 ring-primary/30"
								>
									<CheckIcon
										aria-hidden="true"
										className="size-3.5 text-primary"
									/>
									{fw}
								</li>
							))}
						</ul>
						<div className="flex-1" />
						<p className="mt-6 font-medium text-subhead">
							{t("withFooter", { count })}
						</p>
					</article>
				</div>

				<div className="mt-16 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
					<div>
						<p className="font-semibold text-5xl text-muted-foreground sm:text-6xl">
							{SYNERGY.requirementCount}
						</p>
						<p className="mt-1 text-muted-foreground text-subhead">
							{t("numbersRequirements", { frameworks: FRAMEWORKS.length })}
						</p>
					</div>
					<div>
						<p className="font-semibold text-5xl text-primary sm:text-6xl">
							{SYNERGY.controlCount}
						</p>
						<p className="mt-1 text-subhead">{t("numbersControls")}</p>
					</div>
				</div>
				<p className="mt-6 max-w-2xl text-muted-foreground text-subhead">
					{t("numbersShared", { shared: SYNERGY.multiFrameworkControls })}
				</p>
			</section>

			<SectionDivider />

			<section
				id="so-gehts"
				className="mx-auto max-w-5xl scroll-mt-20 px-4 sm:px-6"
			>
				<h2 className="font-bold text-title-2 sm:text-title-1">
					{t("howTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">{t("howLead")}</p>
				<ol className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
					{STEPS.map((s, i) => (
						<li key={s} className="flex flex-col gap-3">
							<p className="font-bold text-title-1 text-primary">{i + 1}</p>
							<h3 className="font-semibold text-title-3 leading-tight">
								{t(`${s}Title`)}
							</h3>
							<p className="text-muted-foreground text-subhead leading-relaxed">
								{t(`${s}Body`)}
							</p>
						</li>
					))}
				</ol>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-4xl px-4 text-center sm:px-6">
				<p className="font-bold text-title-1 leading-snug sm:text-4xl">
					„{t("sentence")}“
				</p>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<h2 className="font-bold text-title-2 sm:text-title-1">
					{t("pillarsTitle")}
				</h2>
				<div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
					{PILLARS.map((p) => (
						<article key={p} className="flex flex-col gap-3">
							<CheckIcon aria-hidden="true" className="size-5 text-primary" />
							<h3 className="font-semibold text-title-3 leading-tight">
								{t(`${p}Title`)}
							</h3>
							<p className="text-muted-foreground text-subhead leading-relaxed">
								{t(`${p}Body`)}
							</p>
						</article>
					))}
				</div>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<h2 className="font-bold text-title-2 sm:text-title-1">
					{t("frameworksTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">
					{t("frameworksLead", {
						frameworks: FRAMEWORKS.length,
						requirements: SYNERGY.requirementCount,
					})}
				</p>
				<ul className="mt-8 flex flex-wrap gap-2">
					{FRAMEWORKS.map((f) => (
						<li
							key={f.slug}
							className="rounded-full border border-border/70 px-3 py-1 text-subhead"
						>
							{f.name}
						</li>
					))}
				</ul>
			</section>

			<section className="mx-auto max-w-5xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28">
				<div className="rounded-2xl bg-card/60 px-6 py-12 text-center sm:px-12">
					<h2 className="font-bold text-title-1 sm:text-4xl">
						{t("ctaTitle")}
					</h2>
					<p className="mx-auto mt-4 max-w-xl text-muted-foreground leading-relaxed">
						{t("ctaLead")}
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-3">
						<Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
							{t("ctaLogin")}
						</Link>
						<Link
							href="/preise"
							className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
						>
							{t("ctaPricing")}
						</Link>
						<Link
							href="/vertrauen"
							className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
						>
							{t("ctaTrust")}
						</Link>
					</div>
				</div>
				<p className="mt-10 text-muted-foreground text-footnote">
					{t("footnote")}
				</p>
			</section>
		</main>
	);
}
