import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";
import { pendingInvitationId } from "@/lib/auth/allow-list";
import { gateAuth } from "@/lib/auth/gates";
import { getSessionCtx, primaryMembershipCount } from "@/lib/auth/guards";
import { listUserMemberships } from "@/lib/auth/org";

export default async function OnboardingPage() {
	await gateAuth("/onboarding");
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	if ((await primaryMembershipCount(ctx.user.id)) > 0) redirect("/heute");
	// Eingeladen? Dann der Einladung folgen statt eine eigene Organisation
	// anzulegen (z. B. nach der 2FA-Einrichtung ohne ?weiter=).
	const invitationId = await pendingInvitationId(ctx.user.email);
	if (invitationId) redirect(`/einladung/${invitationId}`);
	// Nur Berater-Zugänge: eigene Org anlegen geht, die Zugänge bleiben wählbar.
	const consultantOnly = (await listUserMemberships(ctx.user.id)).length > 0;
	const t = await getTranslations("Onboarding");
	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<p className="mt-2 text-muted-foreground text-subhead">{t("lead")}</p>
				{consultantOnly && (
					<p className="mt-2 text-subhead">
						<Link
							href="/organisationen"
							className="underline underline-offset-4"
						>
							{t("consultantAccess")}
						</Link>
					</p>
				)}
			</div>
			<OnboardingWizard canApplyBaseline={ctx.user.role === "admin"} />
		</div>
	);
}
