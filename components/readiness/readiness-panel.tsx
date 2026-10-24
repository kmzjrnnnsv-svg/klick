import Form from "next/form";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/compliance/page-data";
import type {
	BlockerSeverity,
	ReadinessBlocker,
	ReadinessResult,
	ReadinessVerdict,
} from "@/lib/compliance/readiness";
import { cn } from "@/lib/utils";
import { BlockerTaskButton } from "./blocker-task-button";

// Prüfungsreife eines Rahmenwerks (Server Component): Score + Urteil,
// Dimensionen, Abschnitte, geordnete offene Punkte. Stichtag per GET-Formular
// (?stichtag=…) — teilbar, ohne Client-State.

export const VERDICT_TONE: Record<
	ReadinessVerdict,
	"success" | "warning" | "destructive" | "muted"
> = {
	ready: "success",
	almost: "warning",
	not_ready: "destructive",
	n_a: "muted",
};

const SEV_TONE: Record<
	BlockerSeverity,
	"destructive" | "warning" | "outline" | "muted"
> = {
	critical: "destructive",
	high: "warning",
	medium: "outline",
	low: "muted",
};

const TASK_PRIORITY: Record<
	BlockerSeverity,
	"critical" | "high" | "normal" | "low"
> = {
	critical: "critical",
	high: "high",
	medium: "normal",
	low: "low",
};

function Bar({ label, value }: { label: string; value: number | null }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex justify-between text-footnote">
				<span className="text-muted-foreground">{label}</span>
				<span className="tabular-nums">
					{value === null ? "—" : `${Math.round(value)} %`}
				</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
				/>
			</div>
		</div>
	);
}

export async function BlockerList({
	blockers,
	limit = 12,
	canCreateTask,
}: {
	blockers: readonly ReadinessBlocker[];
	limit?: number;
	canCreateTask: boolean;
}) {
	const t = await getTranslations("Readiness");
	if (blockers.length === 0)
		return <p className="text-subhead">{t("blockersEmpty")}</p>;
	const row = (b: ReadinessBlocker) => (
		<li
			key={`${b.kind}:${b.ref}`}
			className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
		>
			<span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
				<Badge variant={SEV_TONE[b.severity]}>
					{t(`severity_${b.severity}`)}
				</Badge>
				<span className="text-muted-foreground text-footnote">
					{t(`kind_${b.kind}`)}
				</span>
				{b.href ? (
					<Link
						href={b.href}
						className="min-w-0 truncate font-medium hover:underline underline-offset-4"
					>
						{b.label}
					</Link>
				) : (
					<span className="min-w-0 truncate font-medium">{b.label}</span>
				)}
			</span>
			<span className="flex shrink-0 items-center gap-3 text-muted-foreground text-footnote">
				{b.requirements > 0 && (
					<span>{t("requirementsCount", { count: b.requirements })}</span>
				)}
				{b.dueAt && (
					<span>{t("due", { date: fmtDate.format(new Date(b.dueAt)) })}</span>
				)}
				{b.gain > 0 && (
					<span className="tabular-nums text-foreground">
						{t("gain", { points: b.gain.toLocaleString("de-DE") })}
					</span>
				)}
				{canCreateTask && (
					<BlockerTaskButton
						title={`${t(`kind_${b.kind}`)}: ${b.label}`}
						priority={TASK_PRIORITY[b.severity]}
					/>
				)}
			</span>
		</li>
	);
	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card text-subhead">
				{blockers.slice(0, limit).map(row)}
			</ul>
			{blockers.length > limit && (
				<details className="rounded-2xl bg-card text-subhead">
					<summary className="cursor-pointer px-3 py-2 text-muted-foreground">
						{t("blockersMore", { count: blockers.length })}
					</summary>
					<ul className="flex flex-col divide-y divide-border/60 border-t">
						{blockers.slice(limit).map(row)}
					</ul>
				</details>
			)}
		</div>
	);
}

