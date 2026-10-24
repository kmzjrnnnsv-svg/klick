import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignOutButton, SwitchOrgButton } from "@/components/auth/org-choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { redirectFor } from "@/lib/auth/gates";
import { getSessionCtx } from "@/lib/auth/guards";
import { primaryMembershipCount, roleLabel } from "@/lib/auth/memberships";
import { listUserMemberships } from "@/lib/auth/org";
import { AuthError, checkSessionRules } from "@/lib/auth/session-rules";

// Organisation wählen (ADR-018): für Konten mit mehreren Zugängen, und wenn
// der Zugang zur aktiven Org abgelaufen ist, es aber andere gibt.
export default async function OrganisationsPage({
	searchParams,
}: {
	searchParams: Promise<{ grund?: string }>;
}) {
	const ctx = await getSessionCtx();
	if (!ctx) redirect("/login");
	try {
		checkSessionRules(ctx);
	} catch (e) {
		if (e instanceof AuthError) redirect(redirectFor(e.code));
		throw e;
	}
	const t = await getTranslations("Organisations");
	const { grund } = await searchParams;
	const list = await listUserMemberships(ctx.user.id);
	if (list.length === 0) redirect("/onboarding");
	const active = ctx.session.activeOrganizationId ?? null;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const ownMissing = primaryMembershipCount(list.map((m) => m.role)) === 0;

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<p className="mt-2 text-muted-foreground text-subhead">{t("lead")}</p>
			</div>
			{grund === "zugang-abgelaufen" && (
				<Alert variant="warning">
					<AlertDescription>{t("expiredNotice")}</AlertDescription>
				</Alert>
			)}
			<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
				{list.map((m) => {
					const current = m.organizationId === active && !m.expired;
					return (
						<li
							key={m.memberId}
							className="flex flex-wrap items-center justify-between gap-3 p-4"
						>
							<div className="min-w-0">
								<p className="break-words font-medium">
									{m.orgName}
									{current && (
										<Badge variant="secondary" className="ml-2">
											{t("current")}
										</Badge>
									)}
								</p>
								<p className="text-muted-foreground text-footnote">
									{roleLabel(m.role)}
									{m.accessUntil &&
										` · ${m.expired ? t("expiredOn") : t("until")} ${fmt.format(m.accessUntil)}`}
								</p>
							</div>
							{current ? (
								<Link
									href="/heute"
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									{t("open")}
								</Link>
							) : (
								<SwitchOrgButton
									orgId={m.organizationId}
									label={t("open")}
									disabled={m.expired}
								/>
							)}
						</li>
					);
				})}
			</ul>
			<div className="flex flex-wrap items-center gap-3">
				{ownMissing && (
					<Link
						href="/onboarding"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						{t("createOwn")}
					</Link>
				)}
				<SignOutButton label={t("signOut")} />
			</div>
		</div>
	);
}
