import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import type { CandidateInsights } from "@/lib/insights/types";

export default async function PublicProfilePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	if (!token || token.length < 16) notFound();

	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.publicShareToken, token))
		.limit(1);
	if (!profile) notFound();

	const t = await getTranslations("PublicProfile");

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						{t("publicLabel")}
					</p>
					<h1 className="mt-1 font-semibold text-xl tracking-tight sm:text-3xl">
						{profile.displayName ?? t("anonymous")}
					</h1>
					{profile.headline && (
						<p className="mt-1 text-muted-foreground text-sm">
							{profile.headline}
							{profile.location && ` · ${profile.location}`}
						</p>
					)}
				</header>

				{profile.summary && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<p className="text-foreground/90 text-sm leading-relaxed">
							{profile.summary}
						</p>
					</section>
				)}

				{profile.skills && profile.skills.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-2 font-medium text-sm">{t("skills")}</h2>
						<div className="flex flex-wrap gap-1.5">
							{profile.skills.map((s) => (
								<span
									key={s.name}
									className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]"
								>
									{s.name}
									{s.level ? `: ${s.level}` : ""}
								</span>
							))}
						</div>
					</section>
				)}

				<section className="mb-5">
					<h2 className="mb-3 font-medium text-sm">{t("insightsHeading")}</h2>
					<CandidateInsightsView
						insights={(profile.insights as CandidateInsights | null) ?? null}
						profileExtras={{
							industries: profile.industries,
							awards: profile.awards,
							certificationsMentioned: profile.certificationsMentioned,
							mobility: profile.mobility,
							preferredRoleLevel: profile.preferredRoleLevel,
						}}
					/>
				</section>

				<p className="rounded-md border border-border bg-muted/20 p-3 text-muted-foreground text-xs">
					{t("footerHint")}
				</p>
			</main>
			<Footer />
		</>
	);
}
