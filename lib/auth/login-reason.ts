import { getTranslations } from "next-intl/server";
import { linkFailure } from "./magic-link";

// Hinweis oben auf /login und /login/notweg (?grund=, bei ungültigem
// Mail-Link zusätzlich Better Auths ?error=).
export async function loginReason(
	grund: string | undefined,
	error: string | undefined,
): Promise<string | null> {
	const t = await getTranslations("Auth");
	const failure = linkFailure(error);
	switch (grund) {
		case "sitzung-abgelaufen":
			return t("reasonSessionExpired");
		case "zugang-abgelaufen":
			return t("reasonAccessExpired");
		case "org-geloescht":
			return t("reasonOrgDeleted");
		case "sso":
			return t("ssoNoProvider");
		case "link-ungueltig":
			return failure === "expired"
				? t("reasonLinkExpired")
				: failure === "no_account"
					? t("reasonNoAccount")
					: failure === "blocked"
						? t("accountBlocked")
						: failure === "not_activated"
							? t("accountNotActivated")
							: t("genericError");
		default:
			return null;
	}
}
