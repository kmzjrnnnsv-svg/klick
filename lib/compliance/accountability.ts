import type {
	AccountabilityItem,
	AccountabilitySection,
} from "@/components/accountability/accountability-view";
import type { PendingForUser } from "@/lib/approvals/service";
import type { accountabilityFor } from "./queries-p3";

// Baut aus den Rechenschafts-Rohdaten die Abschnitte der Sicht (pure).
export function buildAccountabilitySections(
	data: {
		acc: Awaited<ReturnType<typeof accountabilityFor>>;
		approvals: PendingForUser[];
		acks: { id: string; docNumber: string; title: string; version: string }[];
	},
	today: string,
	titles: Record<
		| "controls"
		| "overdueReviews"
		| "processes"
		| "assets"
		| "documents"
		| "risks"
		| "tasks"
		| "approvals"
		| "acks"
		| "nonconformities"
		| "obligations"
		| "audits",
		string
	>,
): AccountabilitySection[] {
	const { acc } = data;
	const sec = (
		key: keyof typeof titles,
		items: AccountabilityItem[],
	): AccountabilitySection => ({ key, title: titles[key], items });
	return [
		sec(
			"tasks",
			acc.tasks.map((x) => ({
				id: x.id,
				href: "/heute/aufgaben",
				title: x.title,
				dueAt: x.dueAt,
				overdue: Boolean(x.dueAt && x.dueAt < today),
				status: x.status,
			})),
		),
		sec(
			"approvals",
			data.approvals.map((r) => ({
				id: r.id,
				href: "/heute/freigaben",
				title: r.workflowName,
				meta: r.entityType,
				dueAt: r.dueAt,
				overdue: r.overdue,
			})),
		),
		sec(
			"acks",
			data.acks.map((d) => ({
				id: d.id,
				href: `/dokumente/${encodeURIComponent(d.docNumber)}`,
				code: d.docNumber,
				title: d.title,
				meta: `v${d.version}`,
			})),
		),
		sec(
			"overdueReviews",
			acc.overdueReviews.map((c) => ({
				id: c.implementationId,
				href: `/controls/${c.code}`,
				code: c.code,
				title: c.title,
				dueAt: c.nextReviewAt,
				overdue: true,
			})),
		),
		sec(
			"controls",
			acc.controls.map((c) => ({
				id: c.implementationId,
				href: `/controls/${c.code}`,
				code: c.code,
				title: c.title,
				status: c.status,
				dueAt: c.nextReviewAt,
				overdue: Boolean(c.nextReviewAt && c.nextReviewAt < today),
			})),
		),
		sec(
			"processes",
			acc.processes.map((p) => ({
				id: p.id,
				href: `/prozesse/${encodeURIComponent(p.code)}`,
				code: p.code,
				title: p.name,
				status: p.criticality,
				dueAt: p.reviewAt,
				overdue: Boolean(p.reviewAt && p.reviewAt < today),
			})),
		),
		sec(
			"assets",
			acc.assets.map((a) => ({
				id: a.id,
				href: "/assets",
				title: a.name,
				meta: a.classification,
			})),
		),
		sec(
			"documents",
			acc.documents.map((d) => ({
				id: d.id,
				href: `/dokumente/${encodeURIComponent(d.docNumber)}`,
				code: d.docNumber,
				title: d.title,
				status: d.status,
				dueAt: d.nextReviewAt,
				overdue: Boolean(d.nextReviewAt && d.nextReviewAt < today),
			})),
		),
		sec(
			"risks",
			acc.risks.map((r) => ({
				id: r.id,
				href: `/risiken/${r.id}`,
				code: r.code,
				title: r.title,
				status: r.status,
				dueAt: r.reviewAt,
				overdue: Boolean(r.reviewAt && r.reviewAt < today),
			})),
		),
		sec(
			"nonconformities",
			acc.nonconformities.map((n) => ({
				id: n.id,
				href: `/abweichungen/${n.id}`,
				code: n.code,
				title: n.title,
				status: n.status,
				dueAt: n.dueAt,
				overdue: Boolean(n.dueAt && n.dueAt < today),
			})),
		),
		sec(
			"obligations",
			acc.obligations.map((o) => ({
				id: o.id,
				href: "/kalender?tab=pflichten",
				code: o.code,
				title: o.title,
				meta: o.frequency,
			})),
		),
		sec(
			"audits",
			acc.audits.map((a) => ({
				id: a.id,
				href: `/audits/${a.id}`,
				title: a.title,
				status: a.status,
				dueAt: a.plannedAt,
			})),
		),
	];
}
