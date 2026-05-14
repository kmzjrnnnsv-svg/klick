import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import {
	MonogramPattern,
	SectionDivider,
} from "@/components/marketing/landing-decor";
import { cn } from "@/lib/utils";

const HERO_IMAGE =
	"https://picsum.photos/seed/klick-employer-maison/2000/1300?grayscale";
const JOURNEY_IMAGE =
	"https://picsum.photos/seed/klick-employer-pipeline/1400/1700?grayscale";
const TRUST_IMAGE =
	"https://picsum.photos/seed/klick-employer-archive/2000/1100?grayscale";

const FEATURE_IMAGES = {
	jobs: "https://picsum.photos/seed/klick-emp-jobwizard/1200/900?grayscale",
	match: "https://picsum.photos/seed/klick-emp-matchengine/1200/900?grayscale",
	shortlist:
		"https://picsum.photos/seed/klick-emp-shortlist/1200/900?grayscale",
	pipeline: "https://picsum.photos/seed/klick-emp-kanban/1200/900?grayscale",
	assessments:
		"https://picsum.photos/seed/klick-emp-assessment/1200/900?grayscale",
	questions:
		"https://picsum.photos/seed/klick-emp-questions/1200/900?grayscale",
	offers: "https://picsum.photos/seed/klick-emp-offer/1200/900?grayscale",
	team: "https://picsum.photos/seed/klick-emp-team/1200/900?grayscale",
	templates:
		"https://picsum.photos/seed/klick-emp-templates/1200/900?grayscale",
	verify: "https://picsum.photos/seed/klick-emp-verify/1200/900?grayscale",
	audit: "https://picsum.photos/seed/klick-emp-audit/1200/900?grayscale",
	benchmark:
		"https://picsum.photos/seed/klick-emp-benchmark/1200/900?grayscale",
} as const;

const FEATURE_KEYS = [
	"jobs",
	"match",
	"shortlist",
	"pipeline",
	"assessments",
	"questions",
	"offers",
	"team",
	"templates",
	"verify",
	"audit",
	"benchmark",
] as const;

const JOURNEY_STEPS = ["1", "2", "3", "4", "5", "6"] as const;
const TRUST_KEYS = ["1", "2", "3", "4"] as const;
const FAQ_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

// Abo-Stufen. Reine Marketing-Darstellung — die Abrechnung selbst (Stripe)
// ist bewusst noch nicht gebaut, alle CTAs führen in den Signup-Funnel.
const TIERS = [
	{ id: "start", featureCount: 5, featured: false },
	{ id: "team", featureCount: 6, featured: true },
	{ id: "agentur", featureCount: 6, featured: false },
] as const;

const CTA_PRIMARY =
	"inline-flex h-12 items-center justify-center rounded-sm bg-brown px-8 font-medium text-[0.72rem] text-brown-foreground uppercase tracking-[0.22em] transition-opacity hover:opacity-90";
const CTA_SECONDARY =
	"inline-flex h-12 items-center justify-center rounded-sm border border-brown/45 px-8 font-medium text-[0.72rem] text-brown uppercase tracking-[0.22em] transition-colors hover:bg-brown hover:text-brown-foreground";

