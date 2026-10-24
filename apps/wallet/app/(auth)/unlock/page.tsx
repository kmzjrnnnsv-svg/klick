import { UnlockPanel } from "@wallet/components/auth/unlock-panel";
import { requireOrgPage, safeNext } from "@wallet/lib/auth/gates";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Entsperren" };

export default async function UnlockPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const t = await getTranslations("Unlock");
	const next = safeNext((await searchParams).next) ?? "/";
	const ctx = await requireOrgPage(`/unlock?next=${encodeURIComponent(next)}`);
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-serif-display text-2xl">{t("title")}</h1>
				<p className="text-muted-foreground">
					{t("lead", { org: ctx.orgName })}
				</p>
			</div>
			<UnlockPanel next={next} />
		</div>
	);
}
