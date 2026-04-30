import { getTranslations } from "next-intl/server";
import { getOnboardingProfile, saveBasicsStep } from "@/app/actions/onboarding";
import { OnboardingShell } from "@/components/onboarding/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function OnboardingBasics() {
	const t = await getTranslations("Onboarding.basics");
	const profile = await getOnboardingProfile();
	const languages = profile?.languages?.join(", ") ?? "";

	return (
		<OnboardingShell step="basics" title={t("title")} subtitle={t("subtitle")}>
			<form action={saveBasicsStep} className="space-y-5">
				<Field label={t("displayNameLabel")} hint={t("displayNameHint")}>
					<Input
						type="text"
						name="displayName"
						defaultValue={profile?.displayName ?? ""}
						placeholder={t("displayNamePlaceholder")}
						maxLength={120}
						autoFocus
					/>
				</Field>
				<Field label={t("headlineLabel")} hint={t("headlineHint")}>
					<Input
						type="text"
						name="headline"
						defaultValue={profile?.headline ?? ""}
						placeholder={t("headlinePlaceholder")}
						maxLength={200}
					/>
				</Field>
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
					<Field label={t("locationLabel")}>
						<Input
							type="text"
							name="location"
							defaultValue={profile?.location ?? ""}
							placeholder={t("locationPlaceholder")}
							maxLength={120}
						/>
					</Field>
					<Field label={t("yearsLabel")}>
						<Input
							type="number"
							name="yearsExperience"
							defaultValue={profile?.yearsExperience ?? ""}
							min={0}
							max={80}
							placeholder="0"
						/>
					</Field>
				</div>
				<Field label={t("languagesLabel")} hint={t("languagesHint")}>
					<Input
						type="text"
						name="languages"
						defaultValue={languages}
						placeholder={t("languagesPlaceholder")}
					/>
				</Field>
				<div className="flex justify-end gap-3 pt-2">
					<Button type="submit" size="lg">
						{t("next")}
					</Button>
				</div>
			</form>
		</OnboardingShell>
	);
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block space-y-1.5">
			<span className="font-medium text-sm">{label}</span>
			{children}
			{hint && (
				<span className="block text-muted-foreground text-xs">{hint}</span>
			)}
		</label>
	);
}
