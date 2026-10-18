import { getTranslations } from "next-intl/server";
import { LinkRegistration } from "@/components/auth/link-registration";
import { getSessionCtx } from "@/lib/auth/guards";

// Einladungslink mit Passkey (ADR-019): /einladung#klk_invite_…
export default async function InvitationLinkPage() {
	const t = await getTranslations("Invitation");
	const ctx = await getSessionCtx();
	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("title")}
				</h1>
			</div>
			<LinkRegistration
				expected="invite"
				sessionEmail={ctx?.user.email ?? null}
			/>
		</div>
	);
}
