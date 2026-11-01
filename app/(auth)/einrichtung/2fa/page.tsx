import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EnrolFactor } from "@/components/auth/enrol-factor";
import { withMessages } from "@/components/i18n/with-messages";
import { getSessionCtx } from "@/lib/auth/guards";

async function EnrolPage() {
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	if (ctx.user.twoFactorEnabled || ctx.user.hasPasskey) redirect("/heute");
	const t = await getTranslations("Auth");
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-bold text-title-1">{t("enrolTitle")}</h1>
				<p className="mt-2 text-muted-foreground text-subhead">
					{t("enrolLead")}
				</p>
			</div>
			<EnrolFactor />
		</div>
	);
}

export default withMessages(EnrolPage, ["Auth", "Settings"]);
