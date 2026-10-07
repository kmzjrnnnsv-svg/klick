import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { DelegationForm } from "@/components/approvals/delegation-form";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	listRequestsForUser,
	type PendingForUser,
} from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { entityHref, resolveEntityTitles } from "@/lib/entities/links";

export default async function ApprovalsInboxPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; request?: string }>;
}) {
	const { tab = "waiting", request } = await searchParams;
	const ctx = await requireOrg({ approval: ["read"] });
	const t = await getTranslations("Approvals");
	const ts = await getTranslations("Status");
	const { rows, members, entityTitles } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const rows = await listRequestsForUser(tx, ctx.orgId, ctx.userId, {
				includeDecided: tab === "decided",
			});
			return {
				rows,
				members: await listMembersForPicker(tx, ctx.orgId),
				entityTitles: await resolveEntityTitles(
					tx,
					ctx.orgId,
					rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId })),
				),
			};
		},
	);
	const waiting = rows.filter((r) => r.eligible);
	const mine = rows.filter((r) => r.mine);
	const list: PendingForUser[] =
		tab === "waiting" ? waiting : tab === "mine" ? mine : rows;
	const highlight = request;

	return (
		<>
			<PageHeader title={t("title")} lead={t("lead")} />
			<UrlTabs
				base="/heute/freigaben"
				active={tab}
				tabs={[
					{ value: "waiting", label: t("waiting"), count: waiting.length },
					{ value: "mine", label: t("mine"), count: mine.length },
					{ value: "all", label: t("all"), count: rows.length },
					{ value: "decided", label: t("decided") },
				]}
			/>
			{list.length === 0 ? (
				<EmptyState title={t("empty")} />
			) : (
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
					{list.map((r) => {
						const title =
							entityTitles.get(`${r.entityType}:${r.entityId}`) ??
							`${r.entityType}`;
						return (
							<li
								key={r.id}
								id={r.id}
								className={`flex flex-col gap-2 px-3 py-3 ${highlight === r.id ? "bg-primary/5" : ""}`}
							>
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										variant="outline"
										className="normal-case tracking-normal"
									>
										{r.workflowName}
									</Badge>
									<Link
										href={entityHref(r.entityType, r.entityId, title)}
										className="min-w-0 flex-1 truncate font-medium hover:underline underline-offset-4"
									>
										{title}
									</Link>
									<span className="text-muted-foreground text-xs">
										{t("step", { n: r.currentStep })} · {t("requestedBy")}{" "}
										{r.requestedByName ?? "—"} · {fmtDate.format(r.requestedAt)}
									</span>
									{r.dueAt && (
										<Badge variant={r.overdue ? "destructive" : "muted"}>
											{r.overdue
												? t("overdue")
												: `${t("dueAt")} ${fmtDate.format(r.dueAt)}`}
										</Badge>
									)}
									{tab === "decided" && (
										<Badge variant="muted">{ts("statusChanged")}</Badge>
									)}
								</div>
								<ApprovalActions
									requestId={r.id}
									eligible={r.eligible}
									mine={r.mine}
									compact
								/>
							</li>
						);
					})}
				</ul>
			)}
			<div className="mt-8">
				<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground">
					{t("delegation")}
				</h2>
				<DelegationForm members={members} selfId={ctx.userId} />
			</div>
		</>
	);
}
