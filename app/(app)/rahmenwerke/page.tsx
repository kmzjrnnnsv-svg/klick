import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { STATIC_CATALOG } from "@/lib/compliance/org-catalog";
import { fmtDate, getOrgCoverageCached, pct } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";

export default async function FrameworksPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Frameworks");
	const cov = await getOrgCoverageCached(ctx);
	// eingeschaltete eigene Rahmenwerke (R4) stehen nach den Klick-Rahmenwerken
	const custom = [...(cov?.catalog.custom ?? [])].filter(
		([, info]) => info.status === "active",
	);
	const fws = await readOrg(toOrgCtx(ctx), async (tx) => {
		const rows = await listOrgFrameworks(tx, ctx.orgId);
		const names = await userNames(tx, [
			...rows.map((r) => r.ownerUserId),
			...custom.map(([, info]) => info.ownerUserId),
		]);
		const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		return [
			...rows.map((r) => ({
				slug: r.slug,
				name: r.name,
				enabledAt: r.enabledAt,
				ownerName: nameOf(r.ownerUserId),
				custom: false,
			})),
			...custom.map(([slug, info]) => ({
				slug,
				name: cov?.catalog.frameworkBySlug.get(slug)?.name ?? slug,
				enabledAt: info.activatedAt ?? new Date(),
				ownerName: nameOf(info.ownerUserId),
				custom: true,
			})),
		];
	});
	const labels = {
		covered: t("covered"),
		partial: t("partial"),
		open: t("open"),
		applicable: t("applicable"),
	};

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					<Button asChild variant="outline" size="sm">
						<Link href="/einstellungen?tab=frameworks">{t("add")}</Link>
					</Button>
				}
			/>
			{fws.length === 0 ? (
				<EmptyState title={t("title")} lead={t("addLead")} />
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					{fws.map((f) => {
						const meta = (cov?.catalog ?? STATIC_CATALOG).frameworkBySlug.get(
							f.slug,
						);
						const bucket = cov?.result.byFramework.get(f.slug);
						const hasIndex = (meta?.requirements.length ?? 0) > 0;
						return (
							<Card key={f.slug} className="min-w-0">
								<CardHeader>
									<CardTitle className="flex items-start justify-between gap-2 text-headline">
										<Link
											href={`/rahmenwerke/${f.slug}`}
											className="hit-area min-w-0 underline-offset-4 hover:underline"
										>
											{f.name}
										</Link>
										{bucket && hasIndex && (
											<Badge
												variant={
													bucket.coveragePct === 100 ? "success" : "outline"
												}
											>
												{pct(bucket.coveragePct)}
											</Badge>
										)}
									</CardTitle>
									{f.custom && (
										<Badge variant="muted" className="w-fit">
											{t("customBadge")}
										</Badge>
									)}
									<CardDescription className="line-clamp-2">
										{meta?.description}
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-3 text-subhead">
									{hasIndex && bucket ? (
										<CoverageBar bucket={bucket} labels={labels} />
									) : (
										<p className="text-muted-foreground text-footnote">
											{t("noIndex")}
										</p>
									)}
									<dl className="grid grid-cols-2 gap-2 text-muted-foreground text-footnote">
										<dt>{t("owner")}</dt>
										<dd className="text-foreground">{f.ownerName ?? "—"}</dd>
										<dt>{t("enabledAt")}</dt>
										<dd className="text-foreground">
											{fmtDate.format(f.enabledAt)}
										</dd>
									</dl>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
		</>
	);
}
