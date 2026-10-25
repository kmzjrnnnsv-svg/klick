import { and, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	ChangeRequestDialog,
	WithdrawChangeButton,
} from "@/components/changes/change-forms";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { assets, changeRequests, processes, risks } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";

const STATUS_VARIANT = {
	pending: "warning",
	approved: "success",
	rejected: "destructive",
	withdrawn: "muted",
} as const;

// Neues Produkt, neuer Markt oder Vertriebsweg, wesentliche IT-Änderung
// (ZAG-MaRisk/MaRisk AT 8, DORA Art. 8 Abs. 3): Antrag mit Freigabe,
// Umsetzung als Aufgabe.
export default async function ChangesPage() {
	const ctx = await requireOrgPage({ task: ["read"] });
	const t = await getTranslations("Changes");
	const canCreate = allows(ctx, { task: ["create"] });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [rows, procs, ass, rks, members] = await Promise.all([
			tx
				.select()
				.from(changeRequests)
				.where(eq(changeRequests.organizationId, ctx.orgId))
				.orderBy(desc(changeRequests.createdAt)),
			tx
				.select({
					id: processes.id,
					code: processes.code,
					name: processes.name,
				})
				.from(processes)
				.where(eq(processes.organizationId, ctx.orgId))
				.orderBy(processes.code),
			tx
				.select({ id: assets.id, name: assets.name })
				.from(assets)
				.where(
					and(
						eq(assets.organizationId, ctx.orgId),
						ne(assets.status, "retired"),
					),
				)
				.orderBy(assets.name),
			tx
				.select({ id: risks.id, code: risks.code, title: risks.title })
				.from(risks)
				.where(eq(risks.organizationId, ctx.orgId))
				.orderBy(risks.code),
			listMembersForPicker(tx, ctx.orgId),
		]);
		const names = await userNames(
			tx,
			rows.map((r) => r.requestedByUserId),
		);
		return { rows, procs, ass, rks, members, names };
	});
	const procLabel = new Map(
		data.procs.map((p) => [p.id, `${p.code} ${p.name}`]),
	);
	const assetLabel = new Map(data.ass.map((a) => [a.id, a.name]));
	const riskLabel = new Map(
		data.rks.map((r) => [r.id, `${r.code} ${r.title}`]),
	);
	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate ? (
						<ChangeRequestDialog
							processes={data.procs.map((p) => ({
								id: p.id,
								label: `${p.code} ${p.name}`,
							}))}
							assets={data.ass.map((a) => ({ id: a.id, label: a.name }))}
							risks={data.rks.map((r) => ({
								id: r.id,
								label: `${r.code} ${r.title}`,
							}))}
							members={data.members}
						/>
					) : null
				}
			/>
			{data.rows.length === 0 ? (
				<EmptyState
					title={t("emptyTitle")}
					lead={t("emptyLead")}
					requiredBy={t("emptyRequiredBy")}
				/>
			) : (
				<ul className="list-inset flex flex-col overflow-hidden rounded-2xl bg-card text-subhead">
					{data.rows.map((r) => {
						const affected = [
							...r.processIds.map((id) => procLabel.get(id)),
							...r.assetIds.map((id) => assetLabel.get(id)),
						].filter(Boolean);
						return (
							<li
								key={r.id}
								className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
							>
								<div className="min-w-0">
									<p className="flex flex-wrap items-center gap-2">
										<span className="whitespace-nowrap font-mono text-footnote text-muted-foreground">
											{r.code}
										</span>
										<span className="font-medium">{r.title}</span>
										<Badge variant={STATUS_VARIANT[r.status]}>
											{t(`status_${r.status}`)}
										</Badge>
									</p>
									<p className="text-muted-foreground text-footnote">
										{[
											t(`kind_${r.kind}`),
											t("requestedBy", {
												name: names(r.requestedByUserId),
												date: fmtDate.format(r.createdAt),
											}),
										].join(" · ")}
									</p>
									{r.description && (
										<p className="mt-1 whitespace-pre-line break-words">
											{r.description}
										</p>
									)}
									{(affected.length > 0 || r.riskId) && (
										<p className="mt-1 break-words text-footnote">
											{affected.length > 0 &&
												t("affected", { list: affected.join(", ") })}
											{affected.length > 0 && r.riskId ? " · " : null}
											{r.riskId && (
												<Link
													href={`/risiken/${r.riskId}`}
													className="text-primary hover:underline"
												>
													{riskLabel.get(r.riskId) ?? t("risk")}
												</Link>
											)}
										</p>
									)}
								</div>
								{canCreate && r.status === "pending" && (
									<WithdrawChangeButton id={r.id} code={r.code} />
								)}
							</li>
						);
					})}
				</ul>
			)}
		</>
	);

	function names(id: string | null): string {
		return (id ? data.names.get(id) : null) ?? "—";
	}
}