export default async function EmployerLandingPage() {
	const t = await getTranslations("EmployerLanding");

	return (
		<>
			<Header />
			<main className="flex-1">
				{/* HERO */}
				<section className="relative isolate overflow-hidden">
					<div className="absolute inset-0 -z-10">
						<Image
							src={HERO_IMAGE}
							alt=""
							fill
							priority
							sizes="100vw"
							className="object-cover opacity-40 dark:opacity-25"
						/>
						<div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
					</div>
					<MonogramPattern className="-z-10 absolute top-0 right-0 h-[420px] w-[420px] text-primary/40" />
					<div className="mx-auto w-full max-w-5xl px-4 pt-20 pb-28 text-center sm:px-6 sm:pt-32 sm:pb-40">
						<p className="lv-eyebrow text-[0.65rem] text-muted-foreground">
							{t("eyebrow")}
						</p>
						<h1 className="mx-auto mt-6 max-w-3xl text-balance font-serif-display text-5xl text-primary leading-[1.02] sm:text-7xl">
							{t("hero.title")}
						</h1>
						<p className="mx-auto mt-7 max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
							{t("hero.subtitle")}
						</p>
						<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
							<Link href="/login" className={CTA_PRIMARY}>
								{t("hero.cta")}
							</Link>
							<Link href="#preise" className={CTA_SECONDARY}>
								{t("hero.secondary")}
							</Link>
						</div>
					</div>
				</section>

				{/* PROMISE */}
				<section className="mx-auto w-full max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
					<div className="mx-auto max-w-2xl text-center">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("promise.eyebrow")}
						</p>
						<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("promise.title")}
						</h2>
						<p className="mt-5 text-muted-foreground text-sm leading-relaxed sm:text-base">
							{t("promise.body")}
						</p>
					</div>
					<div className="mt-16 grid gap-x-12 gap-y-14 sm:mt-20 sm:grid-cols-3">
						{(["1", "2", "3"] as const).map((n) => (
							<div key={n} className="space-y-3 text-center sm:text-left">
								<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
									{`0${n}`}
								</p>
								<h3 className="font-serif-display text-xl sm:text-2xl">
									{t(`promise.points.${n}.title`)}
								</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">
									{t(`promise.points.${n}.body`)}
								</p>
							</div>
						))}
					</div>
				</section>

				<SectionDivider />

				{/* JOURNEY */}
				<section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
					<div className="grid gap-12 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-16">
						<div>
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{t("journey.eyebrow")}
							</p>
							<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
								{t("journey.title")}
							</h2>
							<ol className="mt-10 divide-y divide-border border-border/60 border-t border-b">
								{JOURNEY_STEPS.map((n) => (
									<li
										key={n}
										className="grid grid-cols-[auto_1fr] items-baseline gap-6 py-5"
									>
										<span className="font-mono text-[0.7rem] text-primary tabular-nums">
											{`0${n}`}
										</span>
										<div>
											<h3 className="font-serif-display text-lg sm:text-xl">
												{t(`journey.steps.${n}.title`)}
											</h3>
											<p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
												{t(`journey.steps.${n}.body`)}
											</p>
										</div>
									</li>
								))}
							</ol>
						</div>
						<div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted lg:sticky lg:top-24">
							<Image
								src={JOURNEY_IMAGE}
								alt=""
								fill
								sizes="(min-width: 1024px) 40vw, 100vw"
								className="object-cover"
							/>
							<div className="absolute right-3 bottom-3 left-3 flex items-center justify-between">
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									{t("imageCaption.pipeline")}
								</span>
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									№ 01
								</span>
							</div>
						</div>
					</div>
				</section>

				<SectionDivider />

				{/* FEATURE GRID */}
				<section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
					<div className="mx-auto max-w-2xl text-center">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("features.eyebrow")}
						</p>
						<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("features.title")}
						</h2>
						<p className="mt-5 text-muted-foreground text-sm leading-relaxed sm:text-base">
							{t("features.subtitle")}
						</p>
					</div>
					<div className="mt-14 grid gap-x-8 gap-y-14 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
						{FEATURE_KEYS.map((key, idx) => (
							<article key={key} className="group">
								<div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">
									<Image
										src={FEATURE_IMAGES[key]}
										alt=""
										fill
										sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
										className="object-cover transition-transform duration-500 group-hover:scale-105"
									/>
									<span className="lv-eyebrow absolute top-3 left-3 rounded-sm bg-background/80 px-2 py-1 text-[0.55rem] text-foreground backdrop-blur">
										{`№ ${String(idx + 1).padStart(2, "0")}`}
									</span>
								</div>
								<h3 className="mt-5 font-serif-display text-xl">
									{t(`features.${key}.title`)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(`features.${key}.body`)}
								</p>
							</article>
						))}
					</div>
				</section>

				<SectionDivider />

				{/* PRICING */}
				<section
					id="preise"
					className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24"
				>
					<div className="mx-auto max-w-2xl text-center">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("pricing.eyebrow")}
						</p>
						<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("pricing.title")}
						</h2>
						<p className="mt-5 text-muted-foreground text-sm leading-relaxed sm:text-base">
							{t("pricing.subtitle")}
						</p>
					</div>
					<div className="mt-14 grid gap-5 sm:mt-16 lg:grid-cols-3">
						{TIERS.map((tier) => (
							<div
								key={tier.id}
								className={cn(
									"flex flex-col rounded-sm border bg-background p-6 sm:p-7",
									tier.featured ? "border-primary shadow-sm" : "border-border",
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<h3 className="font-serif-display text-2xl">
										{t(`pricing.tiers.${tier.id}.name`)}
									</h3>
									{tier.featured && (
										<span className="lv-eyebrow rounded-sm bg-primary/10 px-2 py-0.5 text-[0.5rem] text-primary">
											{t("pricing.recommended")}
										</span>
									)}
								</div>
								<p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
									{t(`pricing.tiers.${tier.id}.tagline`)}
								</p>
								<div className="mt-5 flex items-baseline gap-2">
									<span className="font-serif-display text-4xl">
										{t(`pricing.tiers.${tier.id}.price`)}
									</span>
									<span className="text-muted-foreground text-xs">
										{t(`pricing.tiers.${tier.id}.priceNote`)}
									</span>
								</div>
								<ul className="mt-6 flex-1 space-y-2.5 text-sm">
									{Array.from({ length: tier.featureCount }, (_, i) => {
										const feature = t(
											`pricing.tiers.${tier.id}.features.${i + 1}`,
										);
										return (
											<li
												key={feature}
												className="grid grid-cols-[auto_1fr] gap-2.5"
											>
												<Check
													className="mt-0.5 h-4 w-4 text-primary"
													strokeWidth={1.5}
												/>
												<span className="text-foreground/90 leading-snug">
													{feature}
												</span>
											</li>
										);
									})}
								</ul>
								<Link
									href="/login"
									className={cn(
										"mt-7 w-full",
										tier.featured ? CTA_PRIMARY : CTA_SECONDARY,
									)}
								>
									{t(`pricing.tiers.${tier.id}.cta`)}
								</Link>
							</div>
						))}
					</div>
					<p className="mx-auto mt-8 max-w-2xl text-center text-muted-foreground text-xs leading-relaxed">
						{t("pricing.candidateNote")}
					</p>
				</section>

				<SectionDivider />

				{/* TRUST */}
				<section className="relative isolate overflow-hidden">
					<div className="absolute inset-0 -z-10">
						<Image
							src={TRUST_IMAGE}
							alt=""
							fill
							sizes="100vw"
							className="object-cover opacity-25 dark:opacity-15"
						/>
						<div className="absolute inset-0 bg-gradient-to-b from-background via-background/85 to-background" />
					</div>
					<div className="mx-auto w-full max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
						<div className="mx-auto max-w-2xl text-center">
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{t("trust.eyebrow")}
							</p>
							<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
								{t("trust.title")}
							</h2>
						</div>
						<div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
							{TRUST_KEYS.map((n) => (
								<div key={n} className="space-y-3 text-center sm:text-left">
									<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
										{`0${n}`}
									</p>
									<h3 className="font-serif-display text-lg">
										{t(`trust.items.${n}.title`)}
									</h3>
									<p className="text-muted-foreground text-sm leading-relaxed">
										{t(`trust.items.${n}.body`)}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* FAQ */}
				<section className="mx-auto w-full max-w-3xl px-4 py-24 sm:px-6 sm:py-32">
					<div className="text-center">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("faq.eyebrow")}
						</p>
						<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("faq.title")}
						</h2>
					</div>
					<dl className="mt-12 divide-y divide-border border-border/60 border-t border-b">
						{FAQ_KEYS.map((n) => (
							<div
								key={n}
								className="grid gap-2 py-6 sm:grid-cols-[1fr_2fr] sm:gap-8"
							>
								<dt className="font-serif-display text-base text-foreground sm:text-lg">
									{t(`faq.items.${n}.q`)}
								</dt>
								<dd className="text-muted-foreground text-sm leading-relaxed">
									{t(`faq.items.${n}.a`)}
								</dd>
							</div>
						))}
					</dl>
				</section>

				{/* FINAL CTA */}
				<section className="border-border border-t bg-muted/40">
					<div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("eyebrow")}
						</p>
						<h2 className="mt-5 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("finalCta.title")}
						</h2>
						<p className="mx-auto mt-5 max-w-xl text-muted-foreground text-sm leading-relaxed sm:text-base">
							{t("finalCta.body")}
						</p>
						<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
							<Link href="/login" className={CTA_PRIMARY}>
								{t("finalCta.cta")}
							</Link>
							<Link href="#preise" className={CTA_SECONDARY}>
								{t("finalCta.secondary")}
							</Link>
						</div>
						<Link
							href="/"
							className="mt-8 inline-block lv-eyebrow text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
						>
							{t("finalCta.candidateLink")}
						</Link>
					</div>
				</section>
			</main>
			<Footer />
		</>
	);
}
