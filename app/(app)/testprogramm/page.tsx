import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RegisterFilters } from "@/components/entity/register-filters";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import { PlanTestForm } from "@/components/testprogramme/plan-test-form";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CONTROL_TEST_METHODS } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { getOrgProfile, listControlRows } from "@/lib/compliance/queries";
import {
	listAllControlTests,
	listProcesses,
} from "@/lib/compliance/queries-p3";
import { programmeStatus } from "@/lib/compliance/test-programme";
import { tlptStatus } from "@/lib/compliance/tlpt";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const RESULT_TONE = {
	pass: "success",
	partial: "warning",
	fail: "destructive",
} as const;

export default async function TestProgrammePage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ control: ["read"] });
	const sp = await searchParams;
	const now = new Date();
	const year = Number(one(sp.jahr)) || now.getFullYear();
	const method = one(sp.method);
	const t = await getTranslations("TestProgramme");
	const tt = await getTranslations("Tests");
	const canPlan = roleAllows(ctx.orgRole, { control: ["update"] });

	const { tests, controls, processes, profile } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			tests: await listAllControlTests(tx, ctx.orgId),
			controls: await listControlRows(tx, ctx.orgId),
			processes: await listProcesses(tx, ctx.orgId),
			profile: await getOrgProfile(tx, ctx.orgId),
		}),
	);
	const critical = processes.filter(
		(p) => p.status !== "retired" && p.criticality !== "standard",
	);
	const status = programmeStatus(year, tests, critical, now);
	const lastTlpt = tests
		.filter((x) => x.method === "tlpt" && x.testedAt)
		.map((x) => x.testedAt as Date)
		.sort((a, b) => b.getTime() - a.getTime())[0];
	const tlpt = tlptStatus({
		designated: Boolean(profile?.profile.tlptDesignated),
		lastTlptAt: lastTlpt ?? null,
		now,
	});
	const inYear = tests
		.filter(
			(x) =>
				(x.testedAt && new Date(x.testedAt).getUTCFullYear() === year) ||
				x.plannedAt?.startsWith(String(year)),
		)
		.filter((x) => !method || x.method === method)
		.sort((a, b) =>
			(a.plannedAt ?? a.testedAt?.toISOString() ?? "").localeCompare(
				b.plannedAt ?? b.testedAt?.toISOString() ?? "",
			),
		);
	const today = now.toISOString().slice(0, 10);
	const controlOptions = controls
		.filter((c) => c.status !== "not_applicable")
		.map((c) => ({
			implementationId: c.implementationId,
			code: c.code,
			title: c.title,
		}));
	const processOptions = processes.map((p) => ({
		id: p.id,
		code: p.code,
		name: p.name,
	}));

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canPlan ? (
						<PlanTestForm
							controls={controlOptions}
							processes={processOptions}
						/>
					) : undefined
				}
			/>
			<div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
				<Link
					href={`/testprogramm?jahr=${year - 1}`}
					className="rounded-md border px-2 py-1 hover:bg-muted"
				>
					← {year - 1}
				</Link>
				<span className="font-serif-display text-2xl text-primary">{year}</span>
				<Link
					href={`/testprogramm?jahr=${year + 1}`}
					className="rounded-md border px-2 py-1 hover:bg-muted"
				>
					{year + 1} →
				</Link>
			</div>
			<div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-md border p-3">
					<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("performed")}
					</p>
					<p className="font-serif-display text-3xl text-primary">
						{status.performed}
					</p>
					<p className="text-muted-foreground text-xs">
						{t("passedFailed", { p: status.passed, f: status.failed })}
					</p>
				</div>
				<div className="rounded-md border p-3">
					<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("plannedOpen")}
					</p>
					<p className="font-serif-display text-3xl text-primary">
						{status.planned}
					</p>
					<p
						className={`text-xs ${status.overduePlanned > 0 ? "text-destructive" : "text-muted-foreground"}`}
					>
						{t("overduePlanned", { n: status.overduePlanned })}
					</p>
				</div>
				<div className="rounded-md border p-3">
					<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("pentest")}
					</p>
					<Badge variant={status.pentestDone ? "success" : "warning"}>
						{status.pentestDone ? t("done") : t("open")}
					</Badge>
					<p className="mt-1 text-muted-foreground text-xs">
						{t("pentestLead")}
					</p>
				</div>
				<div className="rounded-md border p-3">
					<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						TLPT (DORA Art. 26)
					</p>
					<Badge
						variant={
							tlpt.state === "not_applicable"
								? "muted"
								: tlpt.state === "ok"
									? "success"
									: tlpt.state === "soon"
										? "warning"
										: "destructive"
						}
					>
						{t(`tlpt_${tlpt.state}`)}
					</Badge>
					<p className="mt-1 text-muted-foreground text-xs">
						{tlpt.dueAt
							? `${t("tlptDue")} ${fmtDate.format(tlpt.dueAt)}`
							: t("tlptLead")}
					</p>
				</div>
			</div>

			<section className="mb-8">
				<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground">
					{t("bcmTitle")}
				</h2>
				<p className="mb-3 text-muted-foreground text-xs">{t("bcmLead")}</p>
				{critical.length === 0 ? (
					<p className="text-sm">{t("bcmNoProcesses")}</p>
				) : (
					<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{critical.map((p) => {
							const gap = status.bcmGaps.some((g) => g.id === p.id);
							return (
								<li
									key={p.id}
									className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
								>
									<Link
										href={`/prozesse/${encodeURIComponent(p.code)}`}
										className="min-w-0 truncate hover:underline"
									>
										<span className="font-mono text-xs">{p.code}</span> {p.name}
									</Link>
									<span className="flex shrink-0 items-center gap-2">
										<Badge variant={gap ? "warning" : "success"}>
											{gap ? t("bcmOpen") : t("bcmDone")}
										</Badge>
										{gap && canPlan && (
											<PlanTestForm
												controls={controlOptions}
												processes={processOptions}
												defaultMethod="bcm_exercise"
												defaultProcessId={p.id}
												triggerLabel={t("planShort")}
											/>
										)}
									</span>
								</li>
							);
						})}
					</ul>
				)}
				<p className="mt-3 text-muted-foreground text-xs">
					{t("accessReview")}:{" "}
					{status.accessReviewQuarters
						.map((q, i) => `Q${i + 1} ${q ? "✓" : "–"}`)
						.join(" · ")}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
						{t("tests", { year })}
					</h2>
				</div>
				<RegisterFilters
					filters={[
						{
							key: "method",
							label: t("method"),
							options: CONTROL_TEST_METHODS.map((m) => ({
								value: m,
								label: tt(`method_${m}`),
							})),
						},
					]}
				/>
				{inYear.length === 0 ? (
					<p className="text-sm">{t("testsEmpty")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-28">{t("plannedAt")}</TableHead>
								<TableHead className="w-28">{t("testedAt")}</TableHead>
								<TableHead>Control</TableHead>
								<TableHead className="w-36">{t("method")}</TableHead>
								<TableHead className="w-40">{t("process")}</TableHead>
								<TableHead className="w-28">{t("result")}</TableHead>
								<TableHead className="w-36">{t("tester")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{inYear.map((x) => (
								<TableRow key={x.id}>
									<TableCell
										className={
											x.plannedAt && !x.testedAt && x.plannedAt < today
												? "text-destructive"
												: ""
										}
									>
										{x.plannedAt ? fmtDate.format(new Date(x.plannedAt)) : "—"}
									</TableCell>
									<TableCell>
										{x.testedAt ? fmtDate.format(x.testedAt) : "—"}
									</TableCell>
									<TableCell>
										{x.controlCode ? (
											<Link
												href={`/controls/${x.controlCode}`}
												className="hover:underline"
											>
												<span className="font-mono text-xs">
													{x.controlCode}
												</span>{" "}
												{x.controlTitle}
											</Link>
										) : (
											"—"
										)}
										{x.scope && (
											<p className="text-muted-foreground text-xs">{x.scope}</p>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{tt(`method_${x.method}` as "method_inspection")}
									</TableCell>
									<TableCell className="text-xs">
										{x.processCode ? `${x.processCode} ${x.processName}` : "—"}
									</TableCell>
									<TableCell>
										{x.result ? (
											<Badge
												variant={
													RESULT_TONE[x.result as keyof typeof RESULT_TONE]
												}
											>
												{tt(`result_${x.result}` as "result_pass")}
											</Badge>
										) : (
											<Badge variant="outline">{t("open")}</Badge>
										)}
									</TableCell>
									<TableCell>
										<UserChip name={x.testerName} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</>
	);
}
