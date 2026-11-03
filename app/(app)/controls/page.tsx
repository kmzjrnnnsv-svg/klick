import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	BulkBar,
	BulkCheckbox,
	BulkProvider,
} from "@/components/entity/bulk-select";
import { EmptyState } from "@/components/entity/empty-state";
import { OwnerChip } from "@/components/entity/owner-chip";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { SummaryCard, SummaryGrid } from "@/components/entity/summary-card";
import { withMessages } from "@/components/i18n/with-messages";
import { Button } from "@/components/ui/button";
import { Donut, Ring } from "@/components/ui/ring";
import { DOMAINS, type ImplStatus } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { percent } from "@/lib/charts/ring";
import { BASELINE, CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { requiredControlCodes } from "@/lib/compliance/catalog-view";
import {
	assignmentState,
	frameworkRefs,
	testOutcome,
	testTotal,
} from "@/lib/compliance/controls-register";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { responsibleOptions } from "@/lib/compliance/function-holders-service";
import { type FunctionKey, functionLabel } from "@/lib/compliance/function-key";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import {
	listControlRows,
	listMembersForPicker,
} from "@/lib/compliance/queries";
import { controlTestSummary } from "@/lib/compliance/queries-controls";
import { readOrg } from "@/lib/db/with-org";
import { CONTROL_STATUS } from "@/lib/entities/control";
import { orgRoleNames } from "@/lib/org/roles";
import { PAGE_SIZE, pageParam, pageSlice } from "@/lib/paging";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function ControlsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage();
	const sp = await searchParams;
	const t = await getTranslations("Controls");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const [{ rows, members, functions, testsByImpl, roleNames }, cov] =
		await Promise.all([
			readOrg(toOrgCtx(ctx), async (tx) => ({
				rows: await listControlRows(tx, ctx.orgId),
				members: await listMembersForPicker(tx, ctx.orgId),
				functions: await responsibleOptions(tx, ctx.orgId),
				testsByImpl: await controlTestSummary(tx, ctx.orgId),
				roleNames: await orgRoleNames(tx, ctx.orgId),
			})),
			getOrgCoverageCached(ctx),
		]);
	const canBulk = allows(ctx, { control: ["update", "assign"] });
	const leverage = cov?.result.leverage ?? new Map();
	const today = new Date().toISOString().slice(0, 10);

	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const domain = one(sp.domain);
	const effort = one(sp.effort);
	const framework = one(sp.rahmenwerk);
	const tests = one(sp.tests);
	// Verantwortlich: Zuständigkeit (ok/neu/ohne), ich, Funktion f:<key>,
	// Person u:<id>; ältere Links ?mine=1 und ?unowned=1 gelten weiter
	const owner =
		one(sp.owner) ??
		(one(sp.mine) === "1"
			? "me"
			: one(sp.unowned) === "1"
				? "ohne"
				: undefined);
	const overdue = one(sp.overdue) === "1";
	const orphan = one(sp.orphan) === "1";
	// Nicht mehr gefordert: kein aktives Rahmenwerk braucht das Control (z. B.
	// nach dem Entfernen eines Rahmenwerks) — abgeleitet, nie gespeichert.
	const required = cov
		? requiredControlCodes(
				{
					sector: cov.profile.sector,
					licenceStage: cov.profile.licenceStage,
					caspServices: cov.profile.caspServices,
					frameworks: cov.frameworks,
					tlptDesignated: cov.profile.tlptDesignated,
					frameworkVariants: cov.profile.frameworkVariants,
					issuesTokens: cov.profile.issuesTokens,
					productRoles: cov.profile.productRoles,
				},
				new Map(
					[...cov.applicabilityDetail]
						.filter(([, d]) => d.source === "manual")
						.map(([k, d]) => [k, d.applicable]),
				),
				cov.catalog,
			)
		: null;
	if (required && cov?.profile.applyBaseline)
		for (const b of BASELINE.controls) required.add(b.code);

	const memberIds = new Set(members.map((m) => m.userId));
	const filled = new Set<string>(functions.map((f) => f.function));
	const frameworks = cov?.frameworks ?? [];
	const fwName = (slug: string) => shortFrameworkName(slug, cov?.catalog);
	const enriched = rows.map((r) => {
		const refs = cov
			? frameworkRefs(r.code, cov.catalog, cov.result.byRequirement, frameworks)
			: [];
		const summary = testsByImpl.get(r.implementationId);
		return {
			...r,
			id: r.implementationId,
			description: CONTROL_BY_CODE.get(r.code as never)?.description ?? "",
			assignment: assignmentState(r, memberIds, filled),
			refs,
			tests: summary,
			testOutcome: testOutcome(summary),
		};
	});
	type Row = (typeof enriched)[number];

	const ownerMatches = (r: Row) => {
		if (!owner) return true;
		if (owner === "ok") return r.assignment === "assigned";
		if (owner === "neu") return r.assignment === "reassign";
		if (owner === "ohne") return r.assignment === "unassigned";
		if (owner === "me")
			return r.ownerUserId === ctx.userId || r.assigneeUserId === ctx.userId;
		if (owner.startsWith("f:")) return r.ownerFunction === owner.slice(2);
		if (owner.startsWith("u:")) return r.ownerUserId === owner.slice(2);
		return true;
	};

	const filtered = enriched
		.filter(
			(r) =>
				!q || `${r.code} ${r.title} ${r.description}`.toLowerCase().includes(q),
		)
		.filter((r) => !status || r.status === status)
		.filter((r) => !domain || r.domain === domain)
		.filter((r) => !effort || r.effort === effort)
		.filter((r) => !framework || r.refs.some((x) => x.framework === framework))
		.filter(
			(r) =>
				!tests ||
				(tests === "bestanden" && r.testOutcome === "passed") ||
				(tests === "maengel" && r.testOutcome === "issues") ||
				(tests === "keine" && r.testOutcome === "none"),
		)
		.filter(ownerMatches)
		.filter(
			(r) => !overdue || (r.nextReviewAt !== null && r.nextReviewAt < today),
		)
		.filter((r) => !orphan || (required !== null && !required.has(r.code)))
		.sort((a, b) => {
			const la = leverage.get(a.code);
			const lb = leverage.get(b.code);
			const sa = (la?.score ?? 0) * (la?.frameworks ?? 1);
			const sb = (lb?.score ?? 0) * (lb?.frameworks ?? 1);
			return sb - sa || a.code.localeCompare(b.code);
		});
	const page = pageSlice(filtered, pageParam(sp.seite));

	// Kacheln: über alle Controls, nicht nur die gefilterten
	const count = (pred: (r: Row) => boolean) => enriched.filter(pred).length;
	const relevant = count((r) => r.status !== "not_applicable");
	const implemented = count((r) => r.status === "implemented");
	const inProgress = count((r) => r.status === "in_progress");
	const tested = count((r) => r.testOutcome !== "none");
	const passed = count((r) => r.testOutcome === "passed");
	const issues = count((r) => r.testOutcome === "issues");
	const href = (key: string, value: string) => {
		const next = new URLSearchParams();
		for (const [k, v] of Object.entries(sp)) {
			const x = one(v);
			if (x && k !== "seite" && k !== key && k !== "mine" && k !== "unowned")
				next.set(k, x);
		}
		next.set(key, value);
		return `/controls?${next.toString()}`;
	};
	const donePct = percent(implemented, relevant);

	const summary = (
		<SummaryGrid>
			<SummaryCard title={t("summaryOwnership")}>
				<Donut
					label={t("summaryOwnership")}
					center={enriched.length}
					items={[
						{
							key: "assigned",
							label: t("own_assigned"),
							value: count((r) => r.assignment === "assigned"),
							tone: "success",
							href: href("owner", "ok"),
						},
						{
							key: "reassign",
							label: t("own_reassign"),
							value: count((r) => r.assignment === "reassign"),
							tone: "warning",
							href: href("owner", "neu"),
						},
						{
							key: "unassigned",
							label: t("own_unassigned"),
							value: count((r) => r.assignment === "unassigned"),
							tone: "muted",
							href: href("owner", "ohne"),
						},
					]}
				/>
			</SummaryCard>
			<SummaryCard title={t("summaryDone")}>
				<div className="flex items-baseline gap-2">
					<span className="font-semibold text-large-title tabular-nums">
						{donePct}&nbsp;%
					</span>
					<Link
						href={href("status", "implemented")}
						className="hit-area text-footnote text-muted-foreground underline-offset-4 hover:underline"
					>
						{t("doneOf", { done: implemented, total: relevant })}
					</Link>
				</div>
				<div
					className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
					aria-hidden="true"
				>
					<div
						className="h-full rounded-full bg-success"
						style={{ width: `${donePct}%` }}
					/>
				</div>
				<p className="mt-3 text-footnote text-muted-foreground">
					{tested > 0
						? t("testsLine", { pct: percent(passed, tested), n: tested })
						: t("testsNone")}
				</p>
				{tested > 0 && (
					<p className="mt-1 flex flex-wrap gap-x-4 text-footnote">
						<Link
							href={href("tests", "bestanden")}
							className="hit-area underline-offset-4 hover:underline"
						>
							{t("tests_passed")}: {passed}
						</Link>
						<Link
							href={href("tests", "maengel")}
							className="hit-area underline-offset-4 hover:underline"
						>
							{t("tests_issues")}: {issues}
						</Link>
						<Link
							href={href("tests", "keine")}
							className="hit-area underline-offset-4 hover:underline"
						>
							{t("tests_none")}: {enriched.length - tested}
						</Link>
					</p>
				)}
			</SummaryCard>
		</SummaryGrid>
	);

	const columns: Column<Row>[] = [
		...(canBulk
			? [
					{
						key: "select",
						header: "",
						className: "w-8",
						mobile: false,
						interactive: true,
						cell: (r: Row) => (
							<BulkCheckbox
								id={r.id}
								label={t("selectRow", { code: r.code })}
							/>
						),
					},
				]
			: []),
		{
			key: "code",
			header: te("code"),
			className: "w-28 whitespace-nowrap font-mono text-footnote",
			mobile: false,
			cell: (r) => r.code,
		},
		{
			key: "control",
			header: t("colControl"),
			className: "min-w-0",
			cell: (r) => (
				<span className="block min-w-0">
					<span className="font-mono text-footnote text-muted-foreground sm:hidden">
						{r.code}{" "}
					</span>
					<span className="font-medium">{r.title}</span>
					{r.description && (
						<span className="mt-0.5 line-clamp-1 font-normal text-footnote text-muted-foreground max-sm:hidden">
							{r.description}
						</span>
					)}
				</span>
			),
		},
		{
			key: "owner",
			header: te("owner"),
			className: "w-44",
			cell: (r) =>
				r.assignment === "unassigned" ? (
					<span className="text-muted-foreground">{t("own_unassigned")}</span>
				) : (
					<span className="flex min-w-0 flex-col gap-0.5">
						<OwnerChip ownerFunction={r.ownerFunction} name={r.ownerName} />
						{r.assignment === "reassign" && (
							<span className="text-footnote text-warning">
								{t("own_reassign")}
							</span>
						)}
					</span>
				),
		},
		{
			key: "frameworks",
			header: t("colFrameworks"),
			className: "w-44",
			cell: (r) => {
				const refs = framework
					? r.refs.filter((x) => x.framework === framework)
					: r.refs;
				if (refs.length === 0)
					return <span className="text-muted-foreground">–</span>;
				const first = refs[0];
				if (!first) return null;
				const shown = framework
					? first.codes.slice(0, 2)
					: first.codes.slice(0, 1);
				const rest =
					refs.reduce((s, x) => s + x.codes.length, 0) - shown.length;
				return (
					<span className="flex flex-wrap items-center gap-1">
						<span className="inline-block max-w-40 truncate rounded-full bg-muted px-2 py-0.5 align-middle text-footnote">
							<span className="font-medium">{fwName(first.framework)}</span>{" "}
							<span className="text-muted-foreground">{shown.join(", ")}</span>
						</span>
						{rest > 0 && (
							<span
								className="rounded-full bg-muted px-2 py-0.5 text-footnote tabular-nums text-muted-foreground"
								title={refs
									.map((x) => `${fwName(x.framework)} ${x.codes.join(", ")}`)
									.join(" · ")}
							>
								+{rest}
							</span>
						)}
					</span>
				);
			},
		},
		{
			key: "tests",
			header: t("colTests"),
			className: "w-20 whitespace-nowrap",
			cell: (r) => {
				const total = testTotal(r.tests);
				if (!r.tests || total === 0)
					return <span className="text-muted-foreground">–</span>;
				return (
					<span className="inline-flex items-center gap-1.5 tabular-nums">
						<Ring
							value={r.tests.pass}
							max={total}
							size={20}
							stroke={14}
							tone={r.testOutcome === "passed" ? "success" : "warning"}
							label={t("testsCell", { pass: r.tests.pass, total })}
						/>
						{r.tests.pass}/{total}
					</span>
				);
			},
		},
		{
			key: "status",
			header: te("status"),
			className: "w-32",
			cell: (r) => (
				<StatusBadge
					machine={CONTROL_STATUS}
					status={r.status as ImplStatus}
					label={ts(
						CONTROL_STATUS.labelKey[r.status as ImplStatus] as "notStarted",
					)}
				/>
			),
		},
	];

	const tf = await getTranslations("Functions");
	const fnLabel = (key: string) =>
		functionLabel(key as FunctionKey, (fn) => tf(fn), roleNames);

	return (
		<BulkProvider>
			<RegisterPage
				title={t("title")}
				lead={t("lead")}
				summary={enriched.length > 0 ? summary : undefined}
				filters={[
					...(frameworks.length > 1
						? [
								{
									key: "rahmenwerk",
									label: t("filterFramework"),
									options: frameworks.map((f) => ({
										value: f,
										label: fwName(f),
									})),
								},
							]
						: []),
					{
						key: "owner",
						label: te("owner"),
						options: [
							{ value: "me", label: t("owner_me") },
							{ value: "ok", label: t("own_assigned") },
							{ value: "neu", label: t("own_reassign") },
							{ value: "ohne", label: t("own_unassigned") },
							...functions.map((f) => ({
								value: `f:${f.function}`,
								label: fnLabel(f.function),
							})),
							...members.map((m) => ({
								value: `u:${m.userId}`,
								label: m.name,
							})),
						],
					},
					{
						key: "status",
						label: te("status"),
						options: CONTROL_STATUS.states.map((s) => ({
							value: s,
							label: ts(CONTROL_STATUS.labelKey[s] as "notStarted"),
						})),
					},
					{
						key: "tests",
						label: t("colTests"),
						options: [
							{ value: "bestanden", label: t("tests_passed") },
							{ value: "maengel", label: t("tests_issues") },
							{ value: "keine", label: t("tests_none") },
						],
					},
					{
						key: "domain",
						label: t("domain"),
						options: DOMAINS.map((d) => ({
							value: d,
							label: t(`domain_${d}`),
						})),
					},
					{
						key: "effort",
						label: t("effort"),
						options: (["S", "M", "L"] as const).map((e) => ({
							value: e,
							label: t(`effort_${e}`),
						})),
					},
				]}
				chips={[
					{ key: "overdue", label: te("chipOverdue") },
					{ key: "orphan", label: t("chipOrphan") },
				]}
				columns={columns}
				rows={page.rows}
				rowHref={(r) => `/controls/${r.code}`}
				paging={{
					page: page.page,
					total: page.total,
					pageSize: PAGE_SIZE,
					path: "/controls",
					query: sp,
				}}
				empty={
					rows.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							actions={
								<Button asChild variant="outline" size="sm">
									<Link href="/einstellungen?tab=frameworks">
										{t("chooseFrameworks")}
									</Link>
								</Button>
							}
						/>
					) : (
						<EmptyState title={t("noMatch")} lead={t("noMatchLead")} />
					)
				}
				footer={t("countSummary", {
					n: rows.length,
					implemented,
					inProgress,
				})}
			/>
			{canBulk && <BulkBar members={members} functions={functions} />}
		</BulkProvider>
	);
}

export default withMessages(ControlsPage, [
	"Common",
	"Controls",
	"Entity",
	"Functions",
	"Status",
]);
