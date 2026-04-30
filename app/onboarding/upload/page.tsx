import { getTranslations } from "next-intl/server";
import { CvUploadStep } from "@/components/onboarding/cv-upload-step";
import { OnboardingShell } from "@/components/onboarding/shell";

export default async function OnboardingUpload() {
	const t = await getTranslations("Onboarding.upload");
	return (
		<OnboardingShell step="upload" title={t("title")} subtitle={t("subtitle")}>
			<CvUploadStep />
		</OnboardingShell>
	);
}