export async function ReadinessPanel({
	result,
	sectionTitles,
	stichtage,
	base,
	canCreateTask,
	exportHref,
}: {
	result: ReadinessResult;
	sectionTitles: Record<string, string>;
	stichtage: string[];
	// Formular-Ziel (Pfad) und feste Parameter
	base: { path: string; params: Record<string, string> };
	canCreateTask: boolean;
	exportHref?: string;
}) {
	const t = await getTranslations("Readiness");
	const today = stichtage[0];
	return (
		<div className="flex flex-col gap-6">
			<p className="text-muted-foreground text-subhead">{t("lead")}</p>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
				<div className="flex flex-col gap-2 rounded-2xl bg-card p-4">
					<span className="font-medium text-footnote text-muted-foreground">
						{t("score")}
					</span>
					<span className="font-bold text-title-1 tabular-nums">
						{result.score ?? "—"}
					</span>
					<Badge variant={VERDICT_TONE[result.verdict]} className="w-fit">
						{t(`verdict_${result.verdict}`)}
					</Badge>
					<Form
						action={base.path}
						scroll={false}
						className="mt-2 flex items-end gap-2"
					>
						{Object.entries(base.params).map(([k, v]) => (
							<input key={k} type="hidden" name={k} value={v} />
						))}
						<label className="flex flex-col gap-1 text-footnote">
							<span className="text-muted-foreground">{t("asOf")}</span>
							<select
								name="stichtag"
								defaultValue={result.asOf}
								className="rounded-2xl bg-card px-2 py-1 text-subhead text-foreground"
							>
								{stichtage.map((d) => (
									<option key={d} value={d}>
										{d === today
											? `${t("asOfToday")} (${fmtDate.format(new Date(d))})`
											: fmtDate.format(new Date(d))}
									</option>
								))}
							</select>
						</label>
						<button
							type="submit"
							className="rounded-xl bg-card px-2 py-1 text-subhead hover:bg-muted"
						>
							{t("apply")}
						</button>
					</Form>
					{result.asOf !== today && (
						<p className="max-w-56 text-muted-foreground text-footnote">
							{t("asOfFuture", { date: fmtDate.format(new Date(result.asOf)) })}
						</p>
					)}
					{exportHref && (
						<a
							href={exportHref}
							className="text-primary text-subhead hover:underline underline-offset-4"
						>
							{t("export")}
						</a>
					)}
				</div>
				<div className="flex flex-col gap-3">
					<Bar label={t("dimCoverage")} value={result.dimensions.coverage} />
					<Bar label={t("dimEvidence")} value={result.dimensions.evidence} />
					<Bar label={t("dimTests")} value={result.dimensions.tests} />
					<Bar label={t("dimDocuments")} value={result.dimensions.documents} />
					{result.penalty.total > 0 && (
						<p className="text-subhead">
							<span className="font-medium">
								{t("penalty")}: −{result.penalty.total}
							</span>{" "}
							<span className="text-muted-foreground text-footnote">
								{t("penaltyDetail", {
									nc: result.penalty.nonconformities,
									findings: result.penalty.findings,
									security: result.penalty.security,
								})}
							</span>
						</p>
					)}
				</div>
			</div>

			<section>
				<h2 className="mb-1 font-medium">{t("blockers")}</h2>
				<p className="mb-3 text-muted-foreground text-footnote">
					{t("blockersLead")}
				</p>
				<BlockerList blockers={result.blockers} canCreateTask={canCreateTask} />
			</section>

			{result.bySection.length > 1 && (
				<section>
					<h2 className="mb-2 font-medium">{t("bySection")}</h2>
					<ul className="grid grid-cols-1 gap-2 text-subhead sm:grid-cols-2">
						{result.bySection.map((s) => (
							<li
								key={s.sectionCode}
								className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-1.5"
							>
								<span className="min-w-0 truncate">
									{s.sectionCode} · {sectionTitles[s.sectionCode] ?? ""}
								</span>
								<span
									className={cn(
										"tabular-nums",
										s.score < 50 && "text-destructive",
									)}
								>
									{s.score}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
