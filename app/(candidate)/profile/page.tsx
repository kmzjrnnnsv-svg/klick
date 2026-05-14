import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getMyCareerAnalysis } from "@/app/actions/career";
import { getMyDiversity } from "@/app/actions/diversity";
import { getMyInsights } from "@/app/actions/insights";
import {
	ensureTranslationForLocale,
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
import { ProfileForm } from "@/components/profile/profile-form";
import { ProfileTabSwitcher } from "@/components/profile/profile-tab-switcher";
import { ProfileTranslationForm } from "@/components/profile/profile-translation-form";
import { ReferencesForm } from "@/components/profile/references-form";
import { ShareLink } from "@/components/profile/share-link";
import type { CandidateProfile, ProfileTranslationFields } from "@/db/schema";
import { localizedProfile } from "@/lib/insights/locale";

export default async function ProfilePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
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

	// Tab-Routing: ?tab=de|en. Default = Origin der existierenden Daten,
	// sonst aktuelle UI-Locale. So landet ein neuer User in seiner UI-
	// Sprache, ein DE-Bestandsuser bleibt im DE-Tab, kann aber gezielt
	// auf EN klicken.
	const originLocale: "de" | "en" =
		(profile?.profileLanguageOrigin as "de" | "en" | null) ?? locale;
	const params = await searchParams;
	const requestedTab =
		params.tab === "en" ? "en" : params.tab === "de" ? "de" : null;
	const tab: "de" | "en" = requestedTab ?? originLocale;

	// Auto-translate-trigger nur in der UI-Locale wenn es nicht eh die
	// Quell-Sprache ist und keine Übersetzung existiert. Greift unabhängig
	// vom Tab.
	await ensureTranslationForLocale(locale);

	const hasTranslation = !!profile?.translations?.[locale];
	const translationPending =
		!!profile && locale !== originLocale && !hasTranslation;

	// Origin-Tab → ProfileForm mit lokalisierter Initial-Datenbasis.
	// Translation-Tab → ProfileTranslationForm mit Source-Snapshot + bisheriger
	// Übersetzung als Vorbelegung.
	let localizedInitial: CandidateProfile | null = profile;
	if (profile) {
		try {
			const view = localizedProfile(profile, originLocale);
			localizedInitial = {
				...profile,
				headline: view.headline,
				summary: view.summary,
				industries: view.industries,
				awards: view.awards,
				mobility: view.mobility,
				skills: view.skills as CandidateProfile["skills"],
				experience: view.experience,
				education: view.education,
				projects: view.projects,
				publications: view.publications,
				volunteering: view.volunteering,
			};
		} catch (e) {
			console.warn("[profile] localizedProfile failed, falling back to raw", e);
			localizedInitial = profile;
		}
	}

	const isTranslationTab = tab !== originLocale;

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

				{profile && (
					<ProfileTabSwitcher currentTab={tab} origin={originLocale} />
				)}

				{translationPending && (
					<div className="mb-5 rounded-sm border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed">
						{t("translationPending")}
					</div>
				)}

				<section className="mb-6 sm:mb-8">
					<h2 className="mb-2.5 font-medium text-sm sm:text-base">
						{t("insightsHeading")}
					</h2>
					<CandidateInsightsView
						insights={insights}
						profileExtras={
							profile
								? {
										industries: localizedInitial?.industries ?? null,
										awards: localizedInitial?.awards ?? null,
										certificationsMentioned: profile.certificationsMentioned,
										mobility: localizedInitial?.mobility ?? null,
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

				{isTranslationTab && profile ? (
					<ProfileTranslationForm
						targetLocale={tab}
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
								tab
							] as ProfileTranslationFields | null) ?? null
						}
					/>
				) : (
					<ProfileForm initial={localizedInitial} cvs={cvs} locale={tab} />
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
