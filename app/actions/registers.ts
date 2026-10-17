"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import {
	assets,
	providers,
	roleAssignments,
	taskBundles,
	tasks,
	trainingRequirements,
	trainings,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeRole } from "@/lib/auth/session-rules";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import { TRAINING_REQUIREMENTS } from "@/lib/compliance/catalog/training-requirements";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	completeAssignments,
	syncTrainingAssignments,
} from "@/lib/trainings/assignments";
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

// ── Dienstleister ──────────────────────────────────────────────────────────
async function upsertProviderImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ provider: ["create", "update"] });
	const parsed = providerSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { providerId, ...d } = parsed.data;
	// Bei Änderungen nur Felder schreiben, die der Aufrufer mitschickt — sonst
	// setzen Schema-Defaults nicht gesendete Felder (Datenstandorte,
	// Vertragsbeginn …) zurück.
	const sent = new Set(
		input && typeof input === "object" ? Object.keys(input) : [],
	);
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const values = {
			name: d.name,
			partnerType: d.partnerType,
			serviceType: d.serviceType ?? null,
			serviceDescription: d.serviceDescription ?? null,
			category: d.category ?? null,
			status: d.status ?? "active",
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
			ownerUserId: d.ownerUserId === undefined ? c.userId : d.ownerUserId,
			notes: d.notes ?? null,
		};
		const patch = Object.fromEntries(
			Object.entries(values).filter(([k]) => sent.has(k)),
		) as Partial<typeof values>;
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
			if (Object.keys(patch).length > 0)
				await tx
					.update(providers)
					.set(patch)
					.where(eq(providers.id, providerId));
			return {
				result: providerId,
				audit: {
					action: "provider.update",
					target: `provider:${providerId}`,
					before: Object.fromEntries(
						Object.keys(patch).map((k) => [
							k,
							(before as Record<string, unknown>)[k] ?? null,
						]),
					),
					after: patch,
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
async function upsertAssetImpl(
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
async function createTrainingImpl(
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
			if (req)
				await completeAssignments(
					tx,
					c.orgId,
					req,
					d.attendeeUserIds,
					d.heldAt,
					{ trainingId: row.id },
				);
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
async function applyTrainingRequirementsImpl(): Promise<
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
async function recordControlTestImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = controlTestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const test = await insertControlTest(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			{
				implementationId: d.implementationId,
				method: d.method,
				scope: d.scope,
				testedAt: d.testedAt,
				result: d.result,
				notes: d.notes,
				nextTestAt: d.nextTestAt,
			},
		);
		return { result: test.id, audit: test.audits };
	});
	revalidatePath("/controls", "layout");
	return { ok: true, data: { id } };
}

// ── Aufgabenpakete ─────────────────────────────────────────────────────────
async function applyTaskBundleImpl(
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
async function recordAccessReviewImpl(note: string): Promise<ActionResult> {
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

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertProvider = safeAction("upsertProvider", upsertProviderImpl);
export const upsertAsset = safeAction("upsertAsset", upsertAssetImpl);
export const createTraining = safeAction("createTraining", createTrainingImpl);
export const applyTrainingRequirements = safeAction(
	"applyTrainingRequirements",
	applyTrainingRequirementsImpl,
);
export const recordControlTest = safeAction(
	"recordControlTest",
	recordControlTestImpl,
);
export const applyTaskBundle = safeAction(
	"applyTaskBundle",
	applyTaskBundleImpl,
);
export const recordAccessReview = safeAction(
	"recordAccessReview",
	recordAccessReviewImpl,
);
