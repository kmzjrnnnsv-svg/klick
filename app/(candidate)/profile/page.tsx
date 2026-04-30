import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyInsights } from "@/app/actions/insights";
import { getProfile, listCvVaultItems } from "@/app/actions/profile";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CandidateInsightsView } from "@/components/insights/candidate-insights";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Profile");
	const [profile, cvs, insights] = await Promise.all([
		getProfile(),
		listCvVaultItems(),
		getMyInsights(),
	]);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-10">
					<h2 className="mb-4 font-medium text-base">{t("insightsHeading")}</h2>
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

				<ProfileForm initial={profile} cvs={cvs} />
			</main>
			<Footer />
		</>
	);
}
