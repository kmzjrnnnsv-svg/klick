import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function Home() {
	const t = await getTranslations("Landing");

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-14 pb-24 sm:px-6 sm:pt-24">
				<section className="space-y-6">
					<h1 className="text-balance font-semibold text-4xl leading-[1.05] tracking-tight sm:text-5xl">
						{t("hero.title")}
					</h1>
					<p className="max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
						{t("hero.subtitle")}
					</p>
					<div className="pt-2">
						<Link
							href="/login"
							className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						>
							{t("hero.cta")} →
						</Link>
					</div>
				</section>
				<section className="mt-20 grid gap-10 sm:mt-28 sm:grid-cols-3 sm:gap-12">
					{(["1", "2", "3"] as const).map((n) => (
						<div key={n} className="space-y-2">
							<h2 className="font-medium tracking-tight">
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
