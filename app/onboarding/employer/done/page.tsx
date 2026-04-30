import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getEmployer } from "@/app/actions/jobs";
import { buttonVariants } from "@/components/ui/button";

export default async function EmployerOnboardingDone() {
	const t = await getTranslations("Onboarding.employer.done");
	const employer = await getEmployer();
	const company = employer?.companyName ?? "";

	return (
		<div className="space-y-6">
			<header className="space-y-2">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{t("title", { company })}
				</h1>
				<p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
					{employer?.isAgency ? t("subtitleAgency") : t("subtitleCompany")}
				</p>
			</header>

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
					<Link href="/jobs/new" className={buttonVariants({ size: "lg" })}>
						{t("ctaNewJob")}
					</Link>
					<Link
						href="/jobs"
						className={buttonVariants({ variant: "outline", size: "lg" })}
					>
						{t("ctaJobs")}
					</Link>
				</div>
			</div>
		</div>
	);
}
