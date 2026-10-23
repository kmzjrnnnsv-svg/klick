import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { deleteManagementReport } from "@/app/actions/management-reports";
import { EmptyState } from "@/components/entity/empty-state";
import { UserChip } from "@/components/entity/user-chip";
import { EntityEvidence } from "@/components/evidence-studio/entity-evidence";
import {
	ReportForm,
	SubmitReportButton,
} from "@/components/management-review/report-forms";
import { ReviewDigestView } from "@/components/management-review/review-digest";
import { DeleteRowButton } from "@/components/organisation/governance-forms";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { managementReports } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	applicableReportKinds,
	REPORT_KIND_BY_KEY,
	REPORT_KINDS,
	reportSchedule,
	suggestPeriod,
} from "@/lib/compliance/catalog/management-reports";
import { reportFigures } from "@/lib/compliance/management-report-figures";
import { asDigest } from "@/lib/compliance/management-review-digest";
import { fmtDate } from "@/lib/compliance/page-data";
import { getOrgProfile, userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { berlinToday } from "@/lib/evidence-studio/queries";

// Berichte an die Geschäftsleitung (N3): je Funktion ein Bericht mit
// Einschätzung, Kennzahlen aus Klick und Maßnahmen; vorgelegt wird er zum
// Nachweis NW-GL-BERICHT, den die Geschäftsleitung per Passkey zur
// Kenntnis nimmt.
export default async function ReportsPage() {
	const ctx = await requireOrgPage({ management_review: ["read"] });
	const t = await getTranslations("Reports");
	const tf = await getTranslations("Functions");
	const tm = await getTranslations("ManagementReview");
	const canCreate = allows(ctx, { management_review: ["create"] });
	const canUpdate = allows(ctx, { management_review: ["update"] });
	const today = berlinToday();
	const { reports, kinds, names, previews } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const profile = await getOrgProfile(tx, ctx.orgId);
			const reports = await tx
				.select()
				.from(managementReports)
				.where(eq(managementReports.organizationId, ctx.orgId))
				.orderBy(
					desc(managementReports.periodTo),
					desc(managementReports.createdAt),
				);
			const previews = new Map(
				await Promise.all(
					reports
						.filter((r) => r.status === "draft")
						.slice(0, 5)
						.map(async (r) => {
							const kind = REPORT_KIND_BY_KEY.get(r.kind);
							return [
								r.id,
								kind
									? await reportFigures(tx, ctx.orgId, kind, {
											from: r.periodFrom,
											to: r.periodTo,
										})
									: null,
							] as const;
						}),
				),
			);
			return {
				reports,
				kinds: applicableReportKinds(profile?.frameworks ?? []),
				names: await userNames(
					tx,
					reports.map((r) => r.authorUserId),
				),
				previews,
			};
		},
	);
	const schedule = reportSchedule(kinds, reports, today);
	const kindOptions = [
		...kinds,
		...REPORT_KINDS.filter((k) => !kinds.includes(k)),
	].map((k) => ({
		kind: k.kind,
		title: k.title,
		from: suggestPeriod(
			schedule.find((s) => s.kind.kind === k.kind)?.lastPeriodTo ?? null,
			today,
		).from,
	}));
	const first = kindOptions[0];
	const draftFor = (kind: (typeof kindOptions)[number]) => ({
		kind: kind.kind,
		title: kind.title,
		periodFrom: kind.from,
		periodTo: today,
	});
	const digestLabels = {
		period: tm("digestPeriod"),
		open: tm("digestOpen"),
		nothing: tm("digestNothing"),
	};

	return (
		<>
			<PageHeader
				title={t("pageTitle")}
				lead={t("lead")}
				actions={
					canCreate && first ? (
						<ReportForm initial={draftFor(first)} kinds={kindOptions} />
					) : undefined
				}
			/>
			{schedule.length > 0 && (
				<section aria-labelledby="rp-due" className="mb-8 flex flex-col gap-3">
					<h2 id="rp-due" className="font-serif-display text-lg text-primary">
						{t("scheduleTitle")}
					</h2>
					<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{schedule.map((s) => {
							const opt = kindOptions.find((o) => o.kind === s.kind.kind);
							return (
								<li
									key={s.kind.kind}
									className="flex flex-col gap-2 rounded-md border p-3 text-sm"
								>
									<div className="flex items-start justify-between gap-2">
										<span className="font-medium">{s.kind.title}</span>
										<Badge
											variant={
												s.state === "due"
													? "warning"
													: s.state === "draft"
														? "outline"
														: "success"
											}
										>
											{t(`state_${s.state}`)}
										</Badge>
									</div>
									<p className="text-muted-foreground text-xs">
										{s.kind.author ? `${tf(s.kind.author)} · ` : ""}
										{s.kind.legalBasis}
									</p>
									<p className="text-muted-foreground text-xs">
										{s.lastPeriodTo
											? t("lastUntil", {
													date: fmtDate.format(new Date(s.lastPeriodTo)),
												})
											: t("never")}
										{s.nextDue &&
											` · ${t("nextDue", { date: fmtDate.format(new Date(s.nextDue)) })}`}
									</p>
									{canCreate && opt && s.state === "due" && (
										<div>
											<ReportForm
												initial={draftFor(opt)}
												kinds={kindOptions}
												triggerLabel={t("startReport")}
											/>
										</div>
									)}
								</li>
							);
						})}
					</ul>
				</section>
			)}
			{reports.length === 0 ? (
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					actions={
						canCreate && first ? (
							<ReportForm initial={draftFor(first)} kinds={kindOptions} />
						) : undefined
					}
				/>
			) : (
				<div className="flex flex-col gap-6">
					{reports.map((r) => {
						const def = REPORT_KIND_BY_KEY.get(r.kind);
						const digest =
							r.status === "submitted"
								? asDigest(r.figures)
								: (previews.get(r.id) ?? null);
						return (
							<article
								key={r.id}
								className="flex flex-col gap-4 rounded-md border p-4 text-sm"
							>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
									<h2 className="min-w-0 break-words font-serif-display text-xl text-primary">
										{r.title}
									</h2>
									<Badge
										variant={r.status === "submitted" ? "success" : "outline"}
									>
										{t(`status_${r.status}`)}
									</Badge>
									<span className="text-muted-foreground text-xs">
										{fmtDate.format(new Date(r.periodFrom))} –{" "}
										{fmtDate.format(new Date(r.periodTo))}
										{def && def.title !== r.title ? ` · ${def.title}` : ""}
									</span>
									{r.authorUserId && (
										<span className="text-muted-foreground text-xs">
											{t("author")}:{" "}
											<UserChip name={names.get(r.authorUserId) ?? null} />
										</span>
									)}
								</div>
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
									<div className="flex flex-col gap-1">
										<h3 className="font-medium">{t("summary")}</h3>
										<p className="whitespace-pre-line break-words text-muted-foreground">
											{r.summary || t("noSummary")}
										</p>
									</div>
									<div className="flex flex-col gap-1">
										<h3 className="font-medium">{t("measures")}</h3>
										<p className="whitespace-pre-line break-words text-muted-foreground">
											{r.measures || t("noMeasures")}
										</p>
									</div>
								</div>
								{digest && digest.sections.length > 0 && (
									<details
										className="rounded-md border p-3"
										open={r.status === "draft"}
									>
										<summary className="cursor-pointer font-medium">
											{r.status === "draft"
												? t("figuresLive")
												: t("figuresSnapshot", {
														date: r.submittedAt
															? fmtDate.format(r.submittedAt)
															: "",
													})}
										</summary>
										<div className="mt-3">
											<ReviewDigestView digest={digest} labels={digestLabels} />
										</div>
									</details>
								)}
								<div className="flex flex-wrap items-center gap-2">
									{r.status === "draft" ? (
										<>
											{canCreate && (
												<ReportForm
													initial={{
														id: r.id,
														kind: r.kind,
														title: r.title,
														periodFrom: r.periodFrom,
														periodTo: r.periodTo,
														summary: r.summary,
														measures: r.measures,
													}}
													kinds={kindOptions}
												/>
											)}
											{canUpdate && <SubmitReportButton id={r.id} />}
											{canUpdate && (
												<DeleteRowButton
													id={r.id}
													action={deleteManagementReport}
													label={t("delete")}
												/>
											)}
										</>
									) : (
										<EntityEvidence
											ctx={ctx}
											code="NW-GL-BERICHT"
											entityId={r.id}
										/>
									)}
								</div>
							</article>
						);
					})}
				</div>
			)}
		</>
	);
}
