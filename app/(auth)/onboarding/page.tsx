import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { frameworkOptions } from "@/app/actions/onboarding";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";
import { gateAuth } from "@/lib/auth/gates";
import { getSessionCtx, primaryMembershipCount } from "@/lib/auth/guards";
import { listUserMemberships } from "@/lib/auth/org";

export default async function OnboardingPage() {
	await gateAuth("/onboarding");
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	if ((await primaryMembershipCount(ctx.user.id)) > 0) redirect("/heute");
	// Nur Berater-Zugänge: eigene Org anlegen geht, die Zugänge bleiben wählbar.
	const consultantOnly = (await listUserMemberships(ctx.user.id)).length > 0;
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
				{consultantOnly && (
					<p className="mt-2 text-sm">
						<Link
							href="/organisationen"
							className="underline underline-offset-4"
						>
							{t("consultantAccess")}
						</Link>
					</p>
				)}
			</div>
			<OnboardingWizard
				frameworks={frameworks}
				canApplyBaseline={ctx.user.role === "admin"}
			/>
		</div>
	);
}
