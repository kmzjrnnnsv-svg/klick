"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	auditFindings,
	auditProgrammeItems,
	auditProgrammes,
	auditRequests,
	audits,
	controls,
	frameworks,
	requirements,
	tasks,
} from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nonconformityFromFinding } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	auditFindingSchema,
	auditProgrammeItemSchema,
	auditProgrammeSchema,
	auditRequestSchema,
	auditSchema,
	decideAuditRequestSchema,
	findingStatusSchema,
	findingToNonconformitySchema,
	removeProgrammeItemSchema,
	respondAuditRequestSchema,
	setAuditStatusSchema,
} from "@/lib/validation/governance";

type Tx = Parameters<Parameters<typeof mutateOrg>[1]>[0];
const PATH = "/audits";

async function resolveRefs(
	tx: Tx,
	controlCode: string | null | undefined,
	requirementKey: string | null | undefined,
) {
	let controlId: string | null = null;
	let requirementId: string | null = null;
	if (controlCode) {
		const [c] = await tx
			.select({ id: controls.id })
			.from(controls)
			.where(eq(controls.code, controlCode))
			.limit(1);
		controlId = c?.id ?? null;
	}
	if (requirementKey?.includes(":")) {
		const [slug, code] = requirementKey.split(":", 2) as [string, string];
		const [r] = await tx
			.select({ id: requirements.id })
			.from(requirements)
			.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.where(and(eq(frameworks.slug, slug), eq(requirements.code, code)))
			.limit(1);
		requirementId = r?.id ?? null;
	}
	return { controlId, requirementId };
}

// ── Auditprogramm ──────────────────────────────────────────────────────────

