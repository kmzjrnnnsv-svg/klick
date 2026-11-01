import { getTranslations } from "next-intl/server";
import { LinkRegistration } from "@/components/auth/link-registration";
import { withMessages } from "@/components/i18n/with-messages";
import { getSessionCtx } from "@/lib/auth/guards";

// Einladungslink mit Passkey (ADR-019): /einladung#klk_invite_…
async function InvitationLinkPage() {
	const t = await getTranslations("Invitation");
	const ctx = await getSessionCtx();
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-bold text-title-1">{t("title")}</h1>
			</div>
			<LinkRegistration
				expected="invite"
				sessionEmail={ctx?.user.email ?? null}
			/>
		</div>
	);
}

export default withMessages(InvitationLinkPage, [
	"Activate",
	"Auth",
	"Invitation",
	"Recover",
]);
