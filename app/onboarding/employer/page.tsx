import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function EmployerOnboardingWelcome() {
	const t = await getTranslations("Onboarding.employer.welcome");
	return (
		<div className="space-y-8">
			<header className="space-y-2">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{t("title")}
				</h1>
				<p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
					{t("subtitle")}
				</p>
			</header>

			<ul className="space-y-3">
				{(["1", "2"] as const).map((k) => (
					<li
						key={k}
						className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4"
					>
						<span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 font-medium text-primary text-xs">
							{k}
						</span>
						<div>
							<p className="font-medium text-sm">{t(`steps.${k}.title`)}</p>
							<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
								{t(`steps.${k}.body`)}
							</p>
						</div>
					</li>
				))}
			</ul>

			<div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-muted-foreground text-xs">{t("etaNote")}</p>
				<Link
					href="/onboarding/employer/company"
					className={buttonVariants({ size: "lg" })}
				>
					{t("cta")}
				</Link>
			</div>
		</div>
	);
}
