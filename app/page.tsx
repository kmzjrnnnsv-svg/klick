import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function Home() {
	const t = await getTranslations("Landing");

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-16 pb-24 sm:px-6 sm:pt-28">
				<section className="space-y-8 text-center">
					<p className="lv-eyebrow text-[0.65rem] text-muted-foreground">
						Maison Klick — Est. 2026
					</p>
					<h1 className="font-serif-display text-balance text-5xl leading-[1.02] sm:text-7xl">
						{t("hero.title")}
					</h1>
					<p className="mx-auto max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
						{t("hero.subtitle")}
					</p>
					<div className="flex justify-center pt-2">
						<Link
							href="/login"
							className="inline-flex h-12 items-center justify-center rounded-sm bg-foreground px-8 font-medium text-[0.72rem] text-background uppercase tracking-[0.22em] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						>
							{t("hero.cta")}
						</Link>
					</div>
				</section>
				<div className="mx-auto my-20 h-px w-24 bg-border sm:my-28" />
				<section className="grid gap-12 sm:grid-cols-3 sm:gap-14">
					{(["1", "2", "3"] as const).map((n) => (
						<div key={n} className="space-y-3 text-center sm:text-left">
							<p className="lv-eyebrow text-[0.6rem] text-primary">
								{`0${n} — `}
							</p>
							<h2 className="font-serif-display text-2xl">
								{t(`pillars.${n}.title`)}
							</h2>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{t(`pillars.${n}.body`)}
							</p>
						</div>
					))}
				</section>
			</main>
			<Footer />
		</>
	);
}
