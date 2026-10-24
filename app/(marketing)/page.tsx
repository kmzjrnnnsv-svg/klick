import { ArrowDownIcon, ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	MonogramPattern,
	SectionDivider,
} from "@/components/marketing/landing-decor";
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
			<MonogramPattern className="-z-10 pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.04]" />

			<section className="mx-auto max-w-5xl px-4 pt-20 pb-12 sm:px-6 sm:pt-28">
				<h1 className="max-w-3xl font-serif-display text-5xl text-primary leading-[1.02] sm:text-7xl">
					{t("title")}
				</h1>
				<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
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
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("exampleTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">
					{t("exampleLead", { count })}
				</p>

				<div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
					<article className="flex flex-col rounded-lg border border-border/60 bg-background/60 p-6">
						<p className="lv-eyebrow text-[0.7rem] text-muted-foreground">
							{t("withoutTitle")}
						</p>
						<ul className="mt-4 flex flex-col gap-2">
							{EXAMPLE.frameworks.map((fw) => (
								<li
									key={fw}
									className="flex items-baseline justify-between gap-3 border-border/60 border-b border-dashed pb-2 text-sm"
								>
									<span className="font-medium">{fw}</span>
									<span className="text-right text-muted-foreground text-xs">
										{t("withoutRow")}
									</span>
								</li>
							))}
						</ul>
						<div className="flex-1" />
						<p className="mt-6 text-muted-foreground text-sm">
							{t("withoutFooter", { count })}
						</p>
					</article>

					<div
						aria-hidden="true"
						className="flex items-center justify-center text-brown"
					>
						<ArrowRightIcon className="hidden size-6 md:block" />
						<ArrowDownIcon className="size-6 md:hidden" />
					</div>

					<article className="flex flex-col rounded-lg border border-brown bg-brown/5 p-6">
						<p className="lv-eyebrow text-[0.7rem] text-brown">
							{t("withTitle")}
						</p>
						<p className="mt-4 text-muted-foreground text-xs">
							{t("withLabel")}
						</p>
						<h3 className="mt-1 font-serif-display text-2xl text-primary leading-tight">
							{EXAMPLE.title}
						</h3>
						<ul className="mt-5 flex flex-wrap gap-2">
							{EXAMPLE.frameworks.map((fw) => (
								<li
									key={fw}
									className="inline-flex items-center gap-1.5 rounded-full border border-brown/40 bg-background px-3 py-1 text-sm"
								>
									<CheckIcon
										aria-hidden="true"
										className="size-3.5 text-brown"
									/>
									{fw}
								</li>
							))}
						</ul>
						<div className="flex-1" />
						<p className="mt-6 font-medium text-sm">
							{t("withFooter", { count })}
						</p>
					</article>
				</div>

				<div className="mt-16 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
					<div>
						<p className="font-serif-display text-5xl text-muted-foreground sm:text-6xl">
							{SYNERGY.requirementCount}
						</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{t("numbersRequirements", { frameworks: FRAMEWORKS.length })}
						</p>
					</div>
					<ArrowRightIcon
						aria-hidden="true"
						className="hidden size-6 text-brown sm:block"
					/>
					<div>
						<p className="font-serif-display text-5xl text-primary sm:text-6xl">
							{SYNERGY.controlCount}
						</p>
						<p className="mt-1 text-sm">{t("numbersControls")}</p>
					</div>
				</div>
				<p className="mt-6 max-w-2xl text-muted-foreground text-sm">
					{t("numbersShared", { shared: SYNERGY.multiFrameworkControls })}
				</p>
			</section>

			<SectionDivider />

			<section
				id="so-gehts"
				className="mx-auto max-w-5xl scroll-mt-20 px-4 sm:px-6"
			>
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("howTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">{t("howLead")}</p>
				<ol className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
					{STEPS.map((s, i) => (
						<li key={s} className="flex flex-col gap-3">
							<p className="font-serif-display text-3xl text-brown">{i + 1}</p>
							<h3 className="font-serif-display text-xl leading-tight">
								{t(`${s}Title`)}
							</h3>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{t(`${s}Body`)}
							</p>
						</li>
					))}
				</ol>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-4xl px-4 text-center sm:px-6">
				<p className="lv-eyebrow text-[0.7rem] text-brown">
					{t("sentenceEyebrow")}
				</p>
				<p className="mt-6 font-serif-display text-3xl text-primary leading-snug sm:text-4xl">
					„{t("sentence")}“
				</p>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("pillarsTitle")}
				</h2>
				<div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
					{PILLARS.map((p) => (
						<article key={p} className="flex flex-col gap-3">
							<CheckIcon aria-hidden="true" className="size-5 text-brown" />
							<h3 className="font-serif-display text-xl leading-tight">
								{t(`${p}Title`)}
							</h3>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{t(`${p}Body`)}
							</p>
						</article>
					))}
				</div>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
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
							className="rounded-full border border-border/70 px-3 py-1 text-sm"
						>
							{f.name}
						</li>
					))}
				</ul>
			</section>

			<section className="mx-auto max-w-5xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28">
				<div className="rounded-lg border border-border/60 bg-background/60 px-6 py-12 text-center sm:px-12">
					<h2 className="font-serif-display text-3xl text-primary sm:text-4xl">
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
				<p className="mt-10 text-muted-foreground text-xs">{t("footnote")}</p>
			</section>
		</main>
	);
}
