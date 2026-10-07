"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import {
	assets,
	controlImplementations,
	controls,
	controlTests,
	providers,
	roleAssignments,
	taskBundles,
	tasks,
	trainingAssignments,
	trainingRequirements,
	trainings,
} from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeRole } from "@/lib/auth/session-rules";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import { TRAINING_REQUIREMENTS } from "@/lib/compliance/catalog/training-requirements";
import { nonconformityFromTest } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { syncTrainingAssignments } from "@/lib/trainings/assignments";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	applyBundleSchema,
	assetSchema,
	controlTestSchema,
	providerSchema,
	trainingSchema,
} from "@/lib/validation/registers";

function addDays(base: Date, days: number): string {
	return new Date(base.getTime() + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}
function addMonths(base: Date, months: number): string {
	const d = new Date(base);
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}

// ── Dienstleister ──────────────────────────────────────────────────────────
export async function upsertProvider(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ provider: ["create", "update"] });
	const parsed = providerSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { providerId, ...d } = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const values = {
			name: d.name,
			partnerType: d.partnerType,
			serviceType: d.serviceType ?? null,
			serviceDescription: d.serviceDescription ?? null,
			criticality: d.criticality,
			isIct: d.isIct,
			isOutsourcing: d.isOutsourcing,
			isMaterial: d.isMaterial,
			country: d.country ?? null,
			dataLocations: d.dataLocations ?? [],
			processesPersonalData: d.processesPersonalData,
			contractRef: d.contractRef ?? null,
			contractStart: d.contractStart ?? null,
			contractEnd: d.contractEnd ?? null,
			noticePeriodDays: d.noticePeriodDays ?? null,
			ownerUserId: d.ownerUserId ?? c.userId,
			notes: d.notes ?? null,
		};
		if (providerId) {
			const [before] = await tx
				.select()
				.from(providers)
				.where(
					and(
						eq(providers.id, providerId),
						eq(providers.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before) throw new Error("notFound");
			await tx
				.update(providers)
				.set(values)
				.where(eq(providers.id, providerId));
			return {
				result: providerId,
				audit: {
					action: "provider.update",
					target: `provider:${providerId}`,
					before: {
						name: before.name,
						criticality: before.criticality,
						isMaterial: before.isMaterial,
						contractEnd: before.contractEnd,
					},
					after: {
						name: d.name,
						criticality: d.criticality,
						isMaterial: d.isMaterial,
						contractEnd: d.contractEnd ?? null,
					},
				},
			};
		}
		const [row] = await tx
			.insert(providers)
			.values({ organizationId: c.orgId, ...values })
			.returning({ id: providers.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "provider.create",
				target: `provider:${row.id}`,
				after: {
					name: d.name,
					partnerType: d.partnerType,
					criticality: d.criticality,
				},
			},
		};
	});
	revalidatePath("/dienstleister");
	return { ok: true, data: { id } };
}

// ── Assets ─────────────────────────────────────────────────────────────────
export async function upsertAsset(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ asset: ["create", "update"] });
	const parsed = assetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { assetId, ...d } = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const values = {
			name: d.name,
			type: d.type,
			classification: d.classification,
			providerId: d.providerId ?? null,
			ownerUserId: d.ownerUserId ?? c.userId,
			location: d.location ?? null,
			description: d.description ?? null,
			isLegacy: d.isLegacy,
			custodian: d.custodian ?? null,
			backupLocation: d.backupLocation ?? null,
			rotationDue: d.rotationDue ?? null,
		};
		if (assetId) {
			const [before] = await tx
				.select()
				.from(assets)
				.where(and(eq(assets.id, assetId), eq(assets.organizationId, c.orgId)))
				.limit(1);
			if (!before) throw new Error("notFound");
			await tx.update(assets).set(values).where(eq(assets.id, assetId));
			return {
				result: assetId,
				audit: {
					action: "asset.update",
					target: `asset:${assetId}`,
					before: {
						name: before.name,
						type: before.type,
						classification: before.classification,
					},
					after: {
						name: d.name,
						type: d.type,
						classification: d.classification,
					},
				},
			};
		}
		const [row] = await tx
			.insert(assets)
			.values({ organizationId: c.orgId, ...values })
			.returning({ id: assets.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "asset.create",
				target: `asset:${row.id}`,
				after: { name: d.name, type: d.type, classification: d.classification },
			},
		};
	});
	revalidatePath("/assets");
	return { ok: true, data: { id } };
}

