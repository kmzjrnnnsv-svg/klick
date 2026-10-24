import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { ROLE_LABEL, roleAllows } from "@wallet/lib/auth/permissions";
import { listMembers } from "@wallet/lib/orgs/members";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

// Übersicht. Bestände, Empfangen und Senden kommen mit dem Umzug der
// Wallet-Funktionen (W3).
export default async function OverviewPage() {
	const t = await getTranslations("Overview");
	const ctx = await requireUnlockedPage("/");
	const team = await listMembers({ orgId: ctx.orgId, userId: ctx.userId });
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-serif-display text-3xl">{t("title")}</h1>
				<p className="text-muted-foreground">
					{t("lead", { org: ctx.orgName, role: ROLE_LABEL[ctx.role] })}
				</p>
			</div>
			<section className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4">
				<p className="tabular-nums">{t("members", { count: team.length })}</p>
				{roleAllows(ctx.role, "members:read") && (
					<Link
						href="/members"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("toMembers")}
					</Link>
				)}
			</section>
			<p className="text-muted-foreground text-sm">{t("next")}</p>
		</div>
	);
}
