import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { gateAuth } from "@/lib/auth/gates";
import { linkFailure, safeNextPath } from "@/lib/auth/magic-link";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{
		grund?: string;
		error?: string;
		weiter?: string | string[];
	}>;
}) {
	await gateAuth("/login");
	const t = await getTranslations("Auth");
	const { grund, error, weiter } = await searchParams;
	// Better Auth hängt beim Klick auf einen ungültigen Link ?error=… an.
	const failure = linkFailure(error);
	const reason =
		grund === "sitzung-abgelaufen"
			? t("reasonSessionExpired")
			: grund === "zugang-abgelaufen"
				? t("reasonAccessExpired")
				: grund === "org-geloescht"
					? t("reasonOrgDeleted")
					: grund === "sso"
						? t("ssoNoProvider")
						: grund === "link-ungueltig"
							? failure === "expired"
								? t("reasonLinkExpired")
								: failure === "no_account"
									? t("reasonNoAccount")
									: t("genericError")
							: null;
	const microsoftEnabled = Boolean(
		process.env.MICROSOFT_CLIENT_ID &&
			process.env.MICROSOFT_CLIENT_SECRET &&
			process.env.MICROSOFT_TENANT_ID,
	);
	const signupAllowed = process.env.AUTH_ALLOW_SIGNUP === "true";
	return (
		<div className="flex flex-col gap-8">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("loginTitle")}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">{t("loginLead")}</p>
			</div>
			{reason && (
				<Alert variant={grund === "org-geloescht" ? "default" : "warning"}>
					<AlertDescription>{reason}</AlertDescription>
				</Alert>
			)}
			<LoginForm
				microsoftEnabled={microsoftEnabled}
				signupAllowed={signupAllowed}
				next={safeNextPath(weiter)}
			/>
		</div>
	);
}
