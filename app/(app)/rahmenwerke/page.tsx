import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CoverageBar } from "@/components/entity/coverage-bar";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { frameworkAuditStates } from "@/lib/compliance/framework-audit";
import { STATIC_CATALOG } from "@/lib/compliance/org-catalog";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { loadAuditRegimeContext } from "@/lib/compliance/queries-audit-regimes";
import { loadOrgStatus } from "@/lib/compliance/queries-next-steps";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";
import { cn } from "@/lib/utils";

export default async function FrameworksPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Frameworks");
	const tr = await getTranslations("Readiness");
	const cov = await getOrgCoverageCached(ctx);
	// eingeschaltete eigene Rahmenwerke (R4) stehen nach den Klick-Rahmenwerken
	const custom = [...(cov?.catalog.custom ?? [])].filter(
		([, info]) => info.status === "active",
	);
	const today = new Date().toISOString().slice(0, 10);
	const { fws, audit, readiness } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const rows = await listOrgFrameworks(tx, ctx.orgId);
		const names = await userNames(tx, [
			...rows.map((r) => r.ownerUserId),
			...custom.map(([, info]) => info.ownerUserId),
		]);
		const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		const [regimes, status] = await Promise.all([
			loadAuditRegimeContext(tx, ctx.orgId),
			loadOrgStatus(tx, ctx.orgId),
		]);
		const list = [
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
		return {
			fws: list,
			audit: frameworkAuditStates(
				list.map((f) => f.slug),
				regimes.settings,
				regimes.registered,
				today,
			),
			readiness: new Map(status.readiness.map((r) => [r.framework, r])),
		};
	});
	const labels = {
		covered: t("covered"),
		partial: t("partial"),
		open: t("open"),
		applicable: t("applicable"),
	};

	return (
		<>
			<SectionSwitch group="frameworks" current="/rahmenwerke" ctx={ctx} />

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
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{fws.map((f) => {
						const meta = (cov?.catalog ?? STATIC_CATALOG).frameworkBySlug.get(
							f.slug,
						);
						const bucket = cov?.result.byFramework.get(f.slug);
						// ohne anwendbare Anforderungen (z. B. gilt erst später) kein Ring
						const hasIndex =
							(meta?.requirements.length ?? 0) > 0 &&
							(bucket?.applicable ?? 0) > 0;
						const state = audit.get(f.slug) ?? { kind: "none" as const };
						const ready = readiness.get(f.slug);
						const value = bucket?.coveragePct ?? 0;
						return (
							<Card
								key={f.slug}
								className={cn(
									"min-w-0",
									state.kind === "running" && "ring-2 ring-primary",
								)}
							>
								<CardHeader>
									<div className="flex items-start gap-4">
										{hasIndex && bucket && (
											<Ring
												value={value}
												size={64}
												tone={value === 100 ? "success" : "primary"}
												label={t("ringLabel", { pct: Math.round(value) })}
											>
												{Math.round(value)}&nbsp;%
											</Ring>
										)}
										<div className="flex min-w-0 flex-col gap-1">
											<CardTitle className="text-headline">
												<Link
													href={`/rahmenwerke/${f.slug}`}
													className="hit-area underline-offset-4 hover:underline"
												>
													{f.name}
												</Link>
											</CardTitle>
											<p
												className={cn(
													"text-footnote",
													state.kind === "running"
														? "font-semibold text-primary"
														: state.kind === "upcoming"
															? "text-foreground"
															: "text-muted-foreground",
												)}
											>
												{state.kind === "running"
													? t("auditRunning")
													: state.kind === "upcoming"
														? t(`auditIn_${state.unit}`, { n: state.n })
														: t("auditNone")}
											</p>
											{ready && ready.score !== null && (
												<p className="text-footnote text-muted-foreground">
													{t("readinessLine", {
														score: ready.score,
														verdict: tr(`verdict_${ready.verdict}`),
													})}
												</p>
											)}
											{f.custom && (
												<Badge variant="muted" className="w-fit">
													{t("customBadge")}
												</Badge>
											)}
										</div>
									</div>
									<CardDescription className="line-clamp-1">
										{meta?.description}
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-2 text-subhead">
									{hasIndex && bucket ? (
										<CoverageBar bucket={bucket} labels={labels} compact />
									) : (
										<p className="text-muted-foreground text-footnote">
											{(meta?.requirements.length ?? 0) > 0
												? t("tileNotYet")
												: t("noIndex")}
										</p>
									)}
									<p className="flex flex-wrap justify-between gap-x-3 text-footnote text-muted-foreground">
										{hasIndex && bucket && (
											<span>
												{t("tileCounts", {
													covered: bucket.covered,
													applicable: bucket.applicable,
												})}
											</span>
										)}
										<span className="min-w-0 truncate">
											{t("tileOwner", { name: f.ownerName ?? "–" })}
										</span>
									</p>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
		</>
	);
}
