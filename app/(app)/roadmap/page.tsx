import { getTranslations } from "next-intl/server";
import {
	DateEntryList,
	type DateLabels,
} from "@/components/calendar/date-entries";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import {
	AdoptDateButton,
	ApplyRoadmapForm,
	MilestoneForm,
	RoadmapBoard,
} from "@/components/roadmap/roadmap-board";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { ROADMAP_PHASES } from "@/lib/compliance/catalog/roadmap";
import {
	collectDates,
	type DateEntry,
	nextQuarters,
	quarterEnd,
	quarterOf,
	ROADMAP_DATE_KINDS,
} from "@/lib/compliance/dates";
import { getOrgProfile, listMembersForPicker } from "@/lib/compliance/queries";
import { loadDateSources } from "@/lib/compliance/queries-dates";
import { listMilestones } from "@/lib/compliance/queries-p4";
import { readOrg } from "@/lib/db/with-org";

// /roadmap — Kanban der Meilensteine (Vorbereitung → Agent → Antrag →
// Verfahren → Go-Live → E-Geld → Bank). Vorlage aus Businessplan 10/21.9;
// Meilenstein → Aufgabe; Controls verknüpft.
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const QUARTERS = 8;

async function RoadmapPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ milestone: ["read"] });
	const sp = await searchParams;
	const view = one(sp.ansicht) === "zeitachse" ? "zeitachse" : "kanban";
	const t = await getTranslations("Roadmap");
	const tk = await getTranslations("Calendar");
	const canEdit = allows(ctx, { milestone: ["update"] });
	const now = new Date();
	const today = now.toISOString().slice(0, 10);
	const quarters = nextQuarters(today, QUARTERS);
	const lastQ = quarters[quarters.length - 1] ?? quarterOf(today);
	const range = { from: today, to: quarterEnd(lastQ) };
	const { items, members, profile, sources } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const profile = await getOrgProfile(tx, ctx.orgId);
			return {
				items: await listMilestones(tx, ctx.orgId),
				members: await listMembersForPicker(tx, ctx.orgId),
				profile,
				sources:
					view === "zeitachse"
						? await loadDateSources(
								tx,
								ctx.orgId,
								range,
								profile?.frameworks ?? [],
								now,
							)
						: [],
			};
		},
	);
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
			<UrlTabs
				base="/roadmap"
				param="ansicht"
				active={view}
				tabs={[
					{
						value: "kanban",
						label: t("viewBoard"),
						count: items.length || undefined,
					},
					{ value: "zeitachse", label: t("viewTimeline") },
				]}
			/>
			{view === "zeitachse" ? (
				<Timeline
					quarters={quarters}
					items={items}
					entries={collectDates(sources, range, today, {
						kinds: ROADMAP_DATE_KINDS,
						includeOverdue: true,
					})}
					today={today}
					canEdit={canEdit}
					labels={{
						lead: t("timelineLead"),
						noDate: t("noDate"),
						empty: t("quarterEmpty"),
						milestone: tk("kind_milestone"),
						date: {
							kind: (k) => tk(`kind_${k}`),
							state: (st) => tk(`dstate_${st}`),
						},
					}}
				/>
			) : items.length === 0 ? (
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
					<div className="mb-4 flex flex-wrap items-center gap-2 text-subhead">
						<Badge variant="outline">
							{t("progress", { done, total: items.length })}
						</Badge>
						{overdue > 0 && (
							<Badge variant="destructive">
								{t("overdue", { n: overdue })}
							</Badge>
						)}
						{byPhase.map((p) => (
							<Badge key={p.key} variant="muted" className="">
								{p.title}: {p.done}/{p.total}
							</Badge>
						))}
					</div>
					<RoadmapBoard items={items} members={members} canEdit={canEdit} />
					<p className="mt-4 text-muted-foreground text-footnote">
						{t("hint")}
					</p>
				</>
			)}
		</>
	);
}

// Zeitachse (C2): Quartale mit Meilensteinen und planungsrelevanten Terminen
function Timeline({
	quarters,
	items,
	entries,
	today,
	canEdit,
	labels,
}: {
	quarters: string[];
	items: Awaited<ReturnType<typeof listMilestones>>;
	entries: DateEntry[];
	today: string;
	canEdit: boolean;
	labels: {
		lead: string;
		noDate: string;
		empty: string;
		milestone: string;
		date: DateLabels;
	};
}) {
	const first = quarters[0] ?? quarterOf(today);
	const milestoneEntries: DateEntry[] = items
		.filter((m) => m.dueAt)
		.map((m) => ({
			date: m.dueAt as string,
			kind: "milestone",
			title: m.title,
			href: "/roadmap",
			ownerUserId: m.ownerUserId,
			state:
				m.status === "done"
					? "done"
					: (m.dueAt as string) < today
						? "overdue"
						: "due",
		}));
	const all = [...milestoneEntries, ...entries].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	// Überfälliges landet im ersten Quartal
	const byQuarter = new Map<string, DateEntry[]>();
	for (const e of all) {
		const q = quarterOf(e.date) < first ? first : quarterOf(e.date);
		const list = byQuarter.get(q) ?? [];
		list.push(e);
		byQuarter.set(q, list);
	}
	const undated = items.filter((m) => !m.dueAt);
	const titles = new Set(items.map((m) => m.title));
	return (
		<section className="flex flex-col gap-4">
			<p className="text-muted-foreground text-subhead">{labels.lead}</p>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
				{quarters.map((q) => {
					const list = byQuarter.get(q) ?? [];
					return (
						<section key={q} className="rounded-2xl bg-card p-3">
							<h2 className="font-medium text-footnote mb-1 flex items-center justify-between text-muted-foreground">
								{q.replace("-", " ")}
								<span>{list.length}</span>
							</h2>
							{list.length === 0 ? (
								<p className="text-muted-foreground text-footnote">
									{labels.empty}
								</p>
							) : (
								<DateEntryList
									entries={list}
									labels={labels.date}
									fullDate
									action={(e) =>
										canEdit &&
										e.kind !== "milestone" &&
										(e.state === "due" || e.state === "soon") &&
										!titles.has(e.title) ? (
											<AdoptDateButton title={e.title} dueAt={e.date} />
										) : null
									}
								/>
							)}
						</section>
					);
				})}
			</div>
			{undated.length > 0 && (
				<section className="rounded-2xl bg-card p-3 text-subhead">
					<h2 className="font-medium text-footnote mb-1 text-muted-foreground">
						{labels.noDate}
					</h2>
					<ul className="flex flex-col gap-1">
						{undated.map((m) => (
							<li key={m.id}>
								{m.title}
								<span className="text-muted-foreground text-footnote">
									{" "}
									· {labels.milestone}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</section>
	);
}

export default withMessages(RoadmapPage, [
	"Auth",
	"Common",
	"Entity",
	"Functions",
	"Onboarding",
	"Organisation",
	"Roadmap",
]);
