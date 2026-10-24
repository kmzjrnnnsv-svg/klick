import { LinkRegistration } from "@wallet/components/auth/link-registration";
import { requireSession } from "@wallet/lib/auth/guards";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Einladung" };

export default async function InvitePage() {
	const t = await getTranslations("Link");
	const session = await requireSession().catch(() => null);
	return (
		<div className="flex flex-col gap-6">
			<h1 className="font-bold text-title-2">{t("inviteTitle")}</h1>
			<LinkRegistration
				page="invite"
				sessionEmail={session?.user.email ?? null}
			/>
		</div>
	);
}
