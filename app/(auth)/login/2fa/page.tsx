import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { gateAuth } from "@/lib/auth/gates";
import { getSessionCtx } from "@/lib/auth/guards";

export default async function TwoFactorPage({
	searchParams,
}: {
	searchParams: Promise<{ stepup?: string; zurueck?: string }>;
}) {
	const { stepup, zurueck } = await searchParams;
	const stepUp = stepup === "1";
	if (!stepUp) {
		await gateAuth("/login/2fa");
		// Ohne Sitzung (abgelaufen, widerrufen) kann kein Code helfen.
		if (!(await getSessionCtx())) redirect("/login?grund=sitzung-abgelaufen");
	}
	const t = await getTranslations("Auth");
	const returnTo = zurueck?.startsWith("/") ? zurueck : "/heute";
	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("twoFactorTitle")}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					{stepUp ? t("twoFactorStepUp") : t("twoFactorLead")}
				</p>
			</div>
			<TwoFactorForm stepUp={stepUp} returnTo={returnTo} />
		</div>
	);
}
