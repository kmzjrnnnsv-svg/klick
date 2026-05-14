import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const HERO_IMAGE =
	"https://picsum.photos/seed/klick-maison-hero/2000/1300?grayscale";

const FEATURE_IMAGES = {
	vault: "https://picsum.photos/seed/klick-vault-paper/1200/900?grayscale",
	cv: "https://picsum.photos/seed/klick-cv-handwritten/1200/900?grayscale",
	insights:
		"https://picsum.photos/seed/klick-insights-graph/1200/900?grayscale",
	career: "https://picsum.photos/seed/klick-career-compass/1200/900?grayscale",
	badges: "https://picsum.photos/seed/klick-badges-medal/1200/900?grayscale",
	verify: "https://picsum.photos/seed/klick-verify-stamp/1200/900?grayscale",
	references:
		"https://picsum.photos/seed/klick-references-letter/1200/900?grayscale",
	match: "https://picsum.photos/seed/klick-match-meet/1200/900?grayscale",
	salary: "https://picsum.photos/seed/klick-salary-coin/1200/900?grayscale",
	applications:
		"https://picsum.photos/seed/klick-pipeline-board/1200/900?grayscale",
	offers: "https://picsum.photos/seed/klick-offer-handshake/1200/900?grayscale",
	disclosure:
		"https://picsum.photos/seed/klick-disclosure-key/1200/900?grayscale",
} as const;

const TRUST_IMAGE =
	"https://picsum.photos/seed/klick-vault-arch/2000/1100?grayscale";
const CANDIDATE_IMAGE =
	"https://picsum.photos/seed/klick-candidate-portrait/1400/1700?grayscale";
const EMPLOYER_IMAGE =
	"https://picsum.photos/seed/klick-employer-desk/1400/1700?grayscale";

function MonogramPattern({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 200 200"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<defs>
				<pattern id="lvk" width="50" height="50" patternUnits="userSpaceOnUse">
					<g fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.45">
						<circle cx="25" cy="25" r="9" />
						<path d="M16 25 L34 25 M25 16 L25 34" />
						<path d="M19 19 L31 31 M31 19 L19 31" />
					</g>
				</pattern>
			</defs>
			<rect width="200" height="200" fill="url(#lvk)" />
		</svg>
	);
}

function SectionDivider() {
	return <div className="mx-auto my-20 h-px w-24 bg-border sm:my-28" />;
}

const FEATURE_KEYS = [
	"vault",
	"cv",
	"insights",
	"career",
	"badges",
	"verify",
	"references",
	"match",
	"salary",
	"applications",
	"offers",
	"disclosure",
] as const;

const TRUST_KEYS = ["1", "2", "3", "4"] as const;
const CANDIDATE_STEPS = ["1", "2", "3", "4", "5", "6"] as const;
const EMPLOYER_STEPS = ["1", "2", "3", "4", "5", "6"] as const;
const FAQ_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

// Brauntöne statt Schwarz für die Startseiten-CTAs.
const CTA_PRIMARY =
	"inline-flex h-12 items-center justify-center rounded-sm bg-brown px-8 font-medium text-[0.72rem] text-brown-foreground uppercase tracking-[0.22em] transition-opacity hover:opacity-90";
const CTA_SECONDARY =
	"inline-flex h-12 items-center justify-center rounded-sm border border-brown/45 px-8 font-medium text-[0.72rem] text-brown uppercase tracking-[0.22em] transition-colors hover:bg-brown hover:text-brown-foreground";

