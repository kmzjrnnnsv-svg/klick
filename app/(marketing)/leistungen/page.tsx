import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InquiryForm } from "@/components/marketing/inquiry-form";
import { RevealRoot } from "@/components/marketing/reveal";
import { loadPriceTable } from "@/lib/db/pricing";
import { BILLING_TERMS } from "@/lib/marketing/billing";
import { FAQ, SERVICES } from "@/lib/marketing/services";
import { formatPrice } from "@/lib/pricing/resolve";
import { cn } from "@/lib/utils";
import s from "./leistungen.module.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Services");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

// Bildschirmfoto für den Einstieg (Beispieldaten), natürliche Größe
const HERO = { src: "/leistungen/pruefungsreife.jpg", w: 2200, h: 1040 };
const TONES = [s.toneBlue, s.toneBrown, s.toneSky] as const;

// /leistungen — unsere Beratung, übersichtlich: was, für wen, wie es
// abläuft, was am Ende vorliegt. Preise der Beratung gibt es im Gespräch;
// Software und Berater-Zugänge stehen mit Betrag auf /preise.
export default async function ServicesPage({
	searchParams,
}: {
	searchParams: Promise<{ leistung?: string }>;
}) {
	const t = await getTranslations("Services");
	const { prices } = await loadPriceTable();
	const { leistung } = await searchParams;
	const preset = SERVICES.some((x) => x.key === leistung)
		? `svc:${leistung}`
		: undefined;
	return (
		<RevealRoot className={s.page}>
			{/* Einstieg: Aussage links, ein lesbares Bild rechts */}
			<section className={s.hero} aria-labelledby="leistungen-title">
				<div className={s.heroText}>
					<h1 id="leistungen-title" className={s.heroTitle} data-r="">
						{t("heroTitle1")}
						<br />
						{t("heroTitle2")}
					</h1>
					<p className={s.heroLead} data-r="">
						{t("heroLead")}
					</p>
					<div className={s.actions} data-r="">
						<a href="#anfrage" className={s.button}>
							{t("ctaContact")}
						</a>
						<Link href="/preise" className={s.textLink}>
							{t("heroPrices")}
						</Link>
					</div>
				</div>
				<figure className={s.heroPic} data-r="">
					{/* biome-ignore lint/performance/noImgElement: statisches Bildschirmfoto, CSP ohne Bild-Optimierer */}
					<img
						src={HERO.src}
						width={HERO.w}
						height={HERO.h}
						alt={t("heroImageAlt")}
						fetchPriority="high"
						decoding="async"
					/>
				</figure>
			</section>

			{/* Übersicht: fünf Leistungen auf einen Blick */}
			<nav id="leistungen" className={s.index} aria-labelledby="index-title">
				<h2 id="index-title" className={s.h2} data-r="">
					{t("indexTitle")}
				</h2>
				<ul className={s.indexList}>
					{SERVICES.map((svc) => (
						<li key={svc.key} data-r="">
							<a href={`#leistung-${svc.key}`} className={s.indexLink}>
								<span className={s.indexName}>{svc.name}</span>
								<span className={s.indexFits}>{svc.fits}</span>
								<span className={s.indexDuration}>{svc.duration}</span>
							</a>
						</li>
					))}
				</ul>
			</nav>

			{/* Je Leistung ein Abschnitt: Text und ein Bild, abwechselnd */}
			{SERVICES.map((svc, i) => (
				<section
					key={svc.key}
					id={`leistung-${svc.key}`}
					className={cn(s.svc, i % 2 === 1 && s.svcFlip)}
					aria-labelledby={`svc-${svc.key}`}
				>
					<div className={s.svcText}>
						<h2 id={`svc-${svc.key}`} className={s.svcTitle} data-r="">
							{svc.name}
						</h2>
						<p className={s.svcFits} data-r="">
							{svc.fits}
						</p>
						<dl className={s.facts} data-r="">
							<div>
								<dt>{t("factResult")}</dt>
								<dd>{svc.result}</dd>
							</div>
							<div className={s.factRow}>
								<div>
									<dt>{t("factDuration")}</dt>
									<dd>{svc.duration}</dd>
								</div>
								<div>
									<dt>{t("factPrice")}</dt>
									<dd>{t("priceAgreed")}</dd>
								</div>
							</div>
						</dl>
						<h3 className={s.stepsTitle} data-r="">
							{t("stepsTitle")}
						</h3>
						<ol className={s.steps}>
							{svc.steps.map((step) => (
								<li key={step.title} className={s.step} data-r="">
									<span className={s.stepWhen}>{step.when}</span>
									<div className={s.stepBody}>
										<span className={s.stepTitle}>{step.title}</span>
										<span className={s.stepNote}>{step.note}</span>
										{step.files && (
											<ul className={s.files} aria-label={t("filesLabel")}>
												{step.files.map((f) => (
													<li key={f}>
														<code translate="no">{f}</code>
													</li>
												))}
											</ul>
										)}
									</div>
								</li>
							))}
						</ol>
						<Link
							href={`/leistungen?leistung=${svc.key}#anfrage`}
							className={s.svcLink}
							data-r=""
						>
							{t("requestThis")}
						</Link>
					</div>
					<figure className={cn(s.svcPic, TONES[i % 3])} data-r="">
						{/* biome-ignore lint/performance/noImgElement: statisches Bildschirmfoto, CSP ohne Bild-Optimierer */}
						<img
							src={svc.image.src}
							width={svc.image.w}
							height={svc.image.h}
							alt={svc.image.alt}
							loading="lazy"
							decoding="async"
						/>
					</figure>
				</section>
			))}

			{/* So rechnest du ab: drei Regeln, Beträge aus dem CMS */}
			<section className={s.billing} aria-labelledby="billing-title">
				<div className={s.billingHead}>
					<h2 id="billing-title" className={s.h2} data-r="">
						{t("billingTitle")}
					</h2>
					<Link href="/preise" className={s.textLink} data-r="">
						{t("billingMore")}
					</Link>
				</div>
				<ul className={s.terms}>
					{BILLING_TERMS.map((term, i) => (
						<li key={term.key} className={cn(s.term, TONES[i % 3])} data-r="">
							<p className={s.termTitle}>{term.title}</p>
							<p className={s.termText}>{term.text}</p>
							<p className={s.termPrice}>
								{term.price
									? formatPrice(prices[term.price])
									: t("priceAgreed")}
							</p>
							<p className={s.termWhen}>{term.when}</p>
						</li>
					))}
				</ul>
			</section>

			{/* Häufige Fragen */}
			<section className={s.faq} aria-labelledby="faq-title">
				<h2 id="faq-title" className={s.h2} data-r="">
					{t("faqTitle")}
				</h2>
				<div className={s.faqList}>
					{FAQ.map((f) => (
						<details key={f.q} className={s.faqItem} data-r="">
							<summary className={s.faqQ}>{f.q}</summary>
							<p className={s.faqA}>{f.a}</p>
						</details>
					))}
				</div>
			</section>

			{/* Anfrage */}
			<section id="anfrage" className={s.cta} aria-labelledby="cta-title">
				<div className={s.ctaText} data-r="">
					<h2 id="cta-title" className={s.ctaTitle}>
						{t("ctaTitle")}
					</h2>
					<p>{t("ctaLead")}</p>
				</div>
				<div data-r="">
					<InquiryForm
						defaultService={preset}
						buttonClassName={cn(s.button, s.buttonInverse)}
					/>
				</div>
			</section>
			<p className={s.credit}>{t("credit")}</p>
		</RevealRoot>
	);
}
