import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TermsAccept } from "@/components/auth/terms-accept";
import { withMessages } from "@/components/i18n/with-messages";
import { orgSettings } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { readOrg } from "@/lib/db/with-org";
import { termsAccepted } from "@/lib/legal/terms";

export const metadata: Metadata = { robots: { index: false } };

// Nutzungsbedingungen beim ersten Einstieg: Organisationen, die der
// Klick-Betrieb im Admin-Portal angelegt hat, bestätigt die Inhaber:in hier
// (sonst geschieht das beim Onboarding). /heute und die Einrichtung leiten
// Inhaber:innen ohne Bestätigung hierher.
async function TermsGatePage() {
	const ctx = await requireOrgPage();
	if (ctx.orgRole !== "owner") redirect("/heute");
	const [row] = await readOrg(ctx, (tx) =>
		tx
			.select({ flags: orgSettings.setupFlags })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1),
	);
	if (termsAccepted(row?.flags ?? {})) redirect("/heute");
	const t = await getTranslations("TermsGate");
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<p className="text-body text-muted-foreground">{t("lead")}</p>
			</div>
			<TermsAccept />
		</div>
	);
}

export default withMessages(TermsGatePage, [
	"Common",
	"Onboarding",
	"TermsGate",
]);
