import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { RegisterFilters } from "@/components/entity/register-filters";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { NonconformityForm } from "@/components/nonconformities/nc-forms";
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
import { NC_PRIORITIES } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { capaState } from "@/lib/compliance/nonconformity";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { listNonconformities } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import {
	NONCONFORMITY_STATUS,
	NONCONFORMITY_STATUSES,
	NC_PRIORITY_TONE as PRIORITY_TONE,
} from "@/lib/entities/nonconformity";
import { NC_SOURCES } from "@/lib/validation/governance";

type Search = Record<string, string | string[] | undefined>;
const PRIORITY_RANK = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
} as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NonconformitiesPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ nonconformity: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Nonconformities");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const canCreate = roleAllows(ctx.orgRole, { nonconformity: ["create"] });
	const { rows, members } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listNonconformities(tx, ctx.orgId),
		members: await listMembersForPicker(tx, ctx.orgId),
	}));
	const now = new Date();
	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const source = one(sp.source);
	const priority = one(sp.priority);
	const mine = one(sp.mine) === "1";
	const overdue = one(sp.overdue) === "1";
	const assessed = rows.map((r) => ({ r, s: capaState(r, now) }));
	const filtered = assessed
		.filter(({ r }) => !q || `${r.code} ${r.title}`.toLowerCase().includes(q))
		.filter(({ r }) => !status || r.status === status)
		.filter(({ r }) => !source || r.source === source)
		.filter(
			({ r }) =>
				!priority ||
				(priority === "none" ? !r.priority : r.priority === priority),
		)
		.filter(
			({ r }) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter(({ s }) => !overdue || s.overdue || s.effectivenessDue)
		// Von der Geschäftsleitung priorisierte zuerst (kritisch → niedrig).
		.sort(
			(a, b) =>
				PRIORITY_RANK[a.r.priority ?? "none"] -
				PRIORITY_RANK[b.r.priority ?? "none"],
		);
	const openCount = rows.filter((r) => r.status !== "closed").length;
	const overdueCount = assessed.filter(({ s }) => s.overdue).length;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate ? <NonconformityForm members={members} /> : undefined
				}
			/>
			<div className="mb-4 flex flex-wrap gap-4 text-sm">
				<span>
					<span className="font-serif-display text-2xl text-primary">
						{openCount}
					</span>{" "}
					<span className="text-muted-foreground">{t("openCount")}</span>
				</span>
				<span>
					<span
						className={`font-serif-display text-2xl ${overdueCount > 0 ? "text-destructive" : "text-primary"}`}
					>
						{overdueCount}
					</span>{" "}
					<span className="text-muted-foreground">{t("overdueCount")}</span>
				</span>
			</div>
			<div className="mb-4">
				<RegisterFilters
					filters={[
						{
							key: "status",
							label: te("status"),
							options: NONCONFORMITY_STATUSES.map((s) => ({
								value: s,
								label: ts(NONCONFORMITY_STATUS.labelKey[s] as "ncOpen"),
							})),
						},
						{
							key: "priority",
							label: t("priority"),
							options: [
								...NC_PRIORITIES.map((p) => ({
									value: p,
									label: t(`priority_${p}`),
								})),
								{ value: "none", label: t("priorityNone") },
							],
						},
						{
							key: "source",
							label: t("source"),
							options: NC_SOURCES.map((s) => ({
								value: s,
								label: t(`source_${s}`),
							})),
						},
					]}
					chips={[
						{ key: "mine", label: te("chipMine") },
						{ key: "overdue", label: te("chipOverdue") },
					]}
				/>
			</div>
			{rows.length === 0 ? (
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canCreate ? <NonconformityForm members={members} /> : undefined
					}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-28">{t("code")}</TableHead>
							<TableHead className="w-28">{t("priority")}</TableHead>
							<TableHead>{t("titleField")}</TableHead>
							<TableHead className="w-32">{t("source")}</TableHead>
							<TableHead className="w-36">{t("owner")}</TableHead>
							<TableHead className="w-28">{t("dueAt")}</TableHead>
							<TableHead className="w-32">{t("effectiveness")}</TableHead>
							<TableHead className="w-36">{te("status")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map(({ r, s }) => (
							<TableRow key={r.id}>
								<TableCell className="font-mono text-xs">
									<Link
										href={`/abweichungen/${r.id}`}
										className="hover:underline"
									>
										{r.code}
									</Link>
								</TableCell>
								<TableCell>
									{r.priority ? (
										<Badge variant={PRIORITY_TONE[r.priority]}>
											{t(`priority_${r.priority}`)}
										</Badge>
									) : (
										<span className="text-muted-foreground text-xs">—</span>
									)}
								</TableCell>
								<TableCell>
									<Link
										href={`/abweichungen/${r.id}`}
										className="font-medium hover:underline underline-offset-4"
									>
										{r.title}
									</Link>
									{r.rootCause && (
										<p className="line-clamp-1 text-muted-foreground text-xs">
											{r.rootCause}
										</p>
									)}
								</TableCell>
								<TableCell className="text-xs">
									{t(`source_${r.source}`)}
								</TableCell>
								<TableCell>
									<UserChip name={r.ownerName} />
								</TableCell>
								<TableCell className={s.overdue ? "text-destructive" : ""}>
									{r.dueAt ? fmtDate.format(new Date(r.dueAt)) : "—"}
								</TableCell>
								<TableCell>
									{r.effectivenessResult ? (
										<Badge
											variant={
												r.effectivenessResult === "effective"
													? "success"
													: r.effectivenessResult === "partially"
														? "warning"
														: "destructive"
											}
										>
											{t(`eff_${r.effectivenessResult}`)}
										</Badge>
									) : s.effectivenessDue ? (
										<Badge variant="warning">{t("effectivenessDue")}</Badge>
									) : (
										<span className="text-muted-foreground text-xs">
											{r.effectivenessCheckAt
												? fmtDate.format(new Date(r.effectivenessCheckAt))
												: "—"}
										</span>
									)}
								</TableCell>
								<TableCell>
									<StatusBadge
										machine={NONCONFORMITY_STATUS}
										status={r.status}
										label={ts(
											NONCONFORMITY_STATUS.labelKey[r.status] as "ncOpen",
										)}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</>
	);
}
