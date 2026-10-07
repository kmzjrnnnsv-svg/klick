"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	incidents,
	incidentUpdates,
	roleAssignments,
	tasks,
} from "@/db/schema";
import { requestApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import {
	classifyDoraIncident,
	classifyNis2Incident,
	computeIncidentDeadlines,
	nextIncidentCode,
} from "@/lib/compliance/incident";
import { mutateOrg } from "@/lib/db/with-org";
import { INCIDENT_STATUS } from "@/lib/entities/incident";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	classifyIncidentSchema,
	createIncidentSchema,
	incidentReportSchema,
	incidentUpdateSchema,
	setIncidentStatusSchema,
} from "@/lib/validation/registers";

type Tx = Parameters<Parameters<typeof mutateOrg>[1]>[0];

// Fristen aus Regimes + Zeitstempeln ableiten (DORA führend, sonst erstes Regime).
function deadlinesFor(row: {
	regimes: readonly string[];
	awareAt: Date;
	classifiedAt: Date | null;
	initialReportedAt: Date | null;
	intermediateReportedAt: Date | null;
}) {
	const regime = (
		row.regimes.includes("dora") ? "dora" : (row.regimes[0] ?? "dora")
	) as "dora" | "nis2" | "dsgvo" | "gwg_sar";
	return computeIncidentDeadlines(regime, {
		awareAt: row.awareAt,
		classifiedAt: row.classifiedAt,
		initialReportedAt: row.initialReportedAt,
		intermediateReportedAt: row.intermediateReportedAt,
	});
}

async function incidentManager(tx: Tx, orgId: string): Promise<string | null> {
	const [r] = await tx
		.select({ userId: roleAssignments.userId })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, "incident_manager"),
			),
		)
		.limit(1);
	return r?.userId ?? null;
}

// Drei Felder: Was · Wann bemerkt · Betrifft Zahlungen/Kunden → Uhren laufen ab Kenntnis.
export async function createIncident(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ incident: ["create"] });
	const parsed = createIncidentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = await tx
			.select({ code: incidents.code })
			.from(incidents)
			.where(eq(incidents.organizationId, c.orgId));
		const code = nextIncidentCode(existing.map((r) => r.code));
		const regimes = [
			...new Set([
				...d.regimes,
				...(d.affectsPayments ? ["dora" as const] : []),
				...(d.affectsCustomers ? ["dsgvo" as const] : []),
			]),
		];
		const dl = deadlinesFor({
			regimes,
			awareAt: d.awareAt,
			classifiedAt: null,
			initialReportedAt: null,
			intermediateReportedAt: null,
		});
		const owner = (await incidentManager(tx, c.orgId)) ?? c.userId;
		const [row] = await tx
			.insert(incidents)
			.values({
				organizationId: c.orgId,
				code,
				title: d.title,
				description: d.description ?? null,
				awareAt: d.awareAt,
				regimes,
				affectsPayments: d.affectsPayments,
				earlyWarningAt: dl.earlyWarningAt,
				initialDueAt: dl.initialDueAt,
				intermediateDueAt: dl.intermediateDueAt,
				finalDueAt: dl.finalDueAt,
				ownerUserId: owner,
				assigneeUserId: c.userId,
			})
			.returning({ id: incidents.id });
		if (!row) throw new Error("insert failed");
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "status_change",
			body: `Vorfall erfasst. Kenntnis: ${d.awareAt.toISOString()}`,
		});
		await notify(tx, {
			orgId: c.orgId,
			recipients: [owner],
			actorUserId: c.userId,
			kind: "incident_deadline",
			title: `Neuer Vorfall ${code}: Erstmeldung bis ${dl.initialDueAt.toISOString()}`,
			link: `/vorfaelle/${row.id}`,
		});
		return {
			result: { id: row.id, code },
			audit: {
				action: "incident.create",
				target: `incident:${row.id}`,
				after: {
					code,
					title: d.title,
					awareAt: d.awareAt,
					regimes,
					affectsPayments: d.affectsPayments,
				},
			},
		};
	});
	revalidatePath("/vorfaelle");
	revalidatePath("/heute", "layout");
	return { ok: true, data: out };
}