// ── Schulungen ─────────────────────────────────────────────────────────────
export async function createTraining(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = trainingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(trainings)
			.values({
				organizationId: c.orgId,
				title: d.title,
				heldAt: d.heldAt,
				trainerUserId: d.trainerUserId ?? null,
				externalTrainer: d.externalTrainer ?? null,
				attendeeUserIds: d.attendeeUserIds,
				audience: d.audience,
				notes: d.notes ?? null,
			})
			.returning({ id: trainings.id });
		if (!row) throw new Error("insert failed");
		// Pflichtschulung erfüllt → Zuweisungen der Teilnehmenden schliessen, nächste Fälligkeit anlegen.
		if (d.requirementCode && d.attendeeUserIds.length > 0) {
			const [req] = await tx
				.select()
				.from(trainingRequirements)
				.where(
					and(
						eq(trainingRequirements.organizationId, c.orgId),
						eq(trainingRequirements.code, d.requirementCode),
					),
				)
				.limit(1);
			if (req) {
				const open = await tx
					.select({
						id: trainingAssignments.id,
						userId: trainingAssignments.userId,
					})
					.from(trainingAssignments)
					.where(
						and(
							eq(trainingAssignments.requirementId, req.id),
							inArray(trainingAssignments.userId, d.attendeeUserIds),
							inArray(trainingAssignments.status, ["due", "overdue"]),
						),
					);
				if (open.length > 0) {
					await tx
						.update(trainingAssignments)
						.set({ status: "done", completedAt: d.heldAt, trainingId: row.id })
						.where(
							inArray(
								trainingAssignments.id,
								open.map((o) => o.id),
							),
						);
				}
				const held = new Date(d.heldAt);
				await tx.insert(trainingAssignments).values(
					d.attendeeUserIds.map((userId) => ({
						organizationId: c.orgId,
						requirementId: req.id,
						userId,
						dueAt: addMonths(held, req.frequencyMonths),
						status: "due" as const,
					})),
				);
			}
		}
		return {
			result: row.id,
			audit: {
				action: "training.create",
				target: `training:${row.id}`,
				after: {
					title: d.title,
					heldAt: d.heldAt,
					attendees: d.attendeeUserIds.length,
					requirementCode: d.requirementCode ?? null,
				},
			},
		};
	});
	revalidatePath("/schulungen");
	return { ok: true, data: { id } };
}

// Standard-Pflichtschulungen übernehmen + Zuweisungen je Mitglied erzeugen.
export async function applyTrainingRequirements(): Promise<
	ActionResult<{ requirements: number; assignments: number }>
> {
	const c = await requireOrg({ settings: ["update"] });
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const present = new Set(
			(
				await tx
					.select({ code: trainingRequirements.code })
					.from(trainingRequirements)
					.where(eq(trainingRequirements.organizationId, c.orgId))
			).map((r) => r.code),
		);
		let reqs = 0;
		for (const t of TRAINING_REQUIREMENTS) {
			if (present.has(t.code)) continue;
			await tx.insert(trainingRequirements).values({
				organizationId: c.orgId,
				code: t.code,
				title: t.title,
				description: t.description,
				function: t.function ?? null,
				orgRole: t.orgRole ?? null,
				frequencyMonths: t.frequencyMonths,
				legalBasis: t.legalBasis,
			});
			reqs += 1;
		}
		const assignments = await syncTrainingAssignments(tx, c.orgId);
		return {
			result: { requirements: reqs, assignments },
			audit: {
				action: "training.requirements_applied",
				target: `organization:${c.orgId}`,
				after: { requirements: reqs, assignments },
			},
		};
	});
	revalidatePath("/schulungen");
	return { ok: true, data: out };
}

