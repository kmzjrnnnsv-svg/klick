"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	communications,
	conflictsOfInterest,
	contextIssues,
	frameworks,
	interestedParties,
	kpiMeasurements,
	objectives,
	regulatorInteractions,
	roleAssignments,
	scopes,
} from "@/db/schema";
import { requestApproval } from "@/lib/approvals/service";
import {
	AuthError,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import {
	applicableCommunications,
	applicableParties,
} from "@/lib/compliance/catalog/interested-parties";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { listOrgFrameworks } from "@/lib/org/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	communicationSchema,
	conflictSchema,
	contextIssueSchema,
	deleteByIdSchema,
	interestedPartySchema,
	kpiMeasurementSchema,
	objectiveSchema,
	regulatorInteractionSchema,
	requestScopeApprovalSchema,
	roleAssignmentSchema,
	scopeSchema,
} from "@/lib/validation/governance";

const PATH = "/organisation";

type Tx = Parameters<Parameters<typeof mutateOrg>[1]>[0];

// Generisches Upsert mit Audit (before/after) für die kleinen Register.
async function upsertRow<
	TTable extends { id: unknown; organizationId: unknown },
>(
	tx: Tx,
	orgId: string,
	table: Parameters<Tx["insert"]>[0] & {
		id: TTable["id"];
		organizationId: TTable["organizationId"];
	},
	id: string | undefined,
	values: Record<string, unknown>,
	entity: string,
	summary: (row: Record<string, unknown>) => Record<string, unknown>,
) {
	// biome-ignore lint/suspicious/noExplicitAny: generische Drizzle-Tabelle
	const t = table as any;
	if (id) {
		const [before] = await tx
			.select()
			.from(t)
			.where(and(eq(t.id, id), eq(t.organizationId, orgId)))
			.limit(1);
		if (!before) return null;
		await tx.update(t).set(values).where(eq(t.id, id));
		return {
			id,
			audit: {
				action: `${entity}.update`,
				target: `${entity}:${id}`,
				before: summary(before as Record<string, unknown>),
				after: summary(values),
			},
		};
	}
	const [row] = await tx
		.insert(t)
		.values({ organizationId: orgId, ...values })
		.returning({ id: t.id });
	if (!row) throw new Error("insert failed");
	return {
		id: row.id as string,
		audit: {
			action: `${entity}.create`,
			target: `${entity}:${row.id}`,
			after: summary(values),
		},
	};
}

async function deleteRow(
	tx: Tx,
	orgId: string,
	// biome-ignore lint/suspicious/noExplicitAny: generische Drizzle-Tabelle
	table: any,
	id: string,
	entity: string,
	summary: (row: Record<string, unknown>) => Record<string, unknown>,
) {
	const [before] = await tx
		.select()
		.from(table)
		.where(and(eq(table.id, id), eq(table.organizationId, orgId)))
		.limit(1);
	if (!before) return null;
	await tx.delete(table).where(eq(table.id, id));
	return {
		action: `${entity}.delete`,
		target: `${entity}:${id}`,
		before: summary(before as Record<string, unknown>),
	};
}

// ── Kontext & Parteien ─────────────────────────────────────────────────────

