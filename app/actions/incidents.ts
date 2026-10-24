"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { incidents, incidentUpdates, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import {
	approvalState,
	gateApproval,
	requestApproval,
} from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import {
	classifyDoraIncident,
	classifyNis2Incident,
	craReasons,
} from "@/lib/compliance/incident";
import {
	createIncidentRecord,
	deadlinesFor,
	insertCraBundle,
	isCra,
	ownProduct,
} from "@/lib/compliance/incident-service";
import { nonconformityFromIncident } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { mutateOrg } from "@/lib/db/with-org";
import { INCIDENT_STATUS } from "@/lib/entities/incident";
import { canTransition } from "@/lib/entities/status-machine";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	classifyIncidentSchema,
	createIncidentSchema,
	incidentMitigationSchema,
	incidentReportSchema,
	incidentUpdateSchema,
	setIncidentStatusSchema,
} from "@/lib/validation/registers";

// Drei Felder: Was · Wann bemerkt · Betrifft Zahlungen/Kunden (createIncidentRecord).
async function createIncidentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ incident: ["create"] });
	const parsed = createIncidentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await createIncidentRecord(tx, c, parsed.data);
		return { result: { id: r.id, code: r.code }, audit: r.audit };
	});
	revalidatePath("/vorfaelle");
	revalidatePath("/heute", "layout");
	return { ok: true, data: out };
}

async function classifyIncidentImpl(
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
		const cra = isCra(d.regimes) ? craReasons(d.craCriteria ?? {}) : [];
		const derived =
			dora?.classification ??
			nis2?.classification ??
			(cra.length > 0 ? "significant" : "minor");
		const classification = d.classificationOverride ?? derived;
		const reasons = [
			...(dora?.reasons ?? []),
			...(nis2?.reasons ?? []),
			...cra,
		];
		// undefined = unverändert, null = Zuordnung entfernen
		const productId =
			d.productId === undefined
				? row.productId
				: d.productId === null
					? null
					: ((await ownProduct(tx, c.orgId, d.productId)) ?? row.productId);
		const classifiedAt = row.classifiedAt ?? new Date();
		const dl = deadlinesFor({
			regimes: d.regimes,
			awareAt: row.awareAt,
			classifiedAt,
			initialReportedAt: row.initialReportedAt,
			intermediateReportedAt: row.intermediateReportedAt,
			mitigationAvailableAt: row.mitigationAvailableAt,
		});
		await tx
			.update(incidents)
			.set({
				regimes: d.regimes,
				affectsPayments: d.affectsPayments,
				doraCriteria: d.doraCriteria ?? null,
				nis2Criteria: d.nis2Criteria ?? null,
				craCriteria: isCra(d.regimes) ? (d.craCriteria ?? null) : null,
				productId,
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
		if (isCra(d.regimes) && !isCra(row.regimes))
			await insertCraBundle(tx, c.orgId, c.userId, row);
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
					productId,
					override: d.classificationOverride ?? null,
				},
			},
		};
	});
	revalidatePath("/vorfaelle", "layout");
	return res;
}

const REPORT_LABEL = {
	initial: "Erstmeldung",
	intermediate: "Zwischenbericht",
	final: "Abschlussbericht",
} as const;

type ReportResult = ActionResult<{ approvalRequested: boolean }>;

