import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { clockState } from "@/lib/compliance/incident";
import { fmtDate } from "@/lib/compliance/page-data";
import { listIncidents } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { INCIDENT_STATUS, INCIDENT_STATUSES } from "@/lib/entities/incident";

type Row = Awaited<ReturnType<typeof listIncidents>>[number];
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function IncidentsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ incident: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("Incidents");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const rows = await readOrg(toOrgCtx(ctx), (tx) =>
		listIncidents(tx, ctx.orgId),
	);
	const canCreate = roleAllows(ctx.orgRole, { incident: ["create"] });
	const now = new Date();
	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const cls = one(sp.classification);
	const mine = one(sp.mine) === "1";
	const openOnly = one(sp.open) === "1";
	const filtered = rows
		.filter((r) => !q || `${r.code} ${r.title}`.toLowerCase().includes(q))
		.filter((r) => !status || r.status === status)
		.filter((r) => !cls || r.classification === cls)
		.filter(
			(r) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter((r) => !openOnly || r.status !== "closed");

	const nextClock = (r: Row) => {
		const c = [
			{ due: r.initialDueAt, rep: r.initialReportedAt },
			{ due: r.intermediateDueAt, rep: r.intermediateReportedAt },
			{ due: r.finalDueAt, rep: r.finalReportedAt },
		].find((x) => x.due && !x.rep);
		if (!c || r.status === "closed") return null;
		return {
			due: c.due as Date,
			state: clockState(c.due, c.rep, now) ?? "due",
		};
	};

	const columns: Column<Row>[] = [
		{
			key: "code",
			header: t("code"),
			className: "w-28 font-mono text-xs",
			cell: (r) => r.code,
		},
		{
			key: "title",
			header: t("titleField"),
			cell: (r) => <span className="font-medium">{r.title}</span>,
		},
		{
			key: "status",
			header: te("status"),
			className: "w-28",
			cell: (r) => (
				<StatusBadge
					machine={INCIDENT_STATUS}
					status={r.status}
					label={ts(INCIDENT_STATUS.labelKey[r.status] as "incOpen")}
				/>
			),
		},
		{
			key: "class",
			header: t("classification"),
			className: "w-32",
			cell: (r) => (
				<Badge
					variant={
						r.classification === "major"
							? "destructive"
							: r.classification === "significant"
								? "warning"
								: "muted"
					}
				>
					{t(`class_${r.classification}`)}
				</Badge>
			),
		},
		{
			key: "clock",
			header: t("clocks"),
			className: "w-44",
			cell: (r) => {
				const c = nextClock(r);
				if (!c) return <span className="text-muted-foreground">—</span>;
				return (
					<Badge
						variant={
							c.state === "overdue"
								? "destructive"
								: c.state === "soon"
									? "warning"
									: "outline"
						}
					>
						{new Intl.DateTimeFormat("de-DE", {
							dateStyle: "short",
							timeStyle: "short",
							timeZone: "Europe/Berlin",
						}).format(c.due)}
					</Badge>
				);
			},
		},
		{
			key: "owner",
			header: t("owner"),
			className: "w-40",
			mobile: false,
			cell: (r) => <UserChip name={r.names.ownerUserId} />,
		},
		{
			key: "aware",
			header: t("aware"),
			className: "w-28 text-muted-foreground",
			cell: (r) => fmtDate.format(r.awareAt),
		},
	];

	return (
		<RegisterPage
			title={t("title")}
			lead={t("lead")}
			actions={
				canCreate ? (
					<Button asChild variant="brown" size="sm">
						<Link href="/vorfaelle/neu">{t("new")}</Link>
					</Button>
				) : undefined
			}
			filters={[
				{
					key: "status",
					label: te("status"),
					options: INCIDENT_STATUSES.map((s) => ({
						value: s,
						label: ts(INCIDENT_STATUS.labelKey[s] as "incOpen"),
					})),
				},
				{
					key: "classification",
					label: t("classification"),
					options: (
						["major", "significant", "minor", "unclassified"] as const
					).map((c) => ({ value: c, label: t(`class_${c}`) })),
				},
			]}
			chips={[
				{ key: "mine", label: te("chipMine") },
				{ key: "open", label: ts("incOpen") },
			]}
			columns={columns}
			rows={filtered}
			rowHref={(r) => `/vorfaelle/${r.id}`}
			empty={
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canCreate ? (
							<Button asChild variant="outline" size="sm">
								<Link href="/vorfaelle/neu">{t("new")}</Link>
							</Button>
						) : undefined
					}
				/>
			}
		/>
	);
}
