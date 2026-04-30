import { getTranslations } from "next-intl/server";
import { getOnboardingProfile } from "@/app/actions/onboarding";
import { listCvVaultItems } from "@/app/actions/profile";
import { OnboardingShell } from "@/components/onboarding/shell";
import { SkillsStep } from "@/components/onboarding/skills-step";

export default async function OnboardingSkills() {
	const t = await getTranslations("Onboarding.skills");
	const [profile, cvs] = await Promise.all([
		getOnboardingProfile(),
		listCvVaultItems(),
	]);
	return (
		<OnboardingShell step="skills" title={t("title")} subtitle={t("subtitle")}>
			<SkillsStep
				initial={profile}
				cvs={cvs.map((cv) => ({
					id: cv.id,
					filename: cv.filename,
					createdAt: cv.createdAt,
				}))}
			/>
		</OnboardingShell>
	);
}
