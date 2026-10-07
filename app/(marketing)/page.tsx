import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	MonogramPattern,
	SectionDivider,
} from "@/components/marketing/landing-decor";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function LandingPage() {
	const t = await getTranslations("Landing");
	const pillars = [
		{ title: t("pillar1Title"), body: t("pillar1Body") },
		{ title: t("pillar2Title"), body: t("pillar2Body") },
		{ title: t("pillar3Title"), body: t("pillar3Body") },
	];
	return (
		<main className="relative flex-1 overflow-hidden">
			<MonogramPattern className="-z-10 pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.04]" />
			<section className="mx-auto max-w-5xl px-4 pt-20 pb-12 sm:px-6 sm:pt-28">
				<p className="lv-eyebrow text-[0.62rem] text-brown">{t("eyebrow")}</p>
				<h1 className="mt-5 max-w-3xl font-serif-display text-4xl text-primary leading-[1.05] sm:text-6xl">
					{t("title")}
				</h1>
				<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
					{t("lead")}
				</p>
				<div className="mt-10 flex flex-wrap gap-3">
					<Link
						href="/login"
						className={cn(buttonVariants({ variant: "brown", size: "lg" }))}
					>
						{t("ctaLogin")}
					</Link>
					<Link
						href="/vertrauen"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
					>
						{t("ctaTrust")}
					</Link>
				</div>
			</section>
			<SectionDivider />
			<section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("pillarsTitle")}
				</h2>
				<div className="mt-10 grid gap-10 sm:grid-cols-3">
					{pillars.map((p, i) => (
						<article key={p.title} className="flex flex-col gap-3">
							<p className="lv-eyebrow text-[0.6rem] text-muted-foreground">
								0{i + 1}
							</p>
							<h3 className="font-serif-display text-xl leading-tight">
								{p.title}
							</h3>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{p.body}
							</p>
						</article>
					))}
				</div>
				<p className="mt-16 text-muted-foreground text-xs">{t("footnote")}</p>
			</section>
		</main>
	);
}
