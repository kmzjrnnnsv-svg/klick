import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { EducationCard } from "@/components/profile/education-card";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { localizedProfile } from "@/lib/insights/locale";
import type { CandidateInsights } from "@/lib/insights/types";
import { isVisibleAt, redactProfile } from "@/lib/profile/visibility";

export default async function PublicProfilePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	if (!token || token.length < 16) notFound();

	const [raw] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.publicShareToken, token))
		.limit(1);
	if (!raw) notFound();

	// Redact alles, was der Kandidat nicht auf "public" gestellt hat.
	const profile = redactProfile(raw, "public");
	const t = await getTranslations("PublicProfile");
	const locale = ((await getLocale()) as "de" | "en") ?? "de";
	const view = localizedProfile(profile, locale);
	const map = raw.sectionVisibility;
	const globalVis = raw.visibility as
		| "private"
		| "matches_only"
		| "public"
		| null;

	const showInsights =
		isVisibleAt("certifications", map, "public", globalVis) ||
		isVisibleAt("industries", map, "public", globalVis) ||
		isVisibleAt("awards", map, "public", globalVis);

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
					{view.headline && (
						<p className="mt-1 text-muted-foreground text-sm">
							{view.headline}
							{profile.location && ` · ${profile.location}`}
						</p>
					)}
				</header>

				{view.summary && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<p className="text-foreground/90 text-sm leading-relaxed">
							{view.summary}
						</p>
					</section>
				)}

				{view.skills && view.skills.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-2 font-medium text-sm">{t("skills")}</h2>
						<div className="flex flex-wrap gap-1.5">
							{view.skills.map((s) => (
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

				{profile.education && profile.education.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("education")}</h2>
						<EducationCard items={profile.education} />
					</section>
				)}

				{profile.publications && profile.publications.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("publications")}</h2>
						<ul className="space-y-2 text-sm">
							{profile.publications.map((p) => (
								<li key={`${p.title}-${p.year ?? ""}`}>
									{p.url ? (
										<a
											href={p.url}
											target="_blank"
											rel="noreferrer"
											className="font-medium hover:underline"
										>
											{p.title}
										</a>
									) : (
										<span className="font-medium">{p.title}</span>
									)}
									<span className="text-muted-foreground text-xs">
										{p.year ? ` · ${p.year}` : ""}
										{p.venue ? ` · ${p.venue}` : ""}
									</span>
								</li>
							))}
						</ul>
					</section>
				)}

				{profile.projects && profile.projects.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("projects")}</h2>
						<ul className="space-y-2 text-sm">
							{profile.projects.map((p) => (
								<li key={p.name}>
									{p.url ? (
										<a
											href={p.url}
											target="_blank"
											rel="noreferrer"
											className="font-medium hover:underline"
										>
											{p.name}
										</a>
									) : (
										<span className="font-medium">{p.name}</span>
									)}
									{p.description && (
										<p className="text-muted-foreground text-xs">
											{p.description}
										</p>
									)}
								</li>
							))}
						</ul>
					</section>
				)}

				{profile.volunteering && profile.volunteering.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-3 font-medium text-sm">{t("volunteering")}</h2>
						<ul className="space-y-2 text-sm">
							{profile.volunteering.map((v) => (
								<li key={`${v.organization}-${v.role}`}>
									<div className="font-medium">{v.role}</div>
									<div className="text-muted-foreground text-xs">
										{v.organization}
										{v.start ? ` · ${v.start}` : ""}
										{v.end ? ` – ${v.end}` : ""}
									</div>
								</li>
							))}
						</ul>
					</section>
				)}

				{profile.availability && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-2 font-medium text-sm">{t("availability")}</h2>
						<p className="text-foreground/90 text-sm">
							{profile.availability.status === "immediate" &&
								t("availImmediate")}
							{profile.availability.status === "notice" &&
								t("availNotice", {
									weeks: profile.availability.noticeWeeks ?? 0,
								})}
							{profile.availability.status === "date" &&
								profile.availability.availableFrom &&
								t("availDate", { date: profile.availability.availableFrom })}
						</p>
					</section>
				)}

				{profile.drivingLicenses && profile.drivingLicenses.length > 0 && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-2 font-medium text-sm">{t("drivingLicenses")}</h2>
						<div className="flex flex-wrap gap-1.5">
							{profile.drivingLicenses.map((l) => (
								<span
									key={l}
									className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs"
								>
									{l}
								</span>
							))}
						</div>
					</section>
				)}

				{profile.socialLinks && (
					<section className="mb-5 rounded-lg border border-border bg-background p-4">
						<h2 className="mb-2 font-medium text-sm">{t("socialLinks")}</h2>
						<ul className="space-y-1 text-sm">
							{profile.socialLinks.github && (
								<li>
									<a
										className="hover:underline"
										href={profile.socialLinks.github}
										target="_blank"
										rel="noreferrer"
									>
										GitHub
									</a>
								</li>
							)}
							{profile.socialLinks.linkedin && (
								<li>
									<a
										className="hover:underline"
										href={profile.socialLinks.linkedin}
										target="_blank"
										rel="noreferrer"
									>
										LinkedIn
									</a>
								</li>
							)}
							{profile.socialLinks.xing && (
								<li>
									<a
										className="hover:underline"
										href={profile.socialLinks.xing}
										target="_blank"
										rel="noreferrer"
									>
										Xing
									</a>
								</li>
							)}
							{profile.socialLinks.website && (
								<li>
									<a
										className="hover:underline"
										href={profile.socialLinks.website}
										target="_blank"
										rel="noreferrer"
									>
										{t("website")}
									</a>
								</li>
							)}
						</ul>
					</section>
				)}

				{showInsights && (
					<section className="mb-5">
						<h2 className="mb-3 font-medium text-sm">{t("insightsHeading")}</h2>
						<CandidateInsightsView
							insights={(raw.insights as CandidateInsights | null) ?? null}
							profileExtras={{
								industries: isVisibleAt("industries", map, "public", globalVis)
									? view.industries
									: null,
								awards: isVisibleAt("awards", map, "public", globalVis)
									? view.awards
									: null,
								certificationsMentioned: isVisibleAt(
									"certifications",
									map,
									"public",
									globalVis,
								)
									? raw.certificationsMentioned
									: null,
								mobility: view.mobility,
								preferredRoleLevel: raw.preferredRoleLevel,
							}}
						/>
					</section>
				)}

				<p className="rounded-md border border-border bg-muted/20 p-3 text-muted-foreground text-xs">
					{t("footerHint")}
				</p>
			</main>
			<Footer />
		</>
	);
}
