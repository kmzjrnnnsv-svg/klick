import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { frameworkOptions } from "@/app/actions/onboarding";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";
import { gateAuth } from "@/lib/auth/gates";
import { getSessionCtx, membershipCount } from "@/lib/auth/guards";

export default async function OnboardingPage() {
	await gateAuth("/onboarding");
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	if ((await membershipCount(ctx.user.id)) > 0) redirect("/heute");
	const t = await getTranslations("Onboarding");
	const frameworks = await frameworkOptions();
	return (
		<div className="flex flex-col gap-8">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("title")}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">{t("lead")}</p>
			</div>
			<OnboardingWizard
				frameworks={frameworks}
				canApplyBaseline={ctx.user.role === "admin"}
			/>
		</div>
	);
}
