import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getMyCareerAnalysis } from "@/app/actions/career";
import { getMyDiversity } from "@/app/actions/diversity";
import { getMyInsights } from "@/app/actions/insights";
import {
	ensureTranslationForUser,
	getProfile,
	listCvVaultItems,
} from "@/app/actions/profile";
import { getMyShareToken } from "@/app/actions/public-profile";
import { listMyReferences } from "@/app/actions/references";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { CareerAnalysisView } from "@/components/profile/career-analysis-view";
import { DiversityForm } from "@/components/profile/diversity-form";
import { LanguageToggle } from "@/components/profile/language-toggle";
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileTranslationForm } from "@/components/profile/profile-translation-form";
import { ReferencesForm } from "@/components/profile/references-form";
import { ShareLink } from "@/components/profile/share-link";
import type { CandidateProfile, ProfileTranslationFields } from "@/db/schema";
import { localizedProfile } from "@/lib/insights/locale";

export default async function ProfilePage({
	searchParams,
}: {
	searchParams: Promise<{ lang?: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Profile");
	const localeRaw = await getLocale();
	const locale: "de" | "en" = localeRaw === "en" ? "en" : "de";
	const [profile, cvs, insights, shareToken, diversity, references, career] =
		await Promise.all([
			getProfile(),
			listCvVaultItems(),
			getMyInsights(),
			getMyShareToken(),
			getMyDiversity(),
			listMyReferences(),
			getMyCareerAnalysis(),
		]);

	// Origin = Sprache, in der das Profil verfasst wurde. Der Editor zeigt
	// IMMER die Origin-Inhalte; der ?lang=-Param steuert nur die Betrachter-
	// Vorschau ("So liest sich dein Profil"). Default-Vorschau = Origin.
	const originLocale: "de" | "en" =
		(profile?.profileLanguageOrigin as "de" | "en" | null) ?? locale;
	const otherLocale: "de" | "en" = originLocale === "de" ? "en" : "de";
	const params = await searchParams;
	const requestedLang =
		params.lang === "en" ? "en" : params.lang === "de" ? "de" : null;
	const viewLang: "de" | "en" = requestedLang ?? originLocale;

	// Backfill-Netz für Legacy-Profile: fehlt die Übersetzung in die Gegen-
	// sprache, im Hintergrund nachziehen. Neue Profile bekommen sie eager
	// beim Speichern (saveProfile → translateProfileFields, force=true).
	if (profile && session.user.id && !profile.translations?.[otherLocale]) {
		await ensureTranslationForUser(session.user.id, otherLocale);
	}

	// Zwei lokalisierte Sichten des Profils:
	//   - formInitial → ProfileForm: zeigt IMMER die Origin-Inhalte.
	//   - insightsView → CandidateInsightsView profileExtras: folgt dem
	//     Betrachter-Toggle (viewLang).
	let formInitial: CandidateProfile | null = profile;
	let insightsView: CandidateProfile | null = profile;
	if (profile) {
		try {
			const fv = localizedProfile(profile, originLocale);
			formInitial = {
				...profile,
				headline: fv.headline,
				summary: fv.summary,
				industries: fv.industries,
				awards: fv.awards,
				mobility: fv.mobility,
				skills: fv.skills as CandidateProfile["skills"],
				experience: fv.experience,
				education: fv.education,
				projects: fv.projects,
				publications: fv.publications,
				volunteering: fv.volunteering,
			};
			const iv = localizedProfile(profile, viewLang);
			insightsView = {
				...profile,
				industries: iv.industries,
				awards: iv.awards,
				mobility: iv.mobility,
			};
		} catch (e) {
			console.warn("[profile] localizedProfile failed, falling back to raw", e);
			formInitial = profile;
			insightsView = profile;
		}
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-6 sm:mb-8">
					<div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
						<h2 className="font-medium text-sm sm:text-base">
							{t("insightsHeading")}
						</h2>
						{profile && (
							<LanguageToggle origin={originLocale} current={viewLang} />
						)}
					</div>
					<CandidateInsightsView
						insights={insights}
						contentLocale={viewLang}
						profileExtras={
							profile
								? {
										industries: insightsView?.industries ?? null,
										awards: insightsView?.awards ?? null,
										certificationsMentioned: profile.certificationsMentioned,
										mobility: insightsView?.mobility ?? null,
										preferredRoleLevel: profile.preferredRoleLevel,
									}
								: null
						}
						showRefresh
					/>
				</section>

				<section className="mb-6">
					<ShareLink initialToken={shareToken} />
				</section>

				<ProfileForm initial={formInitial} cvs={cvs} locale={originLocale} />

				{profile && (
					<details className="mt-8 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
						<summary className="cursor-pointer font-medium text-muted-foreground text-sm">
							{t("reviewTranslationHeading")}
						</summary>
						<div className="mt-4">
							<ProfileTranslationForm
								targetLocale={otherLocale}
								sourceLocale={originLocale}
								source={{
									headline: profile.headline,
									summary: profile.summary,
									mobility: profile.mobility,
									industries: profile.industries,
									awards: profile.awards,
									experience: profile.experience,
									education: profile.education,
									projects: profile.projects,
									publications: profile.publications,
									volunteering: profile.volunteering,
								}}
								initialTranslation={
									(profile.translations?.[
										otherLocale
									] as ProfileTranslationFields | null) ?? null
								}
							/>
						</div>
					</details>
				)}

				<section className="mt-12 border-border border-t pt-8">
					<h2 className="mb-2 font-serif-display text-xl">
						{t("careerHeading")}
					</h2>
					<p className="mb-4 text-muted-foreground text-xs leading-relaxed">
						{t("careerSubtitle")}
					</p>
					<CareerAnalysisView
						initial={career.analysis}
						updatedAt={career.updatedAt}
					/>
				</section>

				<section className="mt-12 border-border border-t pt-8">
					<h2 className="mb-2 font-serif-display text-xl">
						{t("referencesHeading")}
					</h2>
					<p className="mb-4 text-muted-foreground text-xs leading-relaxed">
						{t("referencesSubtitle")}
					</p>
					<ReferencesForm initial={references} />
				</section>

				<section className="mt-12 border-border border-t pt-8">
					<h2 className="mb-2 font-serif-display text-xl">
						{t("diversityHeading")}
					</h2>
					<p className="mb-4 text-muted-foreground text-xs leading-relaxed">
						{t("diversitySubtitle")}
					</p>
					<DiversityForm initial={diversity} />
				</section>
			</main>
			<Footer />
		</>
	);
}
