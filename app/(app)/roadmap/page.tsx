import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import {
	ApplyRoadmapForm,
	MilestoneForm,
	RoadmapBoard,
} from "@/components/roadmap/roadmap-board";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { ROADMAP_PHASES } from "@/lib/compliance/catalog/roadmap";
import { getOrgProfile, listMembersForPicker } from "@/lib/compliance/queries";
import { listMilestones } from "@/lib/compliance/queries-p4";
import { readOrg } from "@/lib/db/with-org";

// /roadmap — Kanban der Meilensteine (Vorbereitung → Agent → Antrag →
// Verfahren → Go-Live → E-Geld → Bank). Vorlage aus Businessplan 10/21.9;
// Meilenstein → Aufgabe; Controls verknüpft.
export default async function RoadmapPage() {
	const ctx = await requireOrgPage({ milestone: ["read"] });
	const t = await getTranslations("Roadmap");
	const canEdit = roleAllows(ctx.orgRole, { milestone: ["update"] });
	const { items, members, profile } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			items: await listMilestones(tx, ctx.orgId),
			members: await listMembersForPicker(tx, ctx.orgId),
			profile: await getOrgProfile(tx, ctx.orgId),
		}),
	);
	const today = new Date().toISOString().slice(0, 10);
	const overdue = items.filter(
		(m) => m.status !== "done" && m.dueAt && m.dueAt < today,
	).length;
	const done = items.filter((m) => m.status === "done").length;
	const stage = profile?.profile.licenceStage ?? "0_vorbereitung";
	const byPhase = ROADMAP_PHASES.map((p) => ({
		...p,
		total: items.filter((m) => m.phase === p.key).length,
		done: items.filter((m) => m.phase === p.key && m.status === "done").length,
	})).filter((p) => p.total > 0);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						<span className="flex flex-wrap gap-2">
							<ApplyRoadmapForm defaultStage={stage} />
							<MilestoneForm members={members} />
						</span>
					) : undefined
				}
			/>
			{items.length === 0 ? (
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canEdit ? (
							<>
								<ApplyRoadmapForm defaultStage={stage} />
								<MilestoneForm members={members} />
							</>
						) : undefined
					}
				/>
			) : (
				<>
					<div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
						<Badge variant="outline">
							{t("progress", { done, total: items.length })}
						</Badge>
						{overdue > 0 && (
							<Badge variant="destructive">
								{t("overdue", { n: overdue })}
							</Badge>
						)}
						{byPhase.map((p) => (
							<Badge
								key={p.key}
								variant="muted"
								className="normal-case tracking-normal"
							>
								{p.title}: {p.done}/{p.total}
							</Badge>
						))}
					</div>
					<RoadmapBoard items={items} members={members} canEdit={canEdit} />
					<p className="mt-4 text-muted-foreground text-xs">{t("hint")}</p>
				</>
			)}
		</>
	);
}