export async function classifyIncident(
	input: unknown,
): Promise<ActionResult<{ classification: string; reasons: string[] }>> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = classifyIncidentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ classification: string; reasons: string[] }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(incidents)
			.where(
				and(
					eq(incidents.id, d.incidentId),
					eq(incidents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const dora = d.regimes.includes("dora")
			? classifyDoraIncident({ ...(d.doraCriteria ?? {}) })
			: null;
		const nis2 = d.regimes.includes("nis2")
			? classifyNis2Incident(d.nis2Criteria ?? {})
			: null;
		const derived = dora?.classification ?? nis2?.classification ?? "minor";
		const classification = d.classificationOverride ?? derived;
		const reasons = [...(dora?.reasons ?? []), ...(nis2?.reasons ?? [])];
		const classifiedAt = row.classifiedAt ?? new Date();
		const dl = deadlinesFor({
			regimes: d.regimes,
			awareAt: row.awareAt,
			classifiedAt,
			initialReportedAt: row.initialReportedAt,
			intermediateReportedAt: row.intermediateReportedAt,
		});
		await tx
			.update(incidents)
			.set({
				regimes: d.regimes,
				affectsPayments: d.affectsPayments,
				doraCriteria: d.doraCriteria ?? null,
				nis2Criteria: d.nis2Criteria ?? null,
				classification,
				classificationOverrideNote: d.classificationOverride
					? (d.classificationOverrideNote ?? null)
					: null,
				classifiedAt,
				earlyWarningAt: dl.earlyWarningAt,
				initialDueAt: dl.initialDueAt,
				intermediateDueAt: dl.intermediateDueAt,
				finalDueAt: dl.finalDueAt,
			})
			.where(eq(incidents.id, row.id));
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "classification",
			body: `Einstufung: ${classification}${reasons.length ? ` — ${reasons.join("; ")}` : ""}${d.classificationOverride ? ` (manuell: ${d.classificationOverrideNote ?? ""})` : ""}`,
		});
		// Major → Erstreaktions-Paket als Aufgaben (einmal).
		if (classification === "major" && row.classification !== "major") {
			const bundle = TASK_BUNDLES.find((b) => b.code === "INCIDENT_DORA");
			if (bundle) {
				const owner = row.ownerUserId ?? c.userId;
				await tx.insert(tasks).values(
					bundle.items.map((it) => ({
						organizationId: c.orgId,
						title: `${row.code}: ${it.title}`,
						assigneeUserId: owner,
						createdByUserId: c.userId,
						dueAt: new Date(Date.now() + (it.offsetDays ?? 0) * 86_400_000)
							.toISOString()
							.slice(0, 10),
						entityType: "incident" as const,
						entityId: row.id,
						sourceKind: "incident_action" as const,
						bundleCode: bundle.code,
						priority: "critical" as const,
					})),
				);
			}
		}
		return {
			result: { ok: true, data: { classification, reasons } },
			audit: {
				action: "incident.classified",
				target: `incident:${row.id}`,
				before: { classification: row.classification },
				after: {
					classification,
					derived,
					reasons,
					regimes: d.regimes,
					override: d.classificationOverride ?? null,
				},
			},
		};
	});
	revalidatePath("/vorfaelle", "layout");
	return res;
}

export async function markIncidentReported(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = incidentReportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(incidents)
			.where(
				and(
					eq(incidents.id, d.incidentId),
					eq(incidents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const now = new Date();
		const patch =
			d.report === "initial"
				? { initialReportedAt: now }
				: d.report === "intermediate"
					? { intermediateReportedAt: now }
					: { finalReportedAt: now };
		const merged = { ...row, ...patch };
		const dl = deadlinesFor({
			regimes: merged.regimes,
			awareAt: merged.awareAt,
			classifiedAt: merged.classifiedAt,
			initialReportedAt: merged.initialReportedAt,
			intermediateReportedAt: merged.intermediateReportedAt,
		});
		await tx
			.update(incidents)
			.set({
				...patch,
				intermediateDueAt: dl.intermediateDueAt,
				finalDueAt: dl.finalDueAt,
			})
			.where(eq(incidents.id, row.id));
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "report_sent",
			body: `${d.report === "initial" ? "Erstmeldung" : d.report === "intermediate" ? "Zwischenbericht" : "Abschlussbericht"} abgegeben.${d.note ? ` ${d.note}` : ""}`,
		});
		return {
			result: true,
			audit: {
				action: "incident.report_sent",
				target: `incident:${row.id}`,
				after: { report: d.report, at: now, note: d.note ?? null },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/vorfaelle", "layout");
	return { ok: true, data: undefined };
}

export async function addIncidentUpdate(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = incidentUpdateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ id: incidents.id })
			.from(incidents)
			.where(
				and(
					eq(incidents.id, d.incidentId),
					eq(incidents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "update",
			body: d.body,
		});
		if (d.rootCause)
			await tx
				.update(incidents)
				.set({ rootCause: d.rootCause })
				.where(eq(incidents.id, row.id));
		return {
			result: true,
			audit: {
				action: "incident.update",
				target: `incident:${row.id}`,
				after: {
					body: d.body.slice(0, 200),
					rootCause: d.rootCause ?? undefined,
				},
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/vorfaelle", "layout");
	return { ok: true, data: undefined };
}

export async function setIncidentStatus(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = setIncidentStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { incidentId, status, note, selfApprovalReason } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(incidents)
			.where(
				and(
					eq(incidents.id, incidentId),
					eq(incidents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(INCIDENT_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};
		if (status === "closed") {
			if (!row.rootCause)
				return { result: { ok: false, error: "rootCauseRequired" }, audit: [] };
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "incident_closure",
					entityType: "incident",
					entityId: row.id,
					entityOwnerUserId: row.ownerUserId,
					title: `${row.code} · ${row.title}`,
					link: `/vorfaelle/${row.id}`,
					selfApprovalReason,
				},
			);
			if (r.ok && r.status === "pending") {
				return {
					result: {
						ok: true,
						data: { status: row.status, approvalRequested: true },
					},
					audit: {
						action: "incident.closure_requested",
						target: `incident:${row.id}`,
						after: { requestId: r.requestId },
					},
				};
			}
			if (!r.ok && r.error !== "workflow_disabled")
				return { result: { ok: false, error: r.error }, audit: [] };
		}
		await tx.update(incidents).set({ status }).where(eq(incidents.id, row.id));
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "status_change",
			body: `Status: ${status}${note ? ` — ${note}` : ""}`,
		});
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "incident.status",
				target: `incident:${row.id}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath("/vorfaelle", "layout");
	return res;
}
