import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	ApplyObligationSeedButton,
	ObligationSettings,
	RunActions,
} from "@/components/calendar/calendar-actions";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { upcomingLegalChanges } from "@/lib/compliance/catalog/regulatory-calendar";
import { groupByMonth, runState } from "@/lib/compliance/obligations";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import {
	getOrgProfile,
	listEvidence,
	listMembersForPicker,
} from "@/lib/compliance/queries";
import {
	listObligationRuns,
	listObligations,
} from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATE_TONE = {
	upcoming: "outline",
	due: "warning",
	overdue: "destructive",
	done: "success",
	waived: "muted",
} as const;
const MONTHS = [
	"Januar",
	"Februar",
	"März",
	"April",
	"Mai",
	"Juni",
	"Juli",
	"August",
	"September",
	"Oktober",
	"November",
	"Dezember",
];

export default async function CalendarPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ obligation: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "jahr";
	const now = new Date();
	const year = Number(one(sp.jahr)) || now.getFullYear();
	const t = await getTranslations("Calendar");
	const canEdit = roleAllows(ctx.orgRole, { obligation: ["update"] });
	const canComplete = roleAllows(ctx.orgRole, { obligation: ["complete"] });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const profile = await getOrgProfile(tx, ctx.orgId);
		return {
			frameworks: profile?.frameworks ?? [],
			runs: await listObligationRuns(tx, ctx.orgId, {
				from: `${year}-01-01`,
				to: `${year}-12-31`,
			}),
			obligations:
				tab === "pflichten" ? await listObligations(tx, ctx.orgId) : [],
			members: await listMembersForPicker(tx, ctx.orgId),
			evidence: canComplete ? await listEvidence(tx, ctx.orgId) : [],
		};
	});
	const byMonth = groupByMonth(data.runs, year);
	const openCount = data.runs.filter(
		(r) => r.status !== "done" && r.status !== "waived",
	).length;
	const overdue = data.runs.filter(
		(r) => runState(r, r.leadDays, now) === "overdue",
	).length;
	const legal = upcomingLegalChanges(now, 730, data.frameworks);
	const evidenceOptions = data.evidence.map((e) => ({
		id: e.id,
		title: e.title,
	}));

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={canEdit ? <ApplyObligationSeedButton /> : undefined}
			/>
			<UrlTabs
				base="/kalender"
				active={tab}
				tabs={[
					{ value: "jahr", label: t("tabYear"), count: openCount || undefined },
					{ value: "pflichten", label: t("tabObligations") },
					{
						value: "rechtsaenderungen",
						label: t("tabLegal"),
						count: legal.length || undefined,
					},
				]}
			/>

			{tab === "jahr" && (
				<section className="flex flex-col gap-6">
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<Link
							href={`/kalender?tab=jahr&jahr=${year - 1}`}
							className="rounded-md border px-2 py-1 hover:bg-muted"
						>
							← {year - 1}
						</Link>
						<span className="font-serif-display text-2xl text-primary">
							{year}
						</span>
						<Link
							href={`/kalender?tab=jahr&jahr=${year + 1}`}
							className="rounded-md border px-2 py-1 hover:bg-muted"
						>
							{year + 1} →
						</Link>
						<span className="ml-auto text-muted-foreground text-xs">
							{t("yearStats", { open: openCount, overdue })}
						</span>
					</div>
					{data.runs.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							requiredBy={t("requiredBy")}
							actions={
								canEdit ? (
									<ApplyObligationSeedButton variant="brown" />
								) : undefined
							}
						/>
					) : (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{MONTHS.map((name, idx) => {
								const items = byMonth.get(idx + 1) ?? [];
								const isCurrent =
									year === now.getFullYear() && idx === now.getMonth();
								return (
									<section
										key={name}
										className={`rounded-md border p-3 text-sm ${isCurrent ? "border-primary/50" : ""}`}
									>
										<h2 className="lv-eyebrow mb-2 flex items-center justify-between text-[0.6rem] text-muted-foreground">
											{name}
											<span>{items.length}</span>
										</h2>
										{items.length === 0 ? (
											<p className="text-muted-foreground text-xs">—</p>
										) : (
											<ul className="flex flex-col divide-y divide-border/60">
												{items.map((r) => {
													const state = runState(r, r.leadDays, now);
													return (
														<li key={r.id} className="flex flex-col gap-1 py-2">
															<div className="flex items-start gap-2">
																<span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
																	{r.dueAt.slice(8, 10)}.{r.dueAt.slice(5, 7)}.
																</span>
																<div className="min-w-0 flex-1">
																	<p
																		className="truncate font-medium"
																		title={r.legalBasis ?? ""}
																	>
																		{r.title}
																	</p>
																	<p className="text-muted-foreground text-xs">
																		{t(`recipient_${r.recipient}`)} ·{" "}
																		{r.periodLabel}
																		{r.ownerName ? ` · ${r.ownerName}` : ""}
																	</p>
																</div>
																<Badge variant={STATE_TONE[state]}>
																	{t(`state_${state}`)}
																</Badge>
															</div>
															{canComplete &&
																state !== "done" &&
																state !== "waived" && (
																	<RunActions
																		runId={r.id}
																		evidence={evidenceOptions}
																	/>
																)}
															{r.status === "done" && r.completedByName && (
																<p className="text-muted-foreground text-[0.65rem]">
																	{t("doneBy", { name: r.completedByName })}
																	{r.evidenceId
																		? ` · ${t("withEvidence")}`
																		: ""}
																</p>
															)}
														</li>
													);
												})}
											</ul>
										)}
									</section>
								);
							})}
						</div>
					)}
				</section>
			)}

			{tab === "pflichten" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">
						{t("obligationsLead")}
					</p>
					{data.obligations.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							actions={
								canEdit ? (
									<ApplyObligationSeedButton variant="brown" />
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("obligation")}</TableHead>
									<TableHead className="w-28">{t("frequency")}</TableHead>
									<TableHead className="w-32">{t("recipient")}</TableHead>
									<TableHead className="w-28">{t("framework")}</TableHead>
									<TableHead className="w-80">{t("ownerLead")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.obligations.map((o) => (
									<TableRow key={o.id} className={o.active ? "" : "opacity-60"}>
										<TableCell>
											<p className="font-medium">{o.title}</p>
											<p className="text-muted-foreground text-xs">
												{o.code} · {o.legalBasis}
											</p>
										</TableCell>
										<TableCell className="text-xs">
											{t(`freq_${o.frequency}`)}
										</TableCell>
										<TableCell className="text-xs">
											{t(`recipient_${o.recipient}`)}
										</TableCell>
										<TableCell className="text-xs">
											{o.frameworkSlug
												? shortFrameworkName(o.frameworkSlug)
												: "—"}
										</TableCell>
										<TableCell>
											{canEdit ? (
												<ObligationSettings
													obligationId={o.id}
													ownerUserId={o.ownerUserId}
													leadDays={o.leadDays}
													active={o.active}
													members={data.members}
												/>
											) : (
												<span className="flex items-center gap-2 text-xs">
													<UserChip name={o.ownerName} /> · {o.leadDays}{" "}
													{t("daysLead")}
												</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "rechtsaenderungen" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("legalLead")}</p>
					{legal.length === 0 ? (
						<p className="text-sm">{t("legalEmpty")}</p>
					) : (
						<ol className="flex flex-col gap-3">
							{legal.map((c) => (
								<li
									key={`${c.date}-${c.title}`}
									className="flex flex-col gap-1 rounded-md border p-3 text-sm"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-mono text-xs">
											{fmtDate.format(new Date(c.date))}
										</span>
										<span className="font-medium">{c.title}</span>
										<Badge
											variant={
												c.status === "draft"
													? "muted"
													: c.status === "expected"
														? "outline"
														: "default"
											}
										>
											{t(`legalStatus_${c.status}`)}
										</Badge>
										<span className="ml-auto flex gap-1">
											{c.frameworks.map((f) => (
												<Badge
													key={f}
													variant="muted"
													className="normal-case tracking-normal"
												>
													{shortFrameworkName(f)}
												</Badge>
											))}
										</span>
									</div>
									<p className="text-muted-foreground text-xs">
										{c.description}
									</p>
									<p className="text-muted-foreground text-[0.65rem]">
										{c.legalBasis}
									</p>
								</li>
							))}
						</ol>
					)}
				</section>
			)}
		</>
	);
}
