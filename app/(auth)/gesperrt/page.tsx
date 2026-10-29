import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/auth/org-choice";
import { Button } from "@/components/ui/button";
import { getSessionCtx } from "@/lib/auth/guards";
import { listUserMemberships } from "@/lib/auth/org";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import { orgSuspension } from "@/lib/org/suspension";

export const metadata: Metadata = { robots: { index: false } };

// Organisation durch den Plattform-Betrieb gesperrt (Admin-Portal): jede
// Seite und Action der Org leitet hierher. Grund und Kontakt stehen da;
// Berater:innen mit weiteren Zugängen wechseln die Organisation.
export default async function SuspendedPage() {
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	const orgId = ctx.session.activeOrganizationId;
	const state = orgId ? await orgSuspension(orgId) : null;
	if (!state?.suspended) redirect("/heute");
	const t = await getTranslations("Suspended");
	const others = (await listUserMemberships(ctx.user.id)).filter(
		(m) => m.organizationId !== orgId && !m.expired,
	);
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<p className="text-body text-muted-foreground">{t("lead")}</p>
			</div>
			{state.reason && (
				<div className="rounded-2xl bg-card p-4">
					<p className="text-footnote text-muted-foreground">{t("reason")}</p>
					<p className="text-body">{state.reason}</p>
				</div>
			)}
			<p className="text-subhead text-muted-foreground">
				{t("contact")}{" "}
				<a href={`mailto:${PLATFORM_MAIL}`} translate="no">
					{PLATFORM_MAIL}
				</a>
			</p>
			<div className="flex flex-wrap gap-3">
				{others.length > 0 && (
					<Button asChild>
						<Link href="/organisationen">{t("switch")}</Link>
					</Button>
				)}
				<SignOutButton label={t("signOut")} />
			</div>
		</div>
	);
}
