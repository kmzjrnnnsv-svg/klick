import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OnboardingShell } from "@/components/onboarding/shell";
import { buttonVariants } from "@/components/ui/button";

export default async function OnboardingDone() {
	const t = await getTranslations("Onboarding.done");
	return (
		<OnboardingShell
			step="visibility"
			title={t("title")}
			subtitle={t("subtitle")}
		>
			<div className="flex flex-col items-center gap-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-6 py-12 text-center">
				<CheckCircle2
					className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
					strokeWidth={1.5}
				/>
				<div>
					<p className="font-semibold text-lg">{t("celebrationTitle")}</p>
					<p className="mt-2 text-muted-foreground text-sm">
						{t("celebrationBody")}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Link href="/matches" className={buttonVariants({ size: "lg" })}>
						{t("ctaMatches")}
					</Link>
					<Link
						href="/profile"
						className={buttonVariants({ variant: "outline", size: "lg" })}
					>
						{t("ctaProfile")}
					</Link>
				</div>
			</div>
		</OnboardingShell>
	);
}
