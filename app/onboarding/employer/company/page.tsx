import { getTranslations } from "next-intl/server";
import { getEmployer, saveEmployerOnboarding } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function EmployerOnboardingCompany() {
	const t = await getTranslations("Onboarding.employer.company");
	const employer = await getEmployer();

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

			<form action={saveEmployerOnboarding} className="space-y-5">
				<label className="block space-y-1.5">
					<span className="font-medium text-sm">{t("companyNameLabel")}</span>
					<Input
						type="text"
						name="companyName"
						defaultValue={employer?.companyName ?? ""}
						placeholder={t("companyNamePlaceholder")}
						required
						maxLength={120}
						autoFocus
					/>
				</label>

				<label className="block space-y-1.5">
					<span className="font-medium text-sm">{t("websiteLabel")}</span>
					<Input
						type="text"
						name="website"
						defaultValue={employer?.website ?? ""}
						placeholder={t("websitePlaceholder")}
					/>
					<span className="block text-muted-foreground text-xs">
						{t("websiteHint")}
					</span>
				</label>

				<label className="block space-y-1.5">
					<span className="font-medium text-sm">{t("descriptionLabel")}</span>
					<textarea
						name="description"
						defaultValue={employer?.description ?? ""}
						rows={4}
						maxLength={2000}
						placeholder={t("descriptionPlaceholder")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					/>
					<span className="block text-muted-foreground text-xs">
						{t("descriptionHint")}
					</span>
				</label>

				<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5">
					<input
						type="checkbox"
						name="isAgency"
						defaultChecked={employer?.isAgency ?? false}
						className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
					/>
					<div>
						<p className="font-medium text-sm">{t("agencyLabel")}</p>
						<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
							{t("agencyHint")}
						</p>
					</div>
				</label>

				<div className="flex justify-end pt-2">
					<Button type="submit" size="lg">
						{t("finish")}
					</Button>
				</div>
			</form>
		</div>
	);
}
