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
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { fmtDate, getOrgCoverageCached, pct } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";

export default async function FrameworksPage() {
	const ctx = await requireOrg();
	const t = await getTranslations("Frameworks");
	const [cov, fws] = await Promise.all([
		getOrgCoverageCached(ctx),
		readOrg(toOrgCtx(ctx), async (tx) => {
			const rows = await listOrgFrameworks(tx, ctx.orgId);
			const names = await userNames(
				tx,
				rows.map((r) => r.ownerUserId),
			);
			return rows.map((r) => ({
				...r,
				ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
			}));
		}),
	]);
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
				<div className="grid gap-4 md:grid-cols-2">
					{fws.map((f) => {
						const meta = FRAMEWORK_BY_SLUG.get(f.slug);
						const bucket = cov?.result.byFramework.get(f.slug);
						const hasIndex = (meta?.requirements.length ?? 0) > 0;
						return (
							<Card key={f.slug}>
								<CardHeader>
									<CardTitle className="flex items-start justify-between gap-2 text-base">
										<Link
											href={`/rahmenwerke/${f.slug}`}
											className="hover:underline underline-offset-4"
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
									<CardDescription className="line-clamp-2">
										{meta?.description}
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-3 text-sm">
									{hasIndex && bucket ? (
										<CoverageBar bucket={bucket} labels={labels} />
									) : (
										<p className="text-muted-foreground text-xs">
											{t("noIndex")}
										</p>
									)}
									<dl className="grid grid-cols-2 gap-2 text-muted-foreground text-xs">
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
