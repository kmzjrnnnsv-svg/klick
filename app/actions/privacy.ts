"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	dataSubjectRequests,
	insurancePolicies,
	processingActivities,
	roleAssignments,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { applicableProcessingActivities } from "@/lib/compliance/catalog/processing-activities";
import { dsrDueAt, dsrExtendedUntil } from "@/lib/compliance/privacy";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { listOrgFrameworks } from "@/lib/org/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	dataSubjectRequestSchema,
	dsrExtendSchema,
	dsrTransitionSchema,
	insurancePolicySchema,
	parseSubLimits,
	processingActivitySchema,
} from "@/lib/validation/privacy";

const PATH = "/datenschutz";

async function dpo(tx: OrgTx, orgId: string): Promise<string | null> {
	const [row] = await tx
		.select({ userId: roleAssignments.userId })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, "dpo"),
			),
		)
		.limit(1);
	return row?.userId ?? null;
}

// ── Verarbeitungsverzeichnis (Art. 30) ─────────────────────────────────────

export async function upsertProcessingActivity(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ privacy: ["create", "update"] });
	const parsed = processingActivitySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const values = {
				name: d.name,
				purpose: d.purpose ?? null,
				dataCategories: d.dataCategories,
				dataSubjects: d.dataSubjects,
				recipients: d.recipients,
				thirdCountryTransfer: d.thirdCountryTransfer ?? null,
				retention: d.retention ?? null,
				legalBasis: d.legalBasis ?? null,
				dsfaRequired: d.dsfaRequired,
				dsfaEvidenceId: d.dsfaEvidenceId ?? null,
				ownerUserId: d.ownerUserId ?? null,
			};
			if (id) {
				const [before] = await tx
					.select()
					.from(processingActivities)
					.where(
						and(
							eq(processingActivities.id, id),
							eq(processingActivities.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(processingActivities)
					.set(values)
					.where(eq(processingActivities.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "processing_activity.update",
						target: `processing_activity:${id}`,
						before: {
							legalBasis: before.legalBasis,
							retention: before.retention,
							dsfaRequired: before.dsfaRequired,
							dsfaEvidenceId: before.dsfaEvidenceId,
						},
						after: {
							legalBasis: values.legalBasis,
							retention: values.retention,
							dsfaRequired: values.dsfaRequired,
							dsfaEvidenceId: values.dsfaEvidenceId,
						},
					},
				};
			}
			const [row] = await tx
				.insert(processingActivities)
				.values({
					organizationId: c.orgId,
					...values,
					ownerUserId:
						values.ownerUserId ?? (await dpo(tx, c.orgId)) ?? c.userId,
				})
				.returning({ id: processingActivities.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "processing_activity.create",
					target: `processing_activity:${row.id}`,
					after: {
						name: d.name,
						legalBasis: values.legalBasis,
						dsfaRequired: d.dsfaRequired,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

export async function deleteProcessingActivity(input: {
	id: string;
}): Promise<ActionResult> {
	const c = await requireOrg({ privacy: ["update"] });
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ id: processingActivities.id, name: processingActivities.name })
			.from(processingActivities)
			.where(
				and(
					eq(processingActivities.id, input.id),
					eq(processingActivities.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx
			.delete(processingActivities)
			.where(eq(processingActivities.id, row.id));
		return {
			result: true,
			audit: {
				action: "processing_activity.delete",
				target: `processing_activity:${row.id}`,
				before: { name: row.name },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export async function applyProcessingActivitySeed(): Promise<
	ActionResult<{ created: number }>
> {
	const c = await requireOrg({ privacy: ["create"] });
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const fws = (await listOrgFrameworks(tx, c.orgId)).map((f) => f.slug);
		const existing = new Set(
			(
				await tx
					.select({ name: processingActivities.name })
					.from(processingActivities)
					.where(eq(processingActivities.organizationId, c.orgId))
			).map((x) => x.name),
		);
		const owner = (await dpo(tx, c.orgId)) ?? c.userId;
		const audits: AuditInput[] = [];
		let n = 0;
		for (const p of applicableProcessingActivities(fws)) {
			if (existing.has(p.name)) continue;
			const [row] = await tx
				.insert(processingActivities)
				.values({
					organizationId: c.orgId,
					name: p.name,
					purpose: p.purpose,
					dataCategories: [...p.dataCategories],
					dataSubjects: [...p.dataSubjects],
					recipients: [...p.recipients],
					thirdCountryTransfer: p.thirdCountryTransfer,
					retention: p.retention,
					legalBasis: p.legalBasis,
					dsfaRequired: p.dsfaRequired,
					ownerUserId: owner,
				})
				.returning({ id: processingActivities.id });
			if (row) {
				n += 1;
				audits.push({
					action: "processing_activity.create",
					target: `processing_activity:${row.id}`,
					after: { name: p.name, via: "seed" },
				});
			}
		}
		return { result: n, audit: audits };
	});
	revalidatePath(PATH);
	return { ok: true, data: { created } };
}

// ── Betroffenenanfragen (Art. 12–22) ───────────────────────────────────────

export async function upsertDataSubjectRequest(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ privacy: ["create", "update"] });
	const parsed = dataSubjectRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, subjectRef, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(dataSubjectRequests)
					.where(
						and(
							eq(dataSubjectRequests.id, id),
							eq(dataSubjectRequests.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(dataSubjectRequests)
					.set({
						type: d.type,
						ownerUserId: d.ownerUserId ?? before.ownerUserId,
						subjectRef:
							subjectRef === undefined
								? before.subjectRef
								: subjectRef
									? await encryptJson(
											tx,
											c.orgId,
											subjectRef,
											fieldAad("data_subject_requests", id, "subject_ref"),
										)
									: null,
					})
					.where(eq(dataSubjectRequests.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "data_subject_request.update",
						target: `data_subject_request:${id}`,
						before: { type: before.type, ownerUserId: before.ownerUserId },
						after: {
							type: d.type,
							ownerUserId: d.ownerUserId ?? before.ownerUserId,
						},
					},
				};
			}
			const owner = d.ownerUserId ?? (await dpo(tx, c.orgId)) ?? c.userId;
			const dueAt = dsrDueAt(d.receivedAt);
			const [row] = await tx
				.insert(dataSubjectRequests)
				.values({
					organizationId: c.orgId,
					receivedAt: d.receivedAt,
					type: d.type,
					dueAt,
					ownerUserId: owner,
				})
				.returning({ id: dataSubjectRequests.id });
			if (!row) throw new Error("insert failed");
			if (subjectRef)
				await tx
					.update(dataSubjectRequests)
					.set({
						subjectRef: await encryptJson(
							tx,
							c.orgId,
							subjectRef,
							fieldAad("data_subject_requests", row.id, "subject_ref"),
						),
					})
					.where(eq(dataSubjectRequests.id, row.id));
			await notify(tx, {
				orgId: c.orgId,
				recipients: [owner],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `Betroffenenanfrage (${d.type}) eingegangen`,
				body: `Antwort bis ${dueAt.toLocaleDateString("de-DE")} (Art. 12 Abs. 3 DSGVO).`,
				link: `${PATH}?tab=anfragen`,
			});
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "data_subject_request.create",
					target: `data_subject_request:${row.id}`,
					after: { type: d.type, dueAt: dueAt.toISOString() },
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

export async function transitionDataSubjectRequest(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ privacy: ["update"] });
	const parsed = dsrTransitionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, to, outcome } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(dataSubjectRequests)
			.where(
				and(
					eq(dataSubjectRequests.id, id),
					eq(dataSubjectRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const done = to === "done" || to === "rejected";
		await tx
			.update(dataSubjectRequests)
			.set({
				status: to,
				completedAt: done ? new Date() : null,
				outcome: outcome ?? row.outcome,
			})
			.where(eq(dataSubjectRequests.id, id));
		return {
			result: true,
			audit: {
				action: "data_subject_request.transition",
				target: `data_subject_request:${id}`,
				before: { status: row.status },
				after: { status: to, outcome: outcome ?? row.outcome },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Art. 12 Abs. 3: Verlängerung um zwei Monate mit Begründung (Betroffene informieren).
export async function extendDataSubjectRequest(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ privacy: ["update"] });
	const parsed = dsrExtendSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, reason } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(dataSubjectRequests)
			.where(
				and(
					eq(dataSubjectRequests.id, id),
					eq(dataSubjectRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row || row.extendedUntil) return { result: false, audit: [] };
		const until = dsrExtendedUntil(row.dueAt);
		await tx
			.update(dataSubjectRequests)
			.set({ extendedUntil: until, outcome: `Verlängert: ${reason}` })
			.where(eq(dataSubjectRequests.id, id));
		return {
			result: true,
			audit: {
				action: "data_subject_request.extend",
				target: `data_subject_request:${id}`,
				before: { dueAt: row.dueAt.toISOString() },
				after: { extendedUntil: until.toISOString(), reason },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// ── Versicherungen (Organisation) ──────────────────────────────────────────

export async function upsertInsurancePolicy(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = insurancePolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const values = {
		type: d.type,
		insurer: d.insurer,
		policyRef: d.policyRef ?? null,
		coverageLimit:
			d.coverageLimit === null || d.coverageLimit === undefined
				? null
				: String(d.coverageLimit),
		subLimits: parseSubLimits(d.subLimits),
		exclusions: d.exclusions ?? null,
		validFrom: d.validFrom ?? null,
		validUntil: d.validUntil ?? null,
		premium:
			d.premium === null || d.premium === undefined ? null : String(d.premium),
		ownerUserId: d.ownerUserId ?? null,
	};
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(insurancePolicies)
					.where(
						and(
							eq(insurancePolicies.id, id),
							eq(insurancePolicies.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(insurancePolicies)
					.set(values)
					.where(eq(insurancePolicies.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "insurance_policy.update",
						target: `insurance_policy:${id}`,
						before: {
							coverageLimit: before.coverageLimit,
							validUntil: before.validUntil,
							insurer: before.insurer,
						},
						after: {
							coverageLimit: values.coverageLimit,
							validUntil: values.validUntil,
							insurer: values.insurer,
						},
					},
				};
			}
			const [row] = await tx
				.insert(insurancePolicies)
				.values({
					organizationId: c.orgId,
					...values,
					ownerUserId: values.ownerUserId ?? c.userId,
				})
				.returning({ id: insurancePolicies.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "insurance_policy.create",
					target: `insurance_policy:${row.id}`,
					after: {
						type: d.type,
						insurer: d.insurer,
						validUntil: values.validUntil,
					},
				},
			};
		},
	);
	revalidatePath("/organisation");
	return res;
}

export async function deleteInsurancePolicy(input: {
	id: string;
}): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ id: insurancePolicies.id, insurer: insurancePolicies.insurer })
			.from(insurancePolicies)
			.where(
				and(
					eq(insurancePolicies.id, input.id),
					eq(insurancePolicies.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		await tx.delete(insurancePolicies).where(eq(insurancePolicies.id, row.id));
		return {
			result: true,
			audit: {
				action: "insurance_policy.delete",
				target: `insurance_policy:${row.id}`,
				before: { insurer: row.insurer },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/organisation");
	return { ok: true, data: undefined };
}
