import { getTranslations } from "next-intl/server";
import {
	GANTT_TONE,
	Gantt,
	type GanttGroup,
	type GanttTone,
} from "@/components/charts/gantt";
import { buttonVariants } from "@/components/ui/button";
import type { MeasureKind } from "@/lib/assessments/measures";
import type { ImplementationPlan } from "@/lib/assessments/plan-server";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { DurationSelect, PlanEditor } from "./plan-editor";

// Umsetzungsplan im Ergebnis der Gap-Analyse (Teil C): Kopf mit Beginn,
// Gleichzeitigkeit und Ende, je Rahmenwerk „bereit ab“, darunter der
// Balkenplan nach Zuständigkeit. Am Handy eine Liste nach Monaten, für alle
// eine Tabelle zum Aufklappen. Schätzung, kein Versprechen.

const KIND_TONE: Record<MeasureKind, GanttTone> = {
	implement: "primary",
	clarify: "warning",
	evidence: "success",
};

const dateFmt = new Intl.DateTimeFormat("de-DE", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("de-DE", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const fmt = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

export async function ImplementationPlanSection({
	assessmentId,
	plan,
	editable,
	today,
	laneLabel,
	frameworkName,
	exportable = false,
}: {
	assessmentId: string;
	plan: ImplementationPlan;
	editable: boolean;
	// Recht export:create: PDF und CSV des Plans
	exportable?: boolean;
	today: string;
	laneLabel: (lane: string) => string;
	frameworkName: (slug: string) => string;
}) {
	const t = await getTranslations("Assessment");
	const { schedule, readiness, settings } = plan;
	const title = (code: string) => CONTROL_BY_CODE.get(code)?.title ?? code;

	if (schedule.items.length === 0)
		return (
			<section id="umsetzungsplan" className="flex flex-col gap-2">
				<h2 className="font-semibold text-title-3">{t("planTitle")}</h2>
				<p className="text-muted-foreground text-subhead">{t("planEmpty")}</p>
			</section>
		);

	// Zeilen nach Zuständigkeit, in Reihenfolge des Beginns
	const lanes = new Map<string, typeof schedule.items>();
	for (const i of [...schedule.items].sort(
		(a, b) =>
			a.startDay - b.startDay || a.controlCode.localeCompare(b.controlCode),
	)) {
		const list = lanes.get(i.lane) ?? [];
		list.push(i);
		lanes.set(i.lane, list);
	}
	const end = schedule.end ?? schedule.start;
	const barLabel = (code: string, from: string, to: string) =>
		t("planBar", { code, title: title(code), from: fmt(from), to: fmt(to) });
	const groups: GanttGroup[] = [
		{
			key: "rahmenwerke",
			label: t("planFrameworks"),
			rows: readiness
				.filter((r) => r.readyAt && r.readyDay && r.readyDay > 0)
				.map((r) => ({
					key: `fw:${r.slug}`,
					label: t("planFrameworkRow", {
						name: frameworkName(r.slug),
						count: r.measures,
					}),
					start: schedule.start,
					end: r.readyAt as string,
					tone: "muted" as const,
					ariaLabel: t("planFrameworkBar", {
						name: frameworkName(r.slug),
						date: fmt(r.readyAt as string),
						codes: r.chain.join(", ") || "–",
					}),
				})),
		},
		...[...lanes].map(([lane, items]) => ({
			key: lane,
			label: laneLabel(lane),
			rows: items.map((i) => ({
				key: i.controlCode,
				label: (
					<>
						<span className="font-mono text-footnote" translate="no">
							{i.controlCode}
						</span>{" "}
						{title(i.controlCode)}
						{i.after.length > 0 && (
							<span className="text-muted-foreground text-footnote">
								{" "}
								· {t("planAfter", { codes: i.after.join(", ") })}
							</span>
						)}
					</>
				),
				aside: <DurationSelect code={i.controlCode} estimated={i.estimated} />,
				start: i.start,
				end: i.end,
				tone: KIND_TONE[i.kind],
				href: `/controls/${encodeURIComponent(i.controlCode)}`,
				ariaLabel: barLabel(i.controlCode, i.start, i.end),
			})),
		})),
	].filter((g) => g.rows.length > 0);

	// Liste nach Monaten (Handy)
	const byMonth = new Map<string, typeof schedule.items>();
	for (const i of [...schedule.items].sort((a, b) => a.startDay - b.startDay)) {
		const m = i.start.slice(0, 7);
		const list = byMonth.get(m) ?? [];
		list.push(i);
		byMonth.set(m, list);
	}

	return (
		<section id="umsetzungsplan" className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-title-3">{t("planTitle")}</h2>
				<p className="max-w-3xl text-muted-foreground text-subhead">
					{t("planLead")}
				</p>
			</div>
			<PlanEditor
				assessmentId={assessmentId}
				editable={editable}
				initial={{
					start: settings.start,
					capacity: settings.capacity,
					overrides: settings.overrides,
				}}
			>
				<div className="flex flex-col gap-4">
					<p className="font-medium">
						{t("planEnd", { date: fmt(end) })}{" "}
						<span className="font-normal text-muted-foreground">
							{t("planSummary", {
								count: schedule.items.length,
								days: schedule.workdays,
							})}
						</span>
					</p>
					<ul
						className="grid grid-cols-1 gap-x-6 gap-y-1 text-subhead sm:grid-cols-2 lg:grid-cols-3"
						aria-label={t("planFrameworks")}
					>
						{readiness.map((r) => (
							<li key={r.slug} className="flex min-w-0 flex-col py-0.5">
								<span className="min-w-0">
									<span className="font-medium">{frameworkName(r.slug)}</span>{" "}
									<span className="text-muted-foreground">
										{r.readyDay === 0
											? t("planReadyNoneShort")
											: r.readyAt
												? t("planReadyShort", { date: fmt(r.readyAt) })
												: ""}
									</span>
								</span>
								{r.missing > 0 && (
									<span className="text-footnote text-muted-foreground">
										{t("planMissing", { count: r.missing })}
									</span>
								)}
							</li>
						))}
					</ul>
					<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote text-muted-foreground">
						{(["implement", "clarify", "evidence"] as const).map((k) => (
							<span key={k} className="inline-flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className={`inline-block h-2.5 w-5 rounded-full ${GANTT_TONE[KIND_TONE[k]]}`}
								/>
								{t(`kind_${k}`)}
							</span>
						))}
						<span>{t("planEstimate")}</span>
					</p>
					<div className="hidden sm:block">
						<Gantt
							start={schedule.start}
							end={end}
							today={today}
							todayLabel={t("planToday")}
							groups={groups}
							labelHeader={t("planColMeasure")}
							ariaLabel={t("planTitle")}
						/>
					</div>
					<ol className="flex flex-col gap-4 sm:hidden">
						{[...byMonth].map(([m, items]) => (
							<li key={m} className="flex flex-col gap-1">
								<h3 className="font-semibold text-subhead">
									{monthFmt.format(new Date(`${m}-01T00:00:00Z`))}
								</h3>
								<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
									{items.map((i) => (
										<li
											key={i.controlCode}
											className="flex flex-col gap-0.5 px-3 py-2"
										>
											<a
												href={`/controls/${encodeURIComponent(i.controlCode)}`}
												className="font-medium"
											>
												<span
													className="font-mono text-footnote"
													translate="no"
												>
													{i.controlCode}
												</span>{" "}
												{title(i.controlCode)}
											</a>
											<span className="text-muted-foreground text-footnote">
												{t("planDates", { from: fmt(i.start), to: fmt(i.end) })}{" "}
												· {laneLabel(i.lane)}
											</span>
											<DurationSelect
												code={i.controlCode}
												estimated={i.estimated}
											/>
										</li>
									))}
								</ul>
							</li>
						))}
					</ol>
					{exportable && (
						<div className="flex flex-wrap gap-2">
							<a
								href={`/api/export/umsetzungsplan.pdf?id=${assessmentId}`}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("planExportPdf")}
							</a>
							<a
								href={`/api/export/umsetzungsplan.csv?id=${assessmentId}`}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("planExportCsv")}
							</a>
						</div>
					)}
					<details className="text-subhead">
						<summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
							{t("planTable")}
						</summary>
						<div className="overflow-x-auto">
							<table className="w-full text-left">
								<thead className="text-footnote text-muted-foreground">
									<tr className="border-b">
										<th scope="col" className="py-1.5 pr-3 font-normal">
											{t("planColMeasure")}
										</th>
										<th scope="col" className="py-1.5 pr-3 font-normal">
											{t("planColFrom")}
										</th>
										<th scope="col" className="py-1.5 pr-3 font-normal">
											{t("planColTo")}
										</th>
										<th
											scope="col"
											className="py-1.5 pr-3 text-right font-normal"
										>
											{t("planColDays")}
										</th>
										<th scope="col" className="py-1.5 pr-3 font-normal">
											{t("planColLane")}
										</th>
										<th scope="col" className="py-1.5 font-normal">
											{t("planColAfter")}
										</th>
									</tr>
								</thead>
								<tbody>
									{schedule.items.map((i) => (
										<tr
											key={i.controlCode}
											className="border-b last:border-b-0"
										>
											<td className="py-1.5 pr-3">
												<span
													className="whitespace-nowrap font-mono text-footnote"
													translate="no"
												>
													{i.controlCode}
												</span>{" "}
												{title(i.controlCode)}
											</td>
											<td className="whitespace-nowrap py-1.5 pr-3">
												{fmt(i.start)}
											</td>
											<td className="whitespace-nowrap py-1.5 pr-3">
												{fmt(i.end)}
											</td>
											<td className="py-1.5 pr-3 text-right tabular-nums">
												{i.days}
											</td>
											<td className="py-1.5 pr-3">{laneLabel(i.lane)}</td>
											<td className="whitespace-nowrap py-1.5 font-mono text-footnote">
												{i.after.join(", ")}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>
				</div>
			</PlanEditor>
		</section>
	);
}
