import { LoginForm } from "@wallet/components/auth/login-form";
import { safeNext } from "@wallet/lib/auth/gates";
import { requireSession } from "@wallet/lib/auth/guards";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const t = await getTranslations("Auth");
	const next = safeNext((await searchParams).next) ?? "/";
	// Schon angemeldet: weiter
	const signedIn = await requireSession().then(
		() => true,
		() => false,
	);
	if (signedIn) redirect(next);
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-2">{t("loginTitle")}</h1>
				<p className="text-muted-foreground">{t("loginLead")}</p>
			</div>
			<LoginForm next={next} />
			<div className="flex flex-col gap-2 text-muted-foreground text-subhead">
				<p>{t("noAccount")}</p>
				<p>{t("lost")}</p>
			</div>
		</div>
	);
}
