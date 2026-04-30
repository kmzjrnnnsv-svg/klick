import { getTranslations } from "next-intl/server";
import {
	finishOnboarding,
	getOnboardingProfile,
} from "@/app/actions/onboarding";
import { OnboardingShell } from "@/components/onboarding/shell";
import { Button } from "@/components/ui/button";

const OPTIONS = ["matches_only", "private", "public"] as const;
type Option = (typeof OPTIONS)[number];

export default async function OnboardingVisibility() {
	const t = await getTranslations("Onboarding.visibility");
	const profile = await getOnboardingProfile();
	const current: Option = profile?.visibility ?? "matches_only";

	return (
		<OnboardingShell
			step="visibility"
			title={t("title")}
			subtitle={t("subtitle")}
		>
			<form action={finishOnboarding} className="space-y-4">
				{OPTIONS.map((opt) => (
					<label
						key={opt}
						className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5"
					>
						<input
							type="radio"
							name="visibility"
							value={opt}
							defaultChecked={current === opt}
							className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
						/>
						<div>
							<p className="font-medium text-sm">{t(`options.${opt}.title`)}</p>
							<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
								{t(`options.${opt}.body`)}
							</p>
						</div>
					</label>
				))}
				<div className="flex justify-end pt-2">
					<Button type="submit" size="lg">
						{t("finish")}
					</Button>
				</div>
			</form>
		</OnboardingShell>
	);
}
