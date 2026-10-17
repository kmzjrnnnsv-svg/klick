import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EnrolFactor } from "@/components/auth/enrol-factor";
import { getSessionCtx } from "@/lib/auth/guards";

export default async function EnrolPage() {
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	if (ctx.user.twoFactorEnabled || ctx.user.hasPasskey) redirect("/heute");
	const t = await getTranslations("Auth");
	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("enrolTitle")}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">{t("enrolLead")}</p>
			</div>
			<EnrolFactor />
		</div>
	);
}