export async function upsertContextIssue(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = contextIssueSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			contextIssues,
			id,
			{
				scope: d.scope,
				title: d.title,
				description: d.description ?? null,
				impact: d.impact ?? null,
				relatedRiskId: d.relatedRiskId ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				reviewAt: d.reviewAt ?? null,
			},
			"context_issue",
			(r) => ({ title: r.title, scope: r.scope }),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function deleteContextIssue(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = deleteByIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await deleteRow(
			tx,
			c.orgId,
			contextIssues,
			parsed.data.id,
			"context_issue",
			(r) => ({ title: r.title }),
		);
		return { result: null, audit: a ?? [] };
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export async function upsertInterestedParty(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = interestedPartySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			interestedParties,
			id,
			{
				name: d.name,
				type: d.type,
				expectations: d.expectations ?? null,
				requirements: d.requirements ?? null,
				relevantFrameworks: d.relevantFrameworks ?? [],
				howAddressed: d.howAddressed ?? null,
				contact: d.contact ?? null,
				ownerUserId: d.ownerUserId ?? null,
				reviewAt: d.reviewAt ?? null,
			},
			"interested_party",
			(r) => ({ name: r.name, type: r.type }),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function deleteInterestedParty(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = deleteByIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await deleteRow(
			tx,
			c.orgId,
			interestedParties,
			parsed.data.id,
			"interested_party",
			(r) => ({ name: r.name }),
		);
		return { result: null, audit: a ?? [] };
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Parteien + Kommunikationsmatrix aus dem Katalog (nur fehlende Einträge).
export async function applyGovernanceSeed(): Promise<
	ActionResult<{ parties: number; communications: number }>
> {
	const c = await requireOrg({ organisation: ["update"] });
	const data = await mutateOrg(toOrgCtx(c), async (tx) => {
		const fws = (await listOrgFrameworks(tx, c.orgId)).map((f) => f.slug);
		const existingParties = await tx
			.select({ id: interestedParties.id, name: interestedParties.name })
			.from(interestedParties)
			.where(eq(interestedParties.organizationId, c.orgId));
		const partyNames = new Set(existingParties.map((p) => p.name));
		const partyIdByKey = new Map<string, string>();
		let parties = 0;
		for (const p of applicableParties(fws)) {
			const found = existingParties.find((e) => e.name === p.name);
			if (found) {
				partyIdByKey.set(p.key, found.id);
				continue;
			}
			if (partyNames.has(p.name)) continue;
			const [row] = await tx
				.insert(interestedParties)
				.values({
					organizationId: c.orgId,
					name: p.name,
					type: p.type,
					expectations: p.expectations,
					requirements: p.requirements,
					relevantFrameworks: [...p.relevantFrameworks],
					howAddressed: p.howAddressed,
					contact: p.contact ?? null,
				})
				.returning({ id: interestedParties.id });
			if (row) {
				partyIdByKey.set(p.key, row.id);
				parties += 1;
			}
		}
		const existingComms = new Set(
			(
				await tx
					.select({ topic: communications.topic })
					.from(communications)
					.where(eq(communications.organizationId, c.orgId))
			).map((x) => x.topic),
		);
		let comms = 0;
		for (const cm of applicableCommunications(fws)) {
			if (existingComms.has(cm.topic)) continue;
			await tx.insert(communications).values({
				organizationId: c.orgId,
				topic: cm.topic,
				interestedPartyId: cm.partyKey
					? (partyIdByKey.get(cm.partyKey) ?? null)
					: null,
				audience: cm.audience,
				purpose: cm.purpose,
				channel: cm.channel,
				frequency: cm.frequency,
				trigger: cm.trigger,
				ownerFunction: cm.ownerFunction,
				legalBasis: cm.legalBasis,
				obligationCode: cm.obligationCode ?? null,
				contact: cm.contact ?? null,
			});
			comms += 1;
		}
		return {
			result: { parties, communications: comms },
			audit:
				parties + comms > 0
					? {
							action: "organisation.seed_applied",
							target: `organization:${c.orgId}`,
							after: { parties, communications: comms },
						}
					: [],
		};
	});
	revalidatePath(PATH);
	return { ok: true, data };
}

// ── Geltungsbereich ────────────────────────────────────────────────────────

export async function upsertScope(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = scopeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, frameworkSlug, ...d } = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		let frameworkId: string | null = null;
		if (frameworkSlug) {
			const [fw] = await tx
				.select({ id: frameworks.id })
				.from(frameworks)
				.where(eq(frameworks.slug, frameworkSlug))
				.limit(1);
			frameworkId = fw?.id ?? null;
		}
		if (id) {
			const [before] = await tx
				.select()
				.from(scopes)
				.where(and(eq(scopes.id, id), eq(scopes.organizationId, c.orgId)))
				.limit(1);
			if (!before) return { result: null, audit: [] };
			// Änderung an einem freigegebenen Geltungsbereich → neuer Entwurf mit Version+1
			const reopened = before.status === "approved";
			await tx
				.update(scopes)
				.set({
					frameworkId,
					statement: d.statement,
					boundaries: d.boundaries ?? null,
					locations: d.locations ?? [],
					services: d.services ?? [],
					exclusions: d.exclusions ?? [],
					version: reopened
						? bumpMinor(before.version)
						: (d.version ?? before.version),
					status: reopened ? "draft" : before.status,
					approvedAt: reopened ? null : before.approvedAt,
					approvedByUserId: reopened ? null : before.approvedByUserId,
					ownerUserId: d.ownerUserId ?? before.ownerUserId,
				})
				.where(eq(scopes.id, id));
			return {
				result: id,
				audit: {
					action: "scope.update",
					target: `scope:${id}`,
					before: {
						statement: before.statement,
						version: before.version,
						status: before.status,
					},
					after: {
						statement: d.statement,
						exclusions: d.exclusions?.length ?? 0,
						reopened,
					},
				},
			};
		}
		const [row] = await tx
			.insert(scopes)
			.values({
				organizationId: c.orgId,
				frameworkId,
				statement: d.statement,
				boundaries: d.boundaries ?? null,
				locations: d.locations ?? [],
				services: d.services ?? [],
				exclusions: d.exclusions ?? [],
				version: d.version ?? "1.0",
				ownerUserId: d.ownerUserId ?? c.userId,
			})
			.returning({ id: scopes.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "scope.create",
				target: `scope:${row.id}`,
				after: { frameworkSlug: frameworkSlug ?? null, statement: d.statement },
			},
		};
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

function bumpMinor(v: string): string {
	const [maj, min] = v.split(".").map((x) => Number.parseInt(x, 10));
	if (!Number.isFinite(maj)) return "1.1";
	return `${maj}.${(Number.isFinite(min) ? min : 0) + 1}`;
}

// Freigabe durch die Leitung (Workflow `scope`); Ergebnis über outcomes.ts.
export async function requestScopeApproval(
	input: unknown,
): Promise<ActionResult<{ status: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = requestScopeApprovalSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { scopeId, selfApprovalReason } = parsed.data;
	const res = await mutateOrg<ActionResult<{ status: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select()
				.from(scopes)
				.where(and(eq(scopes.id, scopeId), eq(scopes.organizationId, c.orgId)))
				.limit(1);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			if (row.status !== "draft")
				return { result: { ok: false, error: "notDraft" }, audit: [] };
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "scope",
					entityType: "scope",
					entityId: row.id,
					entityOwnerUserId: row.ownerUserId,
					entityVersionRef: row.version,
					title: `Geltungsbereich ${row.version}`,
					link: "/organisation?tab=geltungsbereich",
					selfApprovalReason,
				},
			);
			if (!r.ok) {
				if (r.error === "workflow_disabled") {
					// Kein Workflow aktiv: Freigabe direkt durch Owner (Step-up folgt in der UI)
					await tx
						.update(scopes)
						.set({
							status: "approved",
							approvedByUserId: c.userId,
							approvedAt: new Date(),
						})
						.where(eq(scopes.id, row.id));
					return {
						result: { ok: true, data: { status: "approved" } },
						audit: {
							action: "scope.approved",
							target: `scope:${row.id}`,
							after: { version: row.version, via: "direct" },
						},
					};
				}
				return { result: { ok: false, error: r.error }, audit: [] };
			}
			return {
				result: {
					ok: true,
					data: { status: r.status === "approved" ? "approved" : "pending" },
				},
				audit: {
					action: "scope.approval_requested",
					target: `scope:${row.id}`,
					after: { requestId: r.requestId, version: row.version },
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

// ── Rollen & Leitung ───────────────────────────────────────────────────────

export async function upsertRoleAssignment(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ role_assignment: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = roleAssignmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, fitProperChecklist, ...d } = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const base = {
			function: d.function,
			userId: d.userId ?? null,
			externalName: d.externalName?.trim() || null,
			appointedAt: d.appointedAt ?? null,
			deputyUserId: d.deputyUserId ?? null,
			evidenceId: d.evidenceId ?? null,
			fitProperStatus: d.fitProperStatus,
			documentsValidUntil: d.documentsValidUntil ?? null,
			reviewAt: d.reviewAt ?? null,
		};
		if (id) {
			const [before] = await tx
				.select()
				.from(roleAssignments)
				.where(
					and(
						eq(roleAssignments.id, id),
						eq(roleAssignments.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before) return { result: null, audit: [] };
			const encrypted =
				fitProperChecklist === undefined
					? before.fitProperChecklist
					: fitProperChecklist === null
						? null
						: await encryptJson(
								tx,
								c.orgId,
								fitProperChecklist,
								fieldAad("role_assignments", id, "fit_proper_checklist"),
							);
			await tx
				.update(roleAssignments)
				.set({ ...base, fitProperChecklist: encrypted })
				.where(eq(roleAssignments.id, id));
			if (d.userId && d.userId !== before.userId) {
				await notify(tx, {
					orgId: c.orgId,
					recipients: [d.userId],
					actorUserId: c.userId,
					kind: "entity_changed",
					title: `Du wurdest als ${d.function} benannt`,
					link: "/organisation?tab=rollen",
				});
			}
			return {
				result: id,
				audit: {
					action: "role_assignment.update",
					target: `role_assignment:${id}`,
					before: {
						function: before.function,
						userId: before.userId,
						externalName: before.externalName,
						deputyUserId: before.deputyUserId,
						fitProperStatus: before.fitProperStatus,
					},
					after: {
						function: d.function,
						userId: d.userId ?? null,
						externalName: d.externalName ?? null,
						deputyUserId: d.deputyUserId ?? null,
						fitProperStatus: d.fitProperStatus,
					},
				},
			};
		}
		const [row] = await tx
			.insert(roleAssignments)
			.values({ organizationId: c.orgId, ...base })
			.returning({ id: roleAssignments.id });
		if (!row) throw new Error("insert failed");
		if (fitProperChecklist) {
			await tx
				.update(roleAssignments)
				.set({
					fitProperChecklist: await encryptJson(
						tx,
						c.orgId,
						fitProperChecklist,
						fieldAad("role_assignments", row.id, "fit_proper_checklist"),
					),
				})
				.where(eq(roleAssignments.id, row.id));
		}
		if (d.userId) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [d.userId],
				actorUserId: c.userId,
				kind: "entity_changed",
				title: `Du wurdest als ${d.function} benannt`,
				link: "/organisation?tab=rollen",
			});
		}
		return {
			result: row.id,
			audit: {
				action: "role_assignment.create",
				target: `role_assignment:${row.id}`,
				after: {
					function: d.function,
					userId: d.userId ?? null,
					externalName: d.externalName ?? null,
					deputyUserId: d.deputyUserId ?? null,
					fitProperStatus: d.fitProperStatus,
				},
			},
		};
	});
	revalidatePath(PATH);
	revalidatePath("/ueberblick");
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function deleteRoleAssignment(
	input: unknown,
): Promise<ActionResult> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ role_assignment: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = deleteByIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await deleteRow(
			tx,
			c.orgId,
			roleAssignments,
			parsed.data.id,
			"role_assignment",
			(r) => ({
				function: r.function,
				userId: r.userId,
				externalName: r.externalName,
			}),
		);
		return { result: null, audit: a ?? [] };
	});
	revalidatePath(PATH);
	revalidatePath("/ueberblick");
	return { ok: true, data: undefined };
}