async function markIncidentReportedImpl(input: unknown): Promise<ReportResult> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = incidentReportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ReportResult>(toOrgCtx(c), async (tx) => {
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
		// Freigabe-Designer („vorab“): die Meldung an die Aufsicht erst nach
		// Freigabe als abgegeben markieren — je Meldung ein Antrag. Fehlt er,
		// wird er hier gestellt; die Meldefrist läuft weiter.
		const gateInput = {
			trigger: "incident.report",
			entityType: "incident" as const,
			entityId: row.id,
			entityVersionRef: d.report,
			facts: { incidentClass: row.classification },
		};
		const state = await approvalState(tx, c.orgId, gateInput);
		if (state === "pending")
			return { result: { ok: false, error: "approval_pending" }, audit: [] };
		if (state === "missing") {
			const gate = await gateApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					...gateInput,
					entityOwnerUserId: row.ownerUserId,
					title: `${REPORT_LABEL[d.report]} freigeben: ${row.code} · ${row.title}`,
					link: `/vorfaelle/${row.id}`,
				},
			);
			if (gate.status === "error")
				return { result: { ok: false, error: gate.error }, audit: [] };
			if (gate.status === "pending")
				return {
					result: { ok: true, data: { approvalRequested: true } },
					audit: {
						action: "incident.report_requested",
						target: `incident:${row.id}`,
						after: { report: d.report, requestId: gate.requestId },
					},
				};
		}
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
			mitigationAvailableAt: merged.mitigationAvailableAt,
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
			body: `${REPORT_LABEL[d.report]} abgegeben.${d.note ? ` ${d.note}` : ""}`,
		});
		return {
			result: { ok: true, data: { approvalRequested: false } },
			audit: {
				action: "incident.report_sent",
				target: `incident:${row.id}`,
				after: { report: d.report, at: now, note: d.note ?? null },
			},
		};
	});
	revalidatePath("/vorfaelle", "layout");
	return res;
}

// CRA: Korrektur/Abhilfe verfügbar → Abschlussbericht binnen 14 Tagen
// (aktiv ausgenutzte Schwachstelle). Frist wird hier berechnet, nie im Job.
async function markMitigationAvailableImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = incidentMitigationSchema.safeParse(input);
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
		const at = d.at ?? new Date();
		const dl = deadlinesFor({ ...row, mitigationAvailableAt: at });
		await tx
			.update(incidents)
			.set({ mitigationAvailableAt: at, finalDueAt: dl.finalDueAt })
			.where(eq(incidents.id, row.id));
		await tx.insert(incidentUpdates).values({
			organizationId: c.orgId,
			incidentId: row.id,
			authorUserId: c.userId,
			kind: "update",
			body: `Korrektur bzw. Abhilfe verfügbar seit ${at.toISOString()}.${dl.finalDueAt ? ` Abschlussbericht bis ${dl.finalDueAt.toISOString()}.` : ""}`,
		});
		return {
			result: true,
			audit: {
				action: "incident.mitigation_available",
				target: `incident:${row.id}`,
				before: {
					mitigationAvailableAt: row.mitigationAvailableAt,
					finalDueAt: row.finalDueAt,
				},
				after: { mitigationAvailableAt: at, finalDueAt: dl.finalDueAt },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/vorfaelle", "layout");
	return { ok: true, data: undefined };
}

async function addIncidentUpdateImpl(input: unknown): Promise<ActionResult> {
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

async function setIncidentStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ incident: ["update"] });
	const parsed = setIncidentStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { incidentId, status, note, selfApprovalReason } = parsed.data;
	if (status === "closed" && !allows(c, { incident: ["close"] }))
		return { ok: false, error: "forbidden" };
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
					facts: { incidentClass: row.classification },
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
		// DORA Art. 13: jeder schwerwiegende Vorfall mündet in eine Abweichung (Lessons Learned).
		const extra = [];
		if (status === "closed") {
			const draft = nonconformityFromIncident(row);
			if (draft) {
				const nc = await createNonconformity(
					tx,
					{ orgId: c.orgId, userId: c.userId },
					draft,
				);
				extra.push(nc.audit);
			}
		}
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: [
				{
					action: "incident.status",
					target: `incident:${row.id}`,
					before: { status: row.status },
					after: { status, note: note ?? null },
				},
				...extra,
			],
		};
	});
	revalidatePath("/vorfaelle", "layout");
	return res;
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const createIncident = safeAction("createIncident", createIncidentImpl);
export const classifyIncident = safeAction(
	"classifyIncident",
	classifyIncidentImpl,
);
export const markIncidentReported = safeAction(
	"markIncidentReported",
	markIncidentReportedImpl,
);
export const markMitigationAvailable = safeAction(
	"markMitigationAvailable",
	markMitigationAvailableImpl,
);
export const addIncidentUpdate = safeAction(
	"addIncidentUpdate",
	addIncidentUpdateImpl,
);
export const setIncidentStatus = safeAction(
	"setIncidentStatus",
	setIncidentStatusImpl,
);