export async function upsertProgramme(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ audit: ["create", "update"] });
	const parsed = auditProgrammeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		if (id) {
			const [before] = await tx
				.select()
				.from(auditProgrammes)
				.where(
					and(
						eq(auditProgrammes.id, id),
						eq(auditProgrammes.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before) return { result: null, audit: [] };
			await tx.update(auditProgrammes).set(d).where(eq(auditProgrammes.id, id));
			return {
				result: id,
				audit: {
					action: "audit_programme.update",
					target: `audit_programme:${id}`,
					before: {
						title: before.title,
						cycleStart: before.cycleStart,
						cycleYears: before.cycleYears,
					},
					after: d,
				},
			};
		}
		const [row] = await tx
			.insert(auditProgrammes)
			.values({ organizationId: c.orgId, ...d })
			.returning({ id: auditProgrammes.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "audit_programme.create",
				target: `audit_programme:${row.id}`,
				after: d,
			},
		};
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function addProgrammeItem(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ audit: ["update"] });
	const parsed = auditProgrammeItemSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [p] = await tx
			.select({ id: auditProgrammes.id })
			.from(auditProgrammes)
			.where(
				and(
					eq(auditProgrammes.id, d.programmeId),
					eq(auditProgrammes.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!p) return { result: false, audit: [] };
		const [row] = await tx
			.insert(auditProgrammeItems)
			.values({ organizationId: c.orgId, ...d })
			.returning({ id: auditProgrammeItems.id });
		return {
			result: true,
			audit: {
				action: "audit_programme.item_added",
				target: `audit_programme:${d.programmeId}`,
				after: {
					id: row?.id,
					scopeType: d.scopeType,
					scopeRef: d.scopeRef,
					plannedYear: d.plannedYear,
				},
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

export async function removeProgrammeItem(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ audit: ["update"] });
	const parsed = removeProgrammeItemSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(auditProgrammeItems)
			.where(
				and(
					eq(auditProgrammeItems.id, parsed.data.id),
					eq(auditProgrammeItems.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: null, audit: [] };
		await tx
			.delete(auditProgrammeItems)
			.where(eq(auditProgrammeItems.id, before.id));
		return {
			result: null,
			audit: {
				action: "audit_programme.item_removed",
				target: `audit_programme:${before.programmeId}`,
				before: {
					scopeType: before.scopeType,
					scopeRef: before.scopeRef,
					plannedYear: before.plannedYear,
				},
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// ── Audits ─────────────────────────────────────────────────────────────────

export async function upsertAudit(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ audit: ["create", "update"] });
	const parsed = auditSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const values = {
		programmeId: d.programmeId ?? null,
		type: d.type,
		title: d.title,
		scope: d.scope ?? null,
		periodStart: d.periodStart ?? null,
		periodEnd: d.periodEnd ?? null,
		frameworkIds: d.frameworkIds ?? [],
		auditorMemberIds: d.auditorMemberIds ?? [],
		externalAuditor: d.externalAuditor ?? null,
		plannedAt: d.plannedAt ?? null,
		performedAt: d.performedAt ?? null,
		reportEvidenceId: d.reportEvidenceId ?? null,
	};
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		if (id) {
			const [before] = await tx
				.select()
				.from(audits)
				.where(and(eq(audits.id, id), eq(audits.organizationId, c.orgId)))
				.limit(1);
			if (!before) return { result: null, audit: [] };
			await tx
				.update(audits)
				.set({ ...values, ownerUserId: d.ownerUserId ?? before.ownerUserId })
				.where(eq(audits.id, id));
			return {
				result: id,
				audit: {
					action: "audit.update",
					target: `audit:${id}`,
					before: {
						title: before.title,
						type: before.type,
						plannedAt: before.plannedAt,
						auditorMemberIds: before.auditorMemberIds,
					},
					after: {
						title: d.title,
						type: d.type,
						plannedAt: d.plannedAt ?? null,
						auditorMemberIds: d.auditorMemberIds ?? [],
					},
				},
			};
		}
		const [row] = await tx
			.insert(audits)
			.values({
				organizationId: c.orgId,
				...values,
				ownerUserId: d.ownerUserId ?? c.userId,
			})
			.returning({ id: audits.id });
		if (!row) throw new Error("insert failed");
		for (const uid of values.auditorMemberIds) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [uid],
				actorUserId: c.userId,
				kind: "entity_changed",
				title: `Audit: ${d.title}`,
				body: "Du wurdest als Auditor:in eingetragen.",
				link: `/audits/${row.id}`,
			});
		}
		return {
			result: row.id,
			audit: {
				action: "audit.create",
				target: `audit:${row.id}`,
				after: {
					title: d.title,
					type: d.type,
					frameworkIds: d.frameworkIds ?? [],
					plannedAt: d.plannedAt ?? null,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function setAuditStatus(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ audit: ["update"] });
	const parsed = setAuditStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { auditId, status } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ status: audits.status })
			.from(audits)
			.where(and(eq(audits.id, auditId), eq(audits.organizationId, c.orgId)))
			.limit(1);
		if (!before) return { result: false, audit: [] };
		await tx
			.update(audits)
			.set({
				status,
				performedAt:
					status === "in_progress"
						? new Date().toISOString().slice(0, 10)
						: undefined,
			})
			.where(eq(audits.id, auditId));
		return {
			result: true,
			audit: {
				action: "audit.status",
				target: `audit:${auditId}`,
				before: { status: before.status },
				after: { status },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// ── Findings ───────────────────────────────────────────────────────────────

export async function createFinding(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ audit_finding: ["create"] });
	const parsed = auditFindingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const [a] = await tx
			.select({
				id: audits.id,
				ownerUserId: audits.ownerUserId,
				title: audits.title,
			})
			.from(audits)
			.where(and(eq(audits.id, d.auditId), eq(audits.organizationId, c.orgId)))
			.limit(1);
		if (!a) return { result: null, audit: [] };
		const refs = await resolveRefs(tx, d.controlCode, d.requirementKey);
		const [row] = await tx
			.insert(auditFindings)
			.values({
				organizationId: c.orgId,
				auditId: a.id,
				severity: d.severity,
				title: d.title,
				description: d.description ?? null,
				controlId: refs.controlId,
				requirementId: refs.requirementId,
				createdByUserId: c.userId,
			})
			.returning({ id: auditFindings.id });
		if (!row) throw new Error("insert failed");
		await notify(tx, {
			orgId: c.orgId,
			recipients: [a.ownerUserId],
			actorUserId: c.userId,
			kind: "entity_changed",
			title: `Finding (${d.severity}): ${d.title}`,
			body: a.title,
			link: `/audits/${a.id}?tab=findings`,
		});
		return {
			result: row.id,
			audit: {
				action: "audit_finding.create",
				target: `audit_finding:${row.id}`,
				after: {
					auditId: a.id,
					severity: d.severity,
					title: d.title,
					controlCode: d.controlCode ?? null,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function setFindingStatus(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ audit_finding: ["update"] });
	const parsed = findingStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { findingId, status } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ status: auditFindings.status })
			.from(auditFindings)
			.where(
				and(
					eq(auditFindings.id, findingId),
					eq(auditFindings.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: false, audit: [] };
		await tx
			.update(auditFindings)
			.set({ status })
			.where(eq(auditFindings.id, findingId));
		return {
			result: true,
			audit: {
				action: "audit_finding.status",
				target: `audit_finding:${findingId}`,
				before: { status: before.status },
				after: { status },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// „Als Abweichung übernehmen": Finding → CAPA-Regelkreis.
export async function findingToNonconformity(
	input: unknown,
): Promise<ActionResult<{ nonconformityId: string; code: string }>> {
	const c = await requireOrg({ nonconformity: ["create"] });
	const parsed = findingToNonconformitySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<{ nonconformityId: string; code: string } | null>(
		toOrgCtx(c),
		async (tx) => {
			const [f] = await tx
				.select({
					f: auditFindings,
					auditOwner: audits.ownerUserId,
					controlCode: controls.code,
				})
				.from(auditFindings)
				.innerJoin(audits, eq(audits.id, auditFindings.auditId))
				.leftJoin(controls, eq(controls.id, auditFindings.controlId))
				.where(
					and(
						eq(auditFindings.id, parsed.data.findingId),
						eq(auditFindings.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!f) return { result: null, audit: [] };
			if (f.f.nonconformityId) return { result: null, audit: [] };
			const nc = await createNonconformity(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				nonconformityFromFinding({
					id: f.f.id,
					title: f.controlCode ? `${f.controlCode}: ${f.f.title}` : f.f.title,
					description: f.f.description,
					severity: f.f.severity,
					ownerUserId: f.auditOwner,
				}),
			);
			await tx
				.update(auditFindings)
				.set({ nonconformityId: nc.id, status: "in_remediation" })
				.where(eq(auditFindings.id, f.f.id));
			return {
				result: { nonconformityId: nc.id, code: nc.code },
				audit: [
					nc.audit,
					{
						action: "audit_finding.to_nonconformity",
						target: `audit_finding:${f.f.id}`,
						after: { nonconformityId: nc.id, code: nc.code },
					},
				],
			};
		},
	);
	revalidatePath(PATH, "layout");
	revalidatePath("/abweichungen");
	return res ? { ok: true, data: res } : { ok: false, error: "notFound" };
}

// ── Nachweisanfragen (PBC) ─────────────────────────────────────────────────

export async function createAuditRequest(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ audit_request: ["create"] });
	const parsed = auditRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const [a] = await tx
			.select({
				id: audits.id,
				ownerUserId: audits.ownerUserId,
				title: audits.title,
			})
			.from(audits)
			.where(and(eq(audits.id, d.auditId), eq(audits.organizationId, c.orgId)))
			.limit(1);
		if (!a) return { result: null, audit: [] };
		const refs = await resolveRefs(tx, d.controlCode, d.requirementKey);
		const assignee = d.assigneeUserId ?? a.ownerUserId ?? null;
		const [row] = await tx
			.insert(auditRequests)
			.values({
				organizationId: c.orgId,
				auditId: a.id,
				title: d.title,
				description: d.description ?? null,
				controlId: refs.controlId,
				requirementId: refs.requirementId,
				requestedByUserId: c.userId,
				assigneeUserId: assignee,
				dueAt: d.dueAt ?? null,
			})
			.returning({ id: auditRequests.id });
		if (!row) throw new Error("insert failed");
		if (assignee) {
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: c.orgId,
					title: `Nachweisanfrage: ${d.title}`,
					description: d.description ?? null,
					assigneeUserId: assignee,
					createdByUserId: c.userId,
					dueAt: d.dueAt ?? null,
					priority: "normal",
					entityType: "audit_request",
					entityId: row.id,
					sourceKind: "audit_request",
				})
				.returning({ id: tasks.id });
			await notify(tx, {
				orgId: c.orgId,
				recipients: [assignee],
				actorUserId: c.userId,
				kind: "audit_request",
				title: `Nachweisanfrage: ${d.title}`,
				body: a.title,
				link: `/audits/${a.id}?tab=anfragen`,
				payload: { taskId: task?.id },
			});
		}
		return {
			result: row.id,
			audit: {
				action: "audit_request.create",
				target: `audit_request:${row.id}`,
				after: {
					auditId: a.id,
					title: d.title,
					assigneeUserId: assignee,
					dueAt: d.dueAt ?? null,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function respondAuditRequest(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ audit_request: ["respond"] });
	const parsed = respondAuditRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [r] = await tx
			.select()
			.from(auditRequests)
			.where(
				and(
					eq(auditRequests.id, d.requestId),
					eq(auditRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!r) return { result: false, audit: [] };
		await tx
			.update(auditRequests)
			.set({
				responseNote: d.responseNote,
				responseEvidenceIds: d.responseEvidenceIds ?? [],
				status: "answered",
				answeredAt: new Date(),
			})
			.where(eq(auditRequests.id, r.id));
		await tx
			.update(tasks)
			.set({ status: "done", completedAt: new Date() })
			.where(
				and(eq(tasks.entityType, "audit_request"), eq(tasks.entityId, r.id)),
			);
		await notify(tx, {
			orgId: c.orgId,
			recipients: [r.requestedByUserId],
			actorUserId: c.userId,
			kind: "audit_request",
			title: `Nachweisanfrage beantwortet: ${r.title}`,
			link: `/audits/${r.auditId}?tab=anfragen`,
		});
		return {
			result: true,
			audit: {
				action: "audit_request.answered",
				target: `audit_request:${r.id}`,
				before: { status: r.status },
				after: {
					status: "answered",
					evidence: d.responseEvidenceIds?.length ?? 0,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

export async function decideAuditRequest(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ audit_request: ["decide"] });
	const parsed = decideAuditRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [r] = await tx
			.select()
			.from(auditRequests)
			.where(
				and(
					eq(auditRequests.id, d.requestId),
					eq(auditRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!r) return { result: false, audit: [] };
		await tx
			.update(auditRequests)
			.set({
				status: d.decision,
				decidedAt: new Date(),
				responseNote:
					d.decision === "rejected" && d.note
						? `${r.responseNote ?? ""}\n\n[Prüfer:in] ${d.note}`.trim()
						: r.responseNote,
			})
			.where(eq(auditRequests.id, r.id));
		if (d.decision === "rejected" && r.assigneeUserId) {
			await tx.insert(tasks).values({
				organizationId: c.orgId,
				title: `Nachweisanfrage nachbessern: ${r.title}`,
				description: d.note ?? null,
				assigneeUserId: r.assigneeUserId,
				createdByUserId: c.userId,
				dueAt: r.dueAt,
				priority: "high",
				entityType: "audit_request",
				entityId: r.id,
				sourceKind: "audit_request",
			});
		}
		await notify(tx, {
			orgId: c.orgId,
			recipients: [r.assigneeUserId],
			actorUserId: c.userId,
			kind: "audit_request",
			title: `${d.decision === "accepted" ? "Akzeptiert" : "Abgelehnt"}: ${r.title}`,
			body: d.note,
			link: `/audits/${r.auditId}?tab=anfragen`,
		});
		return {
			result: true,
			audit: {
				action: "audit_request.decided",
				target: `audit_request:${r.id}`,
				before: { status: r.status },
				after: { status: d.decision, note: d.note ?? null },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}
