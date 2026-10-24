import { OrgChoice } from "@wallet/components/auth/org-choice";
import { SignOutButton } from "@wallet/components/auth/sign-out-button";
import { requireSessionPage, safeNext } from "@wallet/lib/auth/gates";
import { ROLE_LABEL } from "@wallet/lib/auth/permissions";
import { listMemberships } from "@wallet/lib/orgs/memberships";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Organisation wählen" };

export default async function OrgsPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const t = await getTranslations("Orgs");
	const ctx = await requireSessionPage("/orgs");
	const next = safeNext((await searchParams).next) ?? "/";
	const orgs = await listMemberships(ctx.user.id);
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-2">{t("title")}</h1>
				<p className="text-muted-foreground">
					{orgs.length ? t("lead") : t("none")}
				</p>
			</div>
			{orgs.length > 0 && (
				<OrgChoice
					next={next}
					orgs={orgs.map((o) => ({
						orgId: o.orgId,
						name: o.name,
						role: ROLE_LABEL[o.role],
					}))}
				/>
			)}
			<div>
				<SignOutButton />
			</div>
		</div>
	);
}
