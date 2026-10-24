import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { gateAuth } from "@/lib/auth/gates";
import { loginReason } from "@/lib/auth/login-reason";
import { safeNextPath } from "@/lib/auth/magic-link";

// Notweg (ADR-019): Passkey verloren oder kein Gerät zur Hand. Erklärt den
// Weg über „Zugang zurücksetzen“ und bietet den Mail-Link an — danach gilt
// weiter die MFA-Pflicht (TOTP oder Passkey einrichten bzw. bestätigen).
export default async function LoginFallbackPage({
	searchParams,
}: {
	searchParams: Promise<{
		grund?: string;
		error?: string;
		weiter?: string | string[];
	}>;
}) {
	await gateAuth("/login/notweg");
	const t = await getTranslations("Auth");
	const { grund, error, weiter } = await searchParams;
	const reason = await loginReason(grund, error);
	const next = safeNextPath(weiter);
	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-bold text-title-1">{t("fallbackTitle")}</h1>
				<p className="mt-2 text-muted-foreground text-subhead">
					{t("fallbackLead")}
				</p>
			</div>
			{reason && (
				<Alert variant="warning">
					<AlertDescription>{reason}</AlertDescription>
				</Alert>
			)}
			<ul className="flex list-disc flex-col gap-2 pl-5 text-subhead">
				<li>{t("fallbackReset")}</li>
				<li>{t("fallbackTotp")}</li>
				<li>{t("fallbackInvite")}</li>
			</ul>
			<MagicLinkForm
				signupAllowed={process.env.AUTH_ALLOW_SIGNUP === "true"}
				next={next}
			/>
			<Link
				href={next ? `/login?weiter=${encodeURIComponent(next)}` : "/login"}
				className="text-primary text-subhead hover:underline"
			>
				{t("backToPasskey")}
			</Link>
		</div>
	);
}
