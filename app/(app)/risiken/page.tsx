import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { importRisksCsv } from "@/app/actions/imports";
import { CsvImport } from "@/components/entity/csv-import";
import { EmptyState } from "@/components/entity/empty-state";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusBadge } from "@/components/entity/status-badge";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { PageHeader } from "@/components/page-header";
import {
	ExceptionForm,
	LossEventForm,
	RiskQuickCreate,
} from "@/components/risks/risk-forms";
import { RiskMatrix } from "@/components/risks/risk-matrix";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { RISK_CATEGORIES } from "@/db/schema/grc";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { CONTROLS } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	listExceptions,
	listLossEvents,
	listRisks,
} from "@/lib/compliance/queries-p2";
import {
	assessRisk,
	DEFAULT_RISK_APPETITE,
	DEFAULT_RISK_SCALES,
} from "@/lib/compliance/risk";
import { readOrg } from "@/lib/db/with-org";
import { RISK_STATUS, RISK_STATUSES } from "@/lib/entities/risk";
import { getOrgSettings } from "@/lib/org/queries";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const BAND_TONE = {
	low: "muted",
	medium: "outline",
	high: "warning",
	critical: "destructive",
} as const;

export default async function RisksPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ risk: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) ?? "register";
	const t = await getTranslations("Risks");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const canCreate = roleAllows(ctx.orgRole, { risk: ["create"] });

	const { rows, settings, exceptions, losses } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			rows: await listRisks(tx, ctx.orgId),
			settings: await getOrgSettings(tx, ctx.orgId),
			exceptions:
				tab === "ausnahmen" ? await listExceptions(tx, ctx.orgId) : [],
			losses:
				tab === "schadensfaelle" ? await listLossEvents(tx, ctx.orgId) : [],
		}),
	);
	const appetite = settings?.riskAppetite ?? DEFAULT_RISK_APPETITE;
	const scales = settings?.riskScales ?? DEFAULT_RISK_SCALES;
	const view = one(sp.view) === "residual" ? "residual" : "inherent";
	const assessed = rows.map((r) => ({ r, a: assessRisk(r, appetite) }));
	const above = assessed.filter(
		(x) => x.a.aboveAppetite && x.r.status !== "closed",
	).length;

	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const category = one(sp.category);
	const mine = one(sp.mine) === "1";
	const overdue = one(sp.overdue) === "1";
	const unowned = one(sp.unowned) === "1";
	const l = one(sp.l) ? Number(one(sp.l)) : null;
	const i = one(sp.i) ? Number(one(sp.i)) : null;
	const today = new Date().toISOString().slice(0, 10);
	const filtered = assessed
		.filter(({ r }) => !q || `${r.code} ${r.title}`.toLowerCase().includes(q))
		.filter(({ r }) => !status || r.status === status)
		.filter(({ r }) => !category || r.category === category)
		.filter(
			({ r }) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter(
			({ r }) =>
				!overdue ||
				(r.reviewAt !== null && r.reviewAt < today && r.status !== "closed"),
		)
		.filter(({ r }) => !unowned || !r.ownerUserId)
		.filter(({ a }) => {
			if (l === null || i === null) return true;
			const pos = view === "residual" ? (a.residual ?? a.inherent) : a.inherent;
			return pos.likelihood === l && pos.impact === i;
		})
		.sort(
			(x, y) =>
				y.a.effective.score - x.a.effective.score ||
				x.r.code.localeCompare(y.r.code),
		);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					<span className="flex flex-wrap items-center gap-2">
						<a
							href="/api/export/risiken.csv"
							className="text-primary text-sm hover:underline underline-offset-4"
						>
							{t("exportCsv")}
						</a>
						{canCreate && (
							<CsvImport
								title={t("importTitle")}
								columns="title;category;likelihood;impact;description"
								action={importRisksCsv}
							/>
						)}
						{canCreate && <RiskQuickCreate scales={scales} />}
					</span>
				}
			/>
			<UrlTabs
				base="/risiken"
				active={tab}
				tabs={[
					{ value: "register", label: t("tabRegister"), count: rows.length },
					{ value: "matrix", label: t("tabMatrix"), count: above },
					{ value: "ausnahmen", label: t("tabExceptions") },
					{ value: "schadensfaelle", label: t("tabLossEvents") },
				]}
			/>

			{tab === "matrix" && (
				<>
					<div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
						<p className="text-muted-foreground">{t("matrixLead")}</p>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-xs">
								{t("matrixView")}:
							</span>
							<Link
								href="/risiken?tab=matrix&view=inherent"
								className={
									view === "inherent"
										? "font-medium"
										: "text-muted-foreground hover:underline"
								}
							>
								{t("inherent")}
							</Link>
							<span className="text-muted-foreground">·</span>
							<Link
								href="/risiken?tab=matrix&view=residual"
								className={
									view === "residual"
										? "font-medium"
										: "text-muted-foreground hover:underline"
								}
							>
								{t("residual")}
							</Link>
						</div>
					</div>
					<RiskMatrix
						risks={rows}
						view={view}
						appetite={appetite}
						labels={{
							likelihood: scales.likelihood,
							impact: scales.impact,
							axisL: t("likelihood"),
							axisI: t("impact"),
						}}
						codes={new Map(rows.map((r) => [r.id, r.code]))}
					/>
					<p className="mt-3 text-muted-foreground text-xs">
						{t("appetite", {
							acceptable: appetite.acceptable,
							tolerable: appetite.tolerable,
						})}
					</p>
				</>
			)}

			{tab === "ausnahmen" && (
				<>
					<div className="mb-4 flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{t("exceptionsLead")}
						</p>
						{canCreate && (
							<ExceptionForm
								controlOptions={CONTROLS.map((c) => ({
									code: c.code,
									title: c.title,
								}))}
							/>
						)}
					</div>
					{exceptions.length === 0 ? (
						<p className="text-sm">{t("exceptionsEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("titleField")}</TableHead>
									<TableHead className="w-32">Control</TableHead>
									<TableHead className="w-40">{t("owner")}</TableHead>
									<TableHead className="w-28">{t("validUntil")}</TableHead>
									<TableHead className="w-28">{te("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{exceptions.map((e) => (
									<TableRow key={e.id}>
										<TableCell>
											<p className="font-medium">{e.title}</p>
											<p className="text-muted-foreground text-xs">
												{e.justification}
											</p>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{e.controlCode ? (
												<Link
													href={`/controls/${e.controlCode}`}
													className="hover:underline"
												>
													{e.controlCode}
												</Link>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											<UserChip name={e.ownerName} />
										</TableCell>
										<TableCell
											className={e.validUntil < today ? "text-destructive" : ""}
										>
											{fmtDate.format(new Date(e.validUntil))}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													e.status === "approved"
														? "success"
														: e.status === "requested"
															? "warning"
															: "muted"
												}
											>
												{t(`exceptionStatus_${e.status}`)}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "schadensfaelle" && (
				<>
					<div className="mb-4 flex items-start justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{t("lossEventsLead")}
						</p>
						{canCreate && <LossEventForm />}
					</div>
					{losses.length === 0 ? (
						<p className="text-sm">{t("lossEventsEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-28">{t("occurredAt")}</TableHead>
									<TableHead>{t("category")}</TableHead>
									<TableHead className="w-32 text-right">
										{t("amount")}
									</TableHead>
									<TableHead className="w-32 text-right">
										{t("recovery")}
									</TableHead>
									<TableHead>{t("cause")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{losses.map((e) => (
									<TableRow key={e.id}>
										<TableCell>
											{fmtDate.format(new Date(e.occurredAt))}
										</TableCell>
										<TableCell className="font-medium">{e.category}</TableCell>
										<TableCell className="text-right">
											{e.amount
												? `${Number(e.amount).toLocaleString("de-DE")} €`
												: "—"}
										</TableCell>
										<TableCell className="text-right">
											{e.recovery
												? `${Number(e.recovery).toLocaleString("de-DE")} €`
												: "—"}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{e.cause ?? "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "register" && (
				<>
					<div className="mb-4">
						<RegisterFilters
							filters={[
								{
									key: "status",
									label: te("status"),
									options: RISK_STATUSES.map((s) => ({
										value: s,
										label: ts(RISK_STATUS.labelKey[s] as "riskOpen"),
									})),
								},
								{
									key: "category",
									label: t("category"),
									options: RISK_CATEGORIES.map((c) => ({
										value: c,
										label: t(`category_${c}`),
									})),
								},
							]}
							chips={[
								{ key: "mine", label: te("chipMine") },
								{ key: "overdue", label: te("chipOverdue") },
								{ key: "unowned", label: te("chipUnowned") },
							]}
						/>
					</div>
					{l !== null && i !== null && (
						<p className="mb-3 text-muted-foreground text-xs">
							{t("likelihood")} {l} · {t("impact")} {i} (
							{view === "residual" ? t("residual") : t("inherent")}) ·{" "}
							<Link href="/risiken" className="text-primary hover:underline">
								{te("clearFilters")}
							</Link>
						</p>
					)}
					{rows.length === 0 ? (
						<EmptyState
							title={t("empty")}
							lead={t("emptyLead")}
							requiredBy={t("requiredBy")}
							actions={
								canCreate ? <RiskQuickCreate scales={scales} /> : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">{t("code")}</TableHead>
									<TableHead>{t("titleField")}</TableHead>
									<TableHead className="w-28">{te("status")}</TableHead>
									<TableHead className="w-24 text-right">
										{t("inherent")}
									</TableHead>
									<TableHead className="w-24 text-right">
										{t("residual")}
									</TableHead>
									<TableHead className="w-40">{te("owner")}</TableHead>
									<TableHead className="w-28">{t("reviewAt")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map(({ r, a }) => (
									<TableRow key={r.id}>
										<TableCell className="font-mono text-xs">
											<Link
												href={`/risiken/${r.id}`}
												className="hover:underline"
											>
												{r.code}
											</Link>
										</TableCell>
										<TableCell>
											<Link
												href={`/risiken/${r.id}`}
												className="font-medium hover:underline underline-offset-4"
											>
												{r.title}
											</Link>
											<p className="text-muted-foreground text-xs">
												{t(`category_${r.category}`)}
											</p>
										</TableCell>
										<TableCell>
											<StatusBadge
												machine={RISK_STATUS}
												status={r.status}
												label={ts(RISK_STATUS.labelKey[r.status] as "riskOpen")}
											/>
										</TableCell>
										<TableCell className="text-right">
											<Badge variant={BAND_TONE[a.inherent.band]}>
												{a.inherent.score}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											{a.residual ? (
												<Badge variant={BAND_TONE[a.residual.band]}>
													{a.residual.score}
												</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											<UserChip name={r.names.ownerUserId} />
										</TableCell>
										<TableCell
											className={
												r.reviewAt &&
												r.reviewAt < today &&
												r.status !== "closed"
													? "text-destructive"
													: "text-muted-foreground"
											}
										>
											{r.reviewAt ? fmtDate.format(new Date(r.reviewAt)) : "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}
		</>
	);
}
