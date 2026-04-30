import { useTranslations } from "next-intl";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

// Visible steps in the indicator (excluding 'welcome', which is just a primer).
const PROGRESS_STEPS: OnboardingStep[] = ONBOARDING_STEPS.filter(
	(s) => s !== "welcome",
);

export function OnboardingShell({
	step,
	title,
	subtitle,
	children,
}: {
	step: OnboardingStep;
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	const t = useTranslations("Onboarding");
	const currentIdx = PROGRESS_STEPS.indexOf(step);

	return (
		<div className="space-y-8">
			{step !== "welcome" && (
				<div>
					<div className="flex items-center gap-2">
						{PROGRESS_STEPS.map((s, i) => {
							const state =
								i < currentIdx
									? "done"
									: i === currentIdx
										? "active"
										: "pending";
							return (
								<div
									key={s}
									className={cn(
										"h-1.5 flex-1 rounded-full transition-colors",
										state === "done" && "bg-primary",
										state === "active" && "bg-primary/60",
										state === "pending" && "bg-border",
									)}
								/>
							);
						})}
					</div>
					<p className="mt-2 text-muted-foreground text-xs">
						{t("layout.stepOf", {
							current: currentIdx + 1,
							total: PROGRESS_STEPS.length,
						})}
					</p>
				</div>
			)}

			<header className="space-y-2">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{title}
				</h1>
				{subtitle && (
					<p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
						{subtitle}
					</p>
				)}
			</header>

			{children}
		</div>
	);
}
