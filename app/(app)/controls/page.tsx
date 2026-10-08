import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	BulkBar,
	BulkCheckbox,
	BulkProvider,
} from "@/components/entity/bulk-select";
import { EmptyState } from "@/components/entity/empty-state";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { StatusBadge } from "@/components/entity/status-badge";
import { UserChip } from "@/components/entity/user-chip";
import { Button } from "@/components/ui/button";
import { DOMAINS, type ImplStatus } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate, getOrgCoverageCached } from "@/lib/compliance/page-data";
import {
	type ControlRow,
	listControlRows,
	listMembersForPicker,
} from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { CONTROL_STATUS } from "@/lib/entities/control";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ControlsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage();
	const sp = await searchParams;
	const t = await getTranslations("Controls");
	const te = await getTranslations("Entity");
	const ts = await getTranslations("Status");
	const [{ rows, members }, cov] = await Promise.all([
		readOrg(toOrgCtx(ctx), async (tx) => ({
			rows: await listControlRows(tx, ctx.orgId),
			members: await listMembersForPicker(tx, ctx.orgId),
		})),
		getOrgCoverageCached(ctx),
	]);
	const canBulk = roleAllows(ctx.orgRole, { control: ["update", "assign"] });
	const leverage = cov?.result.leverage ?? new Map();
	const today = new Date().toISOString().slice(0, 10);

	const q = one(sp.q)?.toLowerCase();
	const status = one(sp.status);
	const domain = one(sp.domain);
	const effort = one(sp.effort);
	const mine = one(sp.mine) === "1";
	const overdue = one(sp.overdue) === "1";
	const unowned = one(sp.unowned) === "1";

	const filtered = rows
		.filter((r) => !q || `${r.code} ${r.title}`.toLowerCase().includes(q))
		.filter((r) => !status || r.status === status)
		.filter((r) => !domain || r.domain === domain)
		.filter((r) => !effort || r.effort === effort)
		.filter(
			(r) =>
				!mine ||
				r.ownerUserId === ctx.userId ||
				r.assigneeUserId === ctx.userId,
		)
		.filter(
			(r) => !overdue || (r.nextReviewAt !== null && r.nextReviewAt < today),
		)
		.filter((r) => !unowned || !r.ownerUserId)
		.sort((a, b) => {
			const la = leverage.get(a.code);
			const lb = leverage.get(b.code);
			const sa = (la?.score ?? 0) * (la?.frameworks ?? 1);
			const sb = (lb?.score ?? 0) * (lb?.frameworks ?? 1);
			return sb - sa || a.code.localeCompare(b.code);
		});

	const implemented = rows.filter((r) => r.status === "implemented").length;
	const inProgress = rows.filter((r) => r.status === "in_progress").length;

	const columns: Column<ControlRow & { id: string }>[] = [
		...(canBulk
			? [
					{
						key: "select",
						header: "",
						className: "w-8",
						mobile: false,
						cell: (r: ControlRow & { id: string }) => (
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
			className: "w-28 font-mono text-xs",
			cell: (r) => r.code,
		},
		{
			key: "title",
			header: te("title"),
			cell: (r) => <span className="font-medium">{r.title}</span>,
		},
		{
			key: "status",
			header: te("status"),
			className: "w-36",
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
		{
			key: "owner",
			header: te("owner"),
			className: "w-44",
			cell: (r) => <UserChip name={r.ownerName} />,
		},
		{
			key: "leverage",
			header: t("leverage"),
			className: "w-32",
			cell: (r) => {
				const l = leverage.get(r.code);
				return l ? (
					<span
						title={t("leverageHint", { req: l.requirements, fw: l.frameworks })}
					>
						{l.score} · {l.frameworks} RW
					</span>
				) : (
					<span className="text-muted-foreground">—</span>
				);
			},
		},
		{
			key: "effort",
			header: t("effort"),
			className: "w-20",
			mobile: false,
			cell: (r) => t(`effort_${r.effort as "S" | "M" | "L"}`),
		},
		{
			key: "updated",
			header: te("updatedAt"),
			className: "w-28 text-muted-foreground",
			mobile: false,
			cell: (r) => fmtDate.format(r.updatedAt),
		},
	];

	return (
		<BulkProvider>
			<RegisterPage
				title={t("title")}
				lead={t("lead")}
				filters={[
					{
						key: "status",
						label: te("status"),
						options: CONTROL_STATUS.states.map((s) => ({
							value: s,
							label: ts(CONTROL_STATUS.labelKey[s] as "notStarted"),
						})),
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
					{ key: "mine", label: te("chipMine") },
					{ key: "overdue", label: te("chipOverdue") },
					{ key: "unowned", label: te("chipUnowned") },
				]}
				columns={columns}
				rows={filtered.map((r) => ({ ...r, id: r.implementationId }))}
				rowHref={(r) => `/controls/${r.code}`}
				empty={
					<EmptyState
						title={t("empty")}
						lead={t("emptyLead")}
						actions={
							<Button asChild variant="outline" size="sm">
								<Link href="/einstellungen?tab=frameworks">
									Rahmenwerke wählen
								</Link>
							</Button>
						}
					/>
				}
				footer={t("countSummary", { n: rows.length, implemented, inProgress })}
			/>
			{canBulk && <BulkBar members={members} />}
		</BulkProvider>
	);
}
