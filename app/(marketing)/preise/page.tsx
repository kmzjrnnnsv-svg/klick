import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RevealRoot } from "@/components/marketing/reveal";
import { loadPriceTable } from "@/lib/db/pricing";
import {
	BILLING_FAQ,
	BILLING_NOTE,
	BILLING_TERMS,
	BILLING_TIMELINE,
	withSeatPrice,
} from "@/lib/marketing/billing";
import { PRICE_ITEM_BY_KEY } from "@/lib/pricing/items";
import { formatPrice } from "@/lib/pricing/resolve";
import { cn } from "@/lib/utils";
import s from "./preise.module.css";

const TIERS = ["start", "growth", "licence"] as const;
const TIER_ITEM = {
	start: "plan:start",
	growth: "plan:growth",
	licence: "plan:licence",
} as const;
const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;
const FAQ_MAX = 5;
const TONES = [s.toneBlue, s.toneBrown, s.toneSky] as const;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Pricing");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

// /preise — Zahlungsmodell: Software jährlich, fällig erst nach dem
// bestandenen Audit; Berater-Zugänge ab Start; Beratung im Gespräch.
// Beträge aus der Standard-Preisgruppe (Admin → Preise), kein Checkout.
export default async function PricingPage() {
	const t = await getTranslations("Pricing");
	const { prices } = await loadPriceTable();
	const seat = formatPrice(prices["seat:consultant"]);
	return (
		<RevealRoot as="main" id="inhalt" className={s.page}>
			{/* Einstieg: die Regel als Satz, daneben der Weg in drei Stationen */}
			<section className={s.hero} aria-labelledby="preise-title">
				<div className={s.heroText}>
					<h1 id="preise-title" className={s.heroTitle} data-r="">
						{t("heroTitle1")}
						<br />
						{t("heroTitle2")}
					</h1>
					<p className={s.heroLead} data-r="">
						{t("heroLead")}
					</p>
					<div className={s.actions} data-r="">
						<Link href="/leistungen#anfrage" className={s.button}>
							{t("heroCta")}
						</Link>
						<Link href="/login" className={`hit-area ${s.textLink}`}>
							{t("heroLogin")}
						</Link>
					</div>
				</div>
				<ol className={s.timeline} aria-label={t("timelineLabel")}>
					{BILLING_TIMELINE.map((stop, i) => (
						<li
							key={stop.at}
							className={cn(s.stop, i === 1 && s.stopDue)}
							data-r=""
						>
							<span className={s.stopAt}>{stop.at}</span>
							<span className={s.stopWhat}>{stop.what}</span>
						</li>
					))}
				</ol>
			</section>

			{/* Drei Regeln mit Betrag */}
			<section className={s.terms} aria-labelledby="terms-title">
				<h2 id="terms-title" className={s.h2} data-r="">
					{t("termsTitle")}
				</h2>
				<ul className={s.termList}>
					{BILLING_TERMS.map((term, i) => (
						<li key={term.key} className={cn(s.term, TONES[i % 3])} data-r="">
							<p className={s.termTitle}>{term.title}</p>
							<p>{term.text}</p>
							<p className={s.termPrice}>
								{term.price
									? formatPrice(prices[term.price])
									: t("priceAgreed")}
							</p>
							<p className={s.termWhen}>{term.when}</p>
						</li>
					))}
				</ul>
				<p className={s.note} data-r="">
					{BILLING_NOTE} {t("readinessLead")}
				</p>

				{/* Software-Stufen im selben Block: Regeln, dann die Beträge */}
				<h3 id="tiers-title" className={s.h3} data-r="">
					{t("tiersTitle")}
				</h3>
				<p className={s.tiersLead} data-r="">
					{t("tiersLead")}
				</p>
				<div className={s.tierGrid}>
					{TIERS.map((tier) => {
						const price = prices[TIER_ITEM[tier]];
						const defaultUnit = PRICE_ITEM_BY_KEY.get(TIER_ITEM[tier])?.unit;
						return (
							<article
								key={tier}
								className={cn(s.tier, tier === "growth" && s.tierMain)}
								aria-labelledby={`tier-${tier}`}
								data-r=""
							>
								<h3 id={`tier-${tier}`} className={s.tierName}>
									{t(`${tier}Name`)}
								</h3>
								<p className={s.tierFrameworks}>{t(`${tier}Eyebrow`)}</p>
								<p className={s.tierBlurb}>{t(`${tier}Blurb`)}</p>
								<p className={s.tierPrice}>
									{formatPrice(price, { unit: false })}
								</p>
								<p className={s.tierNote}>
									{price.unit && price.unit !== defaultUnit
										? price.unit
										: t(`${tier}PriceNote`)}
								</p>
								<ul className={s.features}>
									{FEATURES.map((f) => (
										<li key={f}>{t(`${tier}_${f}`)}</li>
									))}
								</ul>
								<Link
									href={`/leistungen?leistung=${encodeURIComponent(TIER_ITEM[tier])}#anfrage`}
									className={cn(
										s.button,
										tier !== "growth" && s.buttonQuiet,
										s.tierCta,
									)}
								>
									{t("tierCta")}
								</Link>
							</article>
						);
					})}
				</div>
				<p className={s.note} data-r="">
					{t("tiersNote")}
				</p>
			</section>

			{/* Fragen: erst zum Zahlungsmodell, dann allgemein */}
			<section className={s.faq} aria-labelledby="faq-title">
				<h2 id="faq-title" className={s.h2} data-r="">
					{t("faqTitle")}
				</h2>
				<div className={s.faqList}>
					{/* höchstens fünf Fragen: die wichtigsten zum Zahlungsmodell */}
					{BILLING_FAQ.slice(0, FAQ_MAX).map((f) => (
						<details key={f.q} className={s.faqItem} data-r="">
							<summary className={s.faqQ}>{f.q}</summary>
							<p className={s.faqA}>{withSeatPrice(f.a, seat)}</p>
						</details>
					))}
				</div>
			</section>

			{/* Beratung */}
			<section className={s.consulting} aria-labelledby="consulting-title">
				<div data-r="">
					<h2 id="consulting-title" className={s.h2}>
						{t("consultingTitle")}
					</h2>
					<p className={s.consultingLead}>{t("consultingLead")}</p>
				</div>
				<Link
					href="/leistungen"
					className={cn(s.button, s.buttonInverse)}
					data-r=""
				>
					{t("consultingCta")}
				</Link>
			</section>
			<p className={s.footnote}>{t("footnote")}</p>
		</RevealRoot>
	);
}