// ── Wirksamkeitstests ──────────────────────────────────────────────────────
export async function recordControlTest(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = controlTestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [impl] = await tx
			.select({
				id: controlImplementations.id,
				code: controls.code,
				title: controls.title,
				ownerUserId: controlImplementations.ownerUserId,
			})
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.id, d.implementationId),
					eq(controlImplementations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!impl) throw new Error("notFound");
		const [row] = await tx
			.insert(controlTests)
			.values({
				organizationId: c.orgId,
				implementationId: impl.id,
				method: d.method,
				scope: d.scope ?? null,
				testedAt: d.testedAt ?? new Date(),
				testerUserId: c.userId,
				result: d.result ?? null,
				notes: d.notes ?? null,
				nextTestAt: d.nextTestAt ?? null,
			})
			.returning({ id: controlTests.id });
		if (!row) throw new Error("insert failed");
		// ISO 9.1/10.2: nicht wirksam → Abweichung mit Aufgabe und Wirksamkeitsprüfung
		const extra = [];
		if (d.result === "fail") {
			const draft = nonconformityFromTest({
				id: row.id,
				controlCode: impl.code,
				controlTitle: impl.title,
				method: d.method,
				notes: d.notes ?? null,
				ownerUserId: impl.ownerUserId ?? c.userId,
				result: d.result,
			});
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
			result: row.id,
			audit: [
				{
					action: "control.test",
					target: `control:${impl.id}`,
					after: {
						method: d.method,
						result: d.result ?? null,
						nextTestAt: d.nextTestAt ?? null,
					},
				},
				...extra,
			],
		};
	});
	revalidatePath("/controls", "layout");
	return { ok: true, data: { id } };
}

// ── Aufgabenpakete ─────────────────────────────────────────────────────────
export async function applyTaskBundle(
	input: unknown,
): Promise<ActionResult<{ created: number }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = applyBundleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		let bundle = TASK_BUNDLES.find((b) => b.code === d.code);
		const [custom] = await tx
			.select()
			.from(taskBundles)
			.where(
				and(
					eq(taskBundles.organizationId, c.orgId),
					eq(taskBundles.code, d.code),
				),
			)
			.limit(1);
		if (custom)
			bundle = {
				code: custom.code,
				name: custom.name,
				description: custom.description ?? "",
				items: custom.items,
				triggerEntityType: custom.triggerEntityType ?? undefined,
			};
		if (!bundle) throw new Error("notFound");
		const fns = await tx
			.select({
				function: roleAssignments.function,
				userId: roleAssignments.userId,
			})
			.from(roleAssignments)
			.where(eq(roleAssignments.organizationId, c.orgId));
		const owners = await tx
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, c.orgId));
		const start = d.startDate ? new Date(d.startDate) : new Date();
		const resolve = (rule?: string): string => {
			if (!rule) return c.userId;
			const [kind, value] = rule.split(":");
			if (kind === "function")
				return fns.find((f) => f.function === value)?.userId ?? c.userId;
			if (kind === "role")
				return (
					owners.find((o) => normalizeRole(o.role) === value)?.userId ??
					c.userId
				);
			if (kind === "user" && value) return value;
			return c.userId;
		};
		const rows = bundle.items.map((it) => ({
			organizationId: c.orgId,
			title: it.title,
			description: it.description ?? null,
			assigneeUserId: resolve(it.assigneeRule),
			createdByUserId: c.userId,
			dueAt: addDays(start, it.offsetDays ?? 0),
			entityType:
				(d.entityType as typeof tasks.$inferInsert.entityType) ?? null,
			entityId: d.entityId ?? null,
			sourceKind: "bundle" as const,
			bundleCode: bundle.code,
		}));
		await tx.insert(tasks).values(rows);
		const recipients = [...new Set(rows.map((r) => r.assigneeUserId))];
		await notify(tx, {
			orgId: c.orgId,
			recipients,
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Aufgabenpaket „${bundle.name}" angewendet`,
			link: "/heute/aufgaben",
		});
		return {
			result: rows.length,
			audit: {
				action: "task.bundle_applied",
				target:
					d.entityType && d.entityId
						? `${d.entityType}:${d.entityId}`
						: `organization:${c.orgId}`,
				after: { code: bundle.code, tasks: rows.length },
			},
		};
	});
	revalidatePath("/heute", "layout");
	return { ok: true, data: { created } };
}

// ── Zugriffsreview (ISO A.5.18, DORA 9(4)) ─────────────────────────────────
export async function recordAccessReview(note: string): Promise<ActionResult> {
	const c = await requireOrg({ member: ["update"] });
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const members = await tx
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "access.review",
				target: `organization:${c.orgId}`,
				after: {
					members: members.map((m) => ({ userId: m.userId, role: m.role })),
					note: note.slice(0, 2000),
				},
			},
		};
	});
	revalidatePath("/team");
	return { ok: true, data: undefined };
}
