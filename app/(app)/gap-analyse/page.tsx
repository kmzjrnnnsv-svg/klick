import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NewAssessmentDialog } from "@/components/assessments/new-assessment-dialog";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import { listAssessments } from "@/lib/compliance/queries-assessments";
import { readOrg } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";

const STATUS_TONE = {
	draft: "muted",
	in_progress: "warning",
	submitted: "default",
	in_review: "default",
	completed: "success",
	cancelled: "muted",
} as const;

// Gap-Analysen der Org: Fragebogen → Bewertung → Maßnahmen → Ergebnis.
export default async function GapAnalysisPage() {
	const ctx = await requireOrgPage({ assessment: ["read"] });
	const t = await getTranslations("Assessment");
	const { rows, frameworks } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listAssessments(tx, ctx.orgId, "self"),
		frameworks: await listOrgFrameworks(tx, ctx.orgId),
	}));
	const canCreate = allows(ctx, { assessment: ["create"] });
	const fwOptions = frameworks
		.filter(
			(f) => (FRAMEWORK_BY_SLUG.get(f.slug)?.requirements.length ?? 0) > 0,
		)
		.map((f) => ({ slug: f.slug, name: f.name }));
	const create = canCreate ? (
		<NewAssessmentDialog
			frameworks={fwOptions}
			hasPrevious={rows.some((r) => r.status !== "cancelled")}
		/>
	) : null;

	return (
		<>
			<PageHeader title={t("title")} lead={t("lead")} actions={create} />
			{rows.length === 0 ? (
				<EmptyState title={t("empty")} lead={t("emptyLead")} actions={create} />
			) : (
				<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
					{rows.map((r) => {
						const pct =
							r.total > 0 ? Math.round((100 * r.answered) / r.total) : 0;
						return (
							<li key={r.id}>
								<Link
									href={`/gap-analyse/${r.id}`}
									className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
								>
									<span className="flex min-w-0 flex-1 flex-col gap-1">
										<span className="flex flex-wrap items-center gap-2">
											<span className="font-mono text-muted-foreground text-footnote">
												{r.code}
											</span>
											<span className="min-w-0 truncate font-medium">
												{r.title}
											</span>
											<Badge variant={STATUS_TONE[r.status]}>
												{t(`status_${r.status}`)}
											</Badge>
										</span>
										<span className="flex flex-wrap gap-1">
											{r.frameworks.map((s) => (
												<Badge key={s} variant="muted" className="">
													{shortFrameworkName(s)}
												</Badge>
											))}
										</span>
									</span>
									<span className="flex shrink-0 items-center gap-4 text-subhead">
										{r.score !== null && (
											<span className="font-semibold text-title-3 tabular-nums">
												{r.score}
											</span>
										)}
										<span className="flex w-40 flex-col gap-1">
											<span className="text-muted-foreground text-footnote">
												{t("progress", {
													answered: r.answered,
													total: r.total,
												})}
											</span>
											<span className="h-1.5 overflow-hidden rounded-full bg-muted">
												<span
													className="block h-full rounded-full bg-primary"
													style={{ width: `${pct}%` }}
												/>
											</span>
										</span>
										<span className="w-24 text-right text-muted-foreground text-footnote">
											{fmtDate.format(r.updatedAt)}
										</span>
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</>
	);
}