export default async function Home() {
	const t = await getTranslations("Landing");

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
							<Link href="/jobs/browse" className={CTA_SECONDARY}>
								{t("hero.secondary")}
							</Link>
						</div>
					</div>
				</section>

				{/* MANIFESTO + PILLARS */}
				<section className="mx-auto w-full max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
					<div className="mx-auto max-w-2xl text-center">
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("manifesto.eyebrow")}
						</p>
						<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
							{t("manifesto.title")}
						</h2>
						<p className="mt-5 text-muted-foreground text-sm leading-relaxed sm:text-base">
							{t("manifesto.body")}
						</p>
					</div>
					<div className="mt-16 grid gap-x-12 gap-y-14 sm:mt-20 sm:grid-cols-3">
						{(["1", "2", "3"] as const).map((n) => (
							<div key={n} className="space-y-3 text-center sm:text-left">
								<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
									{`0${n}`}
								</p>
								<h3 className="font-serif-display text-xl sm:text-2xl">
									{t(`pillars.${n}.title`)}
								</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">
									{t(`pillars.${n}.body`)}
								</p>
							</div>
						))}
					</div>
				</section>

				<SectionDivider />

				{/* CANDIDATE JOURNEY */}
				<section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
					<div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-16">
						<div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted lg:sticky lg:top-24">
							<Image
								src={CANDIDATE_IMAGE}
								alt=""
								fill
								sizes="(min-width: 1024px) 40vw, 100vw"
								className="object-cover"
							/>
							<div className="absolute right-3 bottom-3 left-3 flex items-center justify-between">
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									{t("imageCaption.profile")}
								</span>
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									№ 01
								</span>
							</div>
						</div>
						<div>
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{t("candidateJourney.eyebrow")}
							</p>
							<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
								{t("candidateJourney.title")}
							</h2>
							<ol className="mt-10 divide-y divide-border border-border/60 border-t border-b">
								{CANDIDATE_STEPS.map((n) => (
									<li
										key={n}
										className="grid grid-cols-[auto_1fr] items-baseline gap-6 py-5"
									>
										<span className="font-mono text-[0.7rem] text-primary tabular-nums">
											{`0${n}`}
										</span>
										<div>
											<h3 className="font-serif-display text-lg sm:text-xl">
												{t(`candidateJourney.steps.${n}.title`)}
											</h3>
											<p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
												{t(`candidateJourney.steps.${n}.body`)}
											</p>
										</div>
									</li>
								))}
							</ol>
						</div>
					</div>
				</section>

				{/* EMPLOYER JOURNEY */}
				<section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
					<div className="grid gap-12 lg:grid-cols-[7fr_5fr] lg:items-start lg:gap-16">
						<div className="lg:order-1">
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{t("employerJourney.eyebrow")}
							</p>
							<h2 className="mt-4 font-serif-display text-3xl text-primary sm:text-5xl">
								{t("employerJourney.title")}
							</h2>
							<ol className="mt-10 divide-y divide-border border-border/60 border-t border-b">
								{EMPLOYER_STEPS.map((n) => (
									<li
										key={n}
										className="grid grid-cols-[auto_1fr] items-baseline gap-6 py-5"
									>
										<span className="font-mono text-[0.7rem] text-primary tabular-nums">
											{`0${n}`}
										</span>
										<div>
											<h3 className="font-serif-display text-lg sm:text-xl">
												{t(`employerJourney.steps.${n}.title`)}
											</h3>
											<p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
												{t(`employerJourney.steps.${n}.body`)}
											</p>
										</div>
									</li>
								))}
							</ol>
						</div>
						<div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-muted lg:order-2 lg:sticky lg:top-24">
							<Image
								src={EMPLOYER_IMAGE}
								alt=""
								fill
								sizes="(min-width: 1024px) 40vw, 100vw"
								className="object-cover"
							/>
							<div className="absolute right-3 bottom-3 left-3 flex items-center justify-between">
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									{t("imageCaption.match")}
								</span>
								<span className="lv-eyebrow rounded-sm bg-background/80 px-3 py-1.5 text-[0.55rem] text-foreground backdrop-blur">
									№ 02
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
							<Link href="/jobs/browse" className={CTA_SECONDARY}>
								{t("finalCta.secondary")}
							</Link>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</>
	);
}