// ── Ziele & KPIs ───────────────────────────────────────────────────────────

export async function upsertObjective(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = objectiveSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			objectives,
			id,
			{
				title: d.title,
				frameworkIds: d.frameworkIds ?? [],
				kpiName: d.kpiName ?? null,
				unit: d.unit ?? null,
				target: d.target ?? null,
				dueAt: d.dueAt ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				status: d.status,
			},
			"objective",
			(r) => ({ title: r.title, status: r.status, target: r.target }),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function addKpiMeasurement(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = kpiMeasurementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [o] = await tx
			.select({ id: objectives.id })
			.from(objectives)
			.where(
				and(
					eq(objectives.id, d.objectiveId),
					eq(objectives.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!o) return { result: false, audit: [] };
		await tx.insert(kpiMeasurements).values({
			organizationId: c.orgId,
			objectiveId: d.objectiveId,
			measuredAt: d.measuredAt,
			value: d.value,
			note: d.note ?? null,
			createdByUserId: c.userId,
		});
		return {
			result: true,
			audit: {
				action: "objective.measurement",
				target: `objective:${d.objectiveId}`,
				after: { measuredAt: d.measuredAt, value: d.value },
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// ── Kommunikation, Aufsicht, Interessenkonflikte ───────────────────────────

export async function upsertCommunication(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = communicationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			communications,
			id,
			{
				topic: d.topic,
				interestedPartyId: d.interestedPartyId ?? null,
				audience: d.audience ?? null,
				purpose: d.purpose ?? null,
				channel: d.channel ?? null,
				frequency: d.frequency ?? null,
				trigger: d.trigger,
				ownerFunction: d.ownerFunction ?? null,
				ownerUserId: d.ownerUserId ?? null,
				templateDocumentId: d.templateDocumentId ?? null,
				legalBasis: d.legalBasis ?? null,
				obligationCode: d.obligationCode ?? null,
				contact: d.contact ?? null,
			},
			"communication",
			(r) => ({ topic: r.topic, trigger: r.trigger, channel: r.channel }),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function deleteCommunication(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = deleteByIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await deleteRow(
			tx,
			c.orgId,
			communications,
			parsed.data.id,
			"communication",
			(r) => ({ topic: r.topic }),
		);
		return { result: null, audit: a ?? [] };
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export async function upsertRegulatorInteraction(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = regulatorInteractionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			regulatorInteractions,
			id,
			{
				authority: d.authority,
				date: d.date,
				subject: d.subject,
				direction: d.direction,
				deadline: d.deadline ?? null,
				responseAt: d.responseAt ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				evidenceId: d.evidenceId ?? null,
				notes: d.notes ?? null,
				status: d.status,
			},
			"regulator_interaction",
			(r) => ({
				authority: r.authority,
				subject: r.subject,
				status: r.status,
				deadline: r.deadline,
			}),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}

export async function upsertConflict(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = conflictSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertRow(
			tx,
			c.orgId,
			conflictsOfInterest,
			id,
			{
				title: d.title,
				type: d.type ?? null,
				partiesInvolved: d.partiesInvolved ?? null,
				description: d.description ?? null,
				mitigation: d.mitigation ?? null,
				disclosedAt: d.disclosedAt ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				reviewAt: d.reviewAt ?? null,
				status: d.status,
			},
			"conflict_of_interest",
			(r) => ({ title: r.title, status: r.status }),
		);
		return r ? { result: r.id, audit: r.audit } : { result: null, audit: [] };
	});
	revalidatePath(PATH);
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}
