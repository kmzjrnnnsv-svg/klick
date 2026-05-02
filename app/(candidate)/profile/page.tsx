import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyDiversity } from "@/app/actions/diversity";
import { getMyInsights } from "@/app/actions/insights";
import { getProfile, listCvVaultItems } from "@/app/actions/profile";
import { getMyShareToken } from "@/app/actions/public-profile";
import { listMyReferences } from "@/app/actions/references";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { DiversityForm } from "@/components/profile/diversity-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { ReferencesForm } from "@/components/profile/references-form";
import { ShareLink } from "@/components/profile/share-link";

export default async function ProfilePage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Profile");
	const [profile, cvs, insights, shareToken, diversity, references] =
		await Promise.all([
			getProfile(),
			listCvVaultItems(),
			getMyInsights(),
			getMyShareToken(),
			getMyDiversity(),
			listMyReferences(),
		]);

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
					<h2 className="mb-2.5 font-medium text-sm sm:text-base">
						{t("insightsHeading")}
					</h2>
					<CandidateInsightsView
						insights={insights}
						profileExtras={
							profile
								? {
										industries: profile.industries,
										awards: profile.awards,
										certificationsMentioned: profile.certificationsMentioned,
										mobility: profile.mobility,
										preferredRoleLevel: profile.preferredRoleLevel,
									}
								: null
						}
					/>
				</section>

				<section className="mb-6">
					<ShareLink initialToken={shareToken} />
				</section>

				<ProfileForm initial={profile} cvs={cvs} />

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
