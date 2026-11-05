import { and, count, eq, inArray, max, sql } from "drizzle-orm";
import {
	audits,
	bcmExercises,
	bcmPlans,
	changeRequests,
	documents,
	incidents,
	kpiMeasurements,
	managementReviews,
	nonconformities,
	objectives,
	processes,
	providers,
	risks,
	roleAssignments,
	trainingAssignments,
} from "@/db/schema";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { ISMS_PROGRAMME } from "@/lib/compliance/catalog/isms-programme";
import type { OrgTx } from "@/lib/db/with-org";
import { currentVersionsByDocument } from "@/lib/documents/in-force";
import { type DocFact, type IsmsFacts, yearBefore } from "./status";

// Lader für den Stand je Punkt (P2a): nur Zähler und Daten, keine Inhalte.
// Jede Abfrage läuft im Org-Kontext (readOrg) und zählt in SQL.

const TEMPLATE_CODES = [
	...new Set(ISMS_PROGRAMME.flatMap((i) => i.templates ?? [])),
];

function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function dayOf(v: string | Date | null | undefined): string | null {
	if (!v) return null;
	return typeof v === "string" ? v.slice(0, 10) : isoDay(v);
}

export async function loadIsmsFacts(
	tx: OrgTx,
	orgId: string,
	now: Date = new Date(),
): Promise<IsmsFacts> {
	const today = isoDay(now);
	const yearAgo = yearBefore(today);
	const kpiSince = isoDay(new Date(now.getTime() - 100 * 86_400_000));

	const docRows = await tx
		.select({
			id: documents.id,
			templateCode: documents.templateCode,
			nextReviewAt: documents.nextReviewAt,
		})
		.from(documents)
		.where(
			and(
				eq(documents.organizationId, orgId),
				inArray(documents.templateCode, TEMPLATE_CODES),
				sql`${documents.status} not in ('retired', 'superseded')`,
			),
		);
	const current = docRows.length
		? await currentVersionsByDocument(tx, orgId, now, { withBody: false })
		: new Map();
	const docs: Record<string, DocFact[]> = {};
	for (const d of docRows) {
		if (!d.templateCode) continue;
		const list = docs[d.templateCode] ?? [];
		list.push({ valid: current.has(d.id), nextReviewAt: d.nextReviewAt });
		docs[d.templateCode] = list;
	}

	const [isb] = await tx
		.select({ n: count() })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, "isb_ciso"),
				effectiveAssignment(),
			),
		);

	const [risk] = await tx
		.select({
			total: count(),
			current: sql<number>`count(*) filter (where ${risks.assessedAt} >= ${yearAgo})`,
		})
		.from(risks)
		.where(
			and(
				eq(risks.organizationId, orgId),
				inArray(risks.status, ["open", "in_treatment", "accepted"]),
			),
		);

	const [bia] = await tx
		.select({
			critical: count(),
			current: sql<number>`count(*) filter (where ${processes.bia}->>'assessedAt' >= ${yearAgo})`,
		})
		.from(processes)
		.where(
			and(
				eq(processes.organizationId, orgId),
				eq(processes.criticality, "critical"),
				eq(processes.status, "active"),
			),
		);

	const [plans] = await tx
		.select({
			released: sql<number>`count(*) filter (where ${bcmPlans.status} = 'released')`,
			overdue: sql<number>`count(*) filter (where ${bcmPlans.status} = 'released' and ${bcmPlans.reviewAt} < ${today})`,
		})
		.from(bcmPlans)
		.innerJoin(processes, eq(processes.id, bcmPlans.processId))
		.where(
			and(
				eq(bcmPlans.organizationId, orgId),
				eq(processes.criticality, "critical"),
				eq(processes.status, "active"),
			),
		);

	const [ex] = await tx
		.select({
			lastDone: sql<
				string | null
			>`max(${bcmExercises.endedAt}) filter (where ${bcmExercises.status} = 'done')`,
			planned: sql<number>`count(*) filter (where ${bcmExercises.status} = 'planned')`,
		})
		.from(bcmExercises)
		.where(eq(bcmExercises.organizationId, orgId));

	const auditRows = await tx
		.select({
			external: sql<boolean>`${audits.type} <> 'internal'`,
			lastDone: max(audits.performedAt),
			next: sql<
				string | null
			>`min(${audits.plannedAt}) filter (where ${audits.status} in ('planned', 'in_progress') and ${audits.plannedAt} >= ${today})`,
		})
		.from(audits)
		.where(
			and(
				eq(audits.organizationId, orgId),
				inArray(audits.type, ["internal", "external", "certification"]),
			),
		)
		.groupBy(sql`${audits.type} <> 'internal'`);
	const auditOf = (external: boolean) => {
		const r = auditRows.find((a) => Boolean(a.external) === external);
		return { lastDone: dayOf(r?.lastDone), next: dayOf(r?.next) };
	};

	const [review] = await tx
		.select({
			lastHeld: sql<
				string | null
			>`max(${managementReviews.heldAt}) filter (where ${managementReviews.status} in ('held', 'done'))`,
			next: sql<
				string | null
			>`min(${managementReviews.heldAt}) filter (where ${managementReviews.status} = 'planned' and ${managementReviews.heldAt} >= ${today})`,
		})
		.from(managementReviews)
		.where(eq(managementReviews.organizationId, orgId));

	const [kpi] = await tx
		.select({
			approved: count(),
			measured: sql<number>`count(*) filter (where exists (select 1 from ${kpiMeasurements} m where m.objective_id = ${objectives.id} and m.measured_at >= ${kpiSince}))`,
		})
		.from(objectives)
		.where(
			and(
				eq(objectives.organizationId, orgId),
				eq(objectives.approvalStatus, "approved"),
			),
		);

	const [nc] = await tx
		.select({
			open: count(),
			overdue: sql<number>`count(*) filter (where ${nonconformities.dueAt} < ${today})`,
		})
		.from(nonconformities)
		.where(
			and(
				eq(nonconformities.organizationId, orgId),
				inArray(nonconformities.status, ["open", "in_progress"]),
			),
		);

	const [sup] = await tx
		.select({
			running: count(),
			overdue: sql<number>`count(*) filter (where ${providers.nextAssessmentAt} < ${today})`,
		})
		.from(providers)
		.where(
			and(
				eq(providers.organizationId, orgId),
				inArray(providers.status, ["active", "onboarding", "paused"]),
			),
		);

	const [tr] = await tx
		.select({
			open: count(),
			overdue: sql<number>`count(*) filter (where ${trainingAssignments.dueAt} < ${today})`,
		})
		.from(trainingAssignments)
		.where(
			and(
				eq(trainingAssignments.organizationId, orgId),
				inArray(trainingAssignments.status, ["due", "overdue"]),
			),
		);

	const [inc] = await tx
		.select({ open: count() })
		.from(incidents)
		.where(
			and(
				eq(incidents.organizationId, orgId),
				inArray(incidents.status, ["open", "contained"]),
			),
		);

	const [chg] = await tx
		.select({ pending: count() })
		.from(changeRequests)
		.where(
			and(
				eq(changeRequests.organizationId, orgId),
				eq(changeRequests.status, "pending"),
			),
		);

	const n = (v: unknown) => Number(v ?? 0);
	return {
		today,
		documents: docs,
		isbAppointed: n(isb?.n) > 0,
		risks: { total: n(risk?.total), current: n(risk?.current) },
		bia: { critical: n(bia?.critical), current: n(bia?.current) },
		bcmPlans: {
			critical: n(bia?.critical),
			released: n(plans?.released),
			overdue: n(plans?.overdue),
		},
		exercises: { lastDone: dayOf(ex?.lastDone), planned: n(ex?.planned) },
		audits: { internal: auditOf(false), external: auditOf(true) },
		managementReview: {
			lastHeld: dayOf(review?.lastHeld),
			next: dayOf(review?.next),
		},
		kpis: { approved: n(kpi?.approved), measured: n(kpi?.measured) },
		nonconformities: { open: n(nc?.open), overdue: n(nc?.overdue) },
		suppliers: { running: n(sup?.running), overdue: n(sup?.overdue) },
		trainings: { open: n(tr?.open), overdue: n(tr?.overdue) },
		incidents: { open: n(inc?.open) },
		changes: { pending: n(chg?.pending) },
	};
}
