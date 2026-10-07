import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionDivider } from "@/components/marketing/landing-decor";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIERS = ["start", "growth", "licence"] as const;
const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;
const FAQ = ["q1", "q2", "q3", "q4"] as const;

// /preise — Abo-Stufen nur dargestellt (kein Checkout in v1).
export default async function PricingPage() {
	const t = await getTranslations("Pricing");
	return (
		<main className="flex-1">
			<section className="mx-auto max-w-5xl px-4 pt-16 pb-6 sm:px-6 sm:pt-24">
				<p className="lv-eyebrow text-[0.62rem] text-brown">{t("eyebrow")}</p>
				<h1 className="mt-5 max-w-3xl font-serif-display text-4xl text-primary leading-[1.05] sm:text-5xl">
					{t("title")}
				</h1>
				<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
					{t("lead")}
				</p>
			</section>

			<section className="mx-auto mt-12 max-w-5xl px-4 sm:px-6">
				<div className="grid gap-6 lg:grid-cols-3">
					{TIERS.map((tier) => {
						const highlighted = tier === "growth";
						return (
							<article
								key={tier}
								className={cn(
									"flex flex-col rounded-lg border p-6",
									highlighted ? "border-brown bg-brown/5" : "border-border/60",
								)}
							>
								<p className="lv-eyebrow text-[0.6rem] text-muted-foreground">
									{t(`${tier}Eyebrow`)}
								</p>
								<h2 className="mt-3 font-serif-display text-2xl text-primary">
									{t(`${tier}Name`)}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(`${tier}Blurb`)}
								</p>
								<p className="mt-6 font-serif-display text-3xl text-primary">
									{t(`${tier}Price`)}
								</p>
								<p className="text-muted-foreground text-xs">
									{t(`${tier}PriceNote`)}
								</p>
								<ul className="mt-6 flex flex-col gap-2 text-sm">
									{FEATURES.map((f) => (
										<li key={f} className="flex gap-2">
											<span
												aria-hidden="true"
												className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brown"
											/>
											<span>{t(`${tier}_${f}`)}</span>
										</li>
									))}
								</ul>
								<div className="mt-8 flex-1" />
								<Link
									href="/login"
									className={cn(
										buttonVariants({
											variant: highlighted ? "brown" : "outline",
											size: "lg",
										}),
										"w-full",
									)}
								>
									{t(`${tier}Cta`)}
								</Link>
							</article>
						);
					})}
				</div>
				<p className="mt-6 text-muted-foreground text-xs">{t("tiersNote")}</p>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("faqTitle")}
				</h2>
				<dl className="mt-8 grid gap-8 sm:grid-cols-2">
					{FAQ.map((q) => (
						<div key={q}>
							<dt className="font-medium">{t(`${q}Q`)}</dt>
							<dd className="mt-2 text-muted-foreground text-sm leading-relaxed">
								{t(`${q}A`)}
							</dd>
						</div>
					))}
				</dl>
				<p className="mt-16 text-muted-foreground text-xs">{t("footnote")}</p>
			</section>
		</main>
	);
}
