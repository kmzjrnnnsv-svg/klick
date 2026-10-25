"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import {
	assets,
	providers,
	taskBundles,
	tasks,
	trainingRequirements,
	trainings,
} from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { pendingApprovalIds } from "@/lib/approvals/bar";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeRole } from "@/lib/auth/session-rules";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import { TRAINING_REQUIREMENTS } from "@/lib/compliance/catalog/training-requirements";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { responsibleFor } from "@/lib/compliance/function-holders";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
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
	retireAssetSchema,
	trainingSchema,
} from "@/lib/validation/registers";

function addDays(base: Date, days: number): string {
	return new Date(base.getTime() + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

// ── Dienstleister ──────────────────────────────────────────────────────────
// Status während einer offenen Freigabe ändern → nichts speichern
class StatusLocked extends Error {}

async function upsertProviderImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; approvalPending?: boolean }>> {
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
	let res: { id: string; approvalPending: boolean };
	try {
		res = await mutateOrg(toOrgCtx(c), async (tx) => {
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
				// Status nur über den Ablauf „Dienstleister aufnehmen“: gesperrt,
				// solange eine Freigabe offen ist; aus „Abgelehnt“ wird neu beantragt
				let approvalPending = false;
				if (patch.status && patch.status !== before.status) {
					const waiting = await pendingApprovalIds(tx, c.orgId, "provider", [
						providerId,
					]);
					if (waiting.size > 0) throw new StatusLocked();
					if (before.status === "declined") {
						const merged = { ...before, ...patch };
						const gate = await gateApproval(
							tx,
							{ orgId: c.orgId, userId: c.userId, name: c.name },
							{
								trigger: "provider.create",
								entityType: "provider",
								entityId: providerId,
								entityOwnerUserId: merged.ownerUserId,
								title: `Dienstleister aufnehmen: ${merged.name}`,
								link: `/dienstleister/${providerId}`,
								facts: {
									criticality: merged.criticality,
									category: merged.category,
									isIct: merged.isIct,
									isOutsourcing: merged.isOutsourcing,
									isMaterial: merged.isMaterial,
								},
							},
						);
						if (gate.status === "error")
							throw new GateBlocked(gate.error, gate.warnings);
						if (gate.status === "pending") {
							patch.status = "onboarding";
							approvalPending = true;
						}
					}
				}
				if (Object.keys(patch).length > 0)
					await tx
						.update(providers)
						.set(patch)
						.where(eq(providers.id, providerId));
				return {
					result: { id: providerId, approvalPending },
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
			// Freigabe-Designer: Aufnahme kann eine Freigabe verlangen — bis dahin
			// steht der Dienstleister auf „Im Aufbau“
			const gate = await gateApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					trigger: "provider.create",
					entityType: "provider",
					entityId: row.id,
					entityOwnerUserId: values.ownerUserId,
					title: `Dienstleister aufnehmen: ${d.name}`,
					link: `/dienstleister/${row.id}`,
					facts: {
						criticality: d.criticality,
						category: d.category ?? null,
						isIct: d.isIct,
						isOutsourcing: d.isOutsourcing,
						isMaterial: d.isMaterial,
					},
				},
			);
			if (gate.status === "error")
				throw new GateBlocked(gate.error, gate.warnings);
			if (gate.status === "pending")
				await tx
					.update(providers)
					.set({ status: "onboarding" })
					.where(eq(providers.id, row.id));
			return {
				result: { id: row.id, approvalPending: gate.status === "pending" },
				audit: {
					action: "provider.create",
					target: `provider:${row.id}`,
					after: {
						name: d.name,
						partnerType: d.partnerType,
						criticality: d.criticality,
						approvalRequestId:
							gate.status === "pending" || gate.status === "approved"
								? gate.requestId
								: null,
					},
				},
			};
		});
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		if (e instanceof StatusLocked) return { ok: false, error: "statusLocked" };
		throw e;
	}
	revalidatePath("/dienstleister");
	return { ok: true, data: res };
}

// ── Assets ─────────────────────────────────────────────────────────────────
async function upsertAssetImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; approvalPending?: boolean }>> {
	const c = await requireOrg({ asset: ["create", "update"] });
	const parsed = assetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { assetId, ...d } = parsed.data;
	let res: { id: string; approvalPending: boolean };
	try {
		res = await mutateOrg(toOrgCtx(c), async (tx) => {
			const values = {
				name: d.name,
				type: d.type,
				classification: d.classification,
				providerId: d.providerId ?? null,
				siteId: d.siteId ?? null,
				ownerUserId: d.ownerUserId ?? c.userId,
				location: d.location ?? null,
				description: d.description ?? null,
				isLegacy: d.isLegacy,
				custodian: d.custodian ?? null,
				backupLocation: d.backupLocation ?? null,
				rotationDue: d.rotationDue ?? null,
				vendor: d.vendor || null,
				product: d.product || null,
				version: d.version || null,
				endOfLifeAt: d.endOfLifeAt ?? null,
				supportEndAt: d.supportEndAt ?? null,
				maintenance: d.maintenance ?? null,
				maintenanceUntil: d.maintenanceUntil ?? null,
				lastPatchedAt: d.lastPatchedAt ?? null,
			};
			if (assetId) {
				const [before] = await tx
					.select()
					.from(assets)
					.where(
						and(eq(assets.id, assetId), eq(assets.organizationId, c.orgId)),
					)
					.limit(1);
				if (!before) throw new Error("notFound");
				await tx.update(assets).set(values).where(eq(assets.id, assetId));
				return {
					result: { id: assetId, approvalPending: false },
					audit: {
						action: "asset.update",
						target: `asset:${assetId}`,
						before: {
							name: before.name,
							type: before.type,
							classification: before.classification,
							endOfLifeAt: before.endOfLifeAt,
							supportEndAt: before.supportEndAt,
							maintenance: before.maintenance,
							lastPatchedAt: before.lastPatchedAt,
						},
						after: {
							name: d.name,
							type: d.type,
							classification: d.classification,
							endOfLifeAt: values.endOfLifeAt,
							supportEndAt: values.supportEndAt,
							maintenance: values.maintenance,
							lastPatchedAt: values.lastPatchedAt,
						},
					},
				};
			}
			const [row] = await tx
				.insert(assets)
				.values({ organizationId: c.orgId, ...values })
				.returning({ id: assets.id });
			if (!row) throw new Error("insert failed");
			// Freigabe-Designer: Aufnahme kann eine Freigabe verlangen
			const gate = await gateApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					trigger: "asset.create",
					entityType: "asset",
					entityId: row.id,
					entityOwnerUserId: values.ownerUserId,
					title: `Asset aufnehmen: ${d.name}`,
					link: "/assets",
					facts: { assetType: d.type, classification: d.classification },
				},
			);
			if (gate.status === "error")
				throw new GateBlocked(gate.error, gate.warnings);
			if (gate.status === "pending")
				await tx
					.update(assets)
					.set({ status: "pending" })
					.where(eq(assets.id, row.id));
			return {
				result: { id: row.id, approvalPending: gate.status === "pending" },
				audit: {
					action: "asset.create",
					target: `asset:${row.id}`,
					after: {
						name: d.name,
						type: d.type,
						classification: d.classification,
						approvalPending: gate.status === "pending",
					},
				},
			};
		});
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
	revalidatePath("/assets");
	return { ok: true, data: res };
}

// Außer Betrieb nehmen (Auslöser asset.retire): mit aktivem Ablauf erst nach
// Freigabe wirksam (outcomes.ts), sonst sofort.
async function retireAssetImpl(
	input: unknown,
): Promise<ActionResult<{ approvalPending: boolean }>> {
	const c = await requireOrg({ asset: ["update"] });
	const parsed = retireAssetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	try {
		const res = await mutateOrg<ActionResult<{ approvalPending: boolean }>>(
			toOrgCtx(c),
			async (tx) => {
				const [a] = await tx
					.select()
					.from(assets)
					.where(
						and(eq(assets.id, d.assetId), eq(assets.organizationId, c.orgId)),
					)
					.limit(1);
				if (!a) return { result: { ok: false, error: "notFound" }, audit: [] };
				if (a.status !== "active")
					return { result: { ok: false, error: "notActive" }, audit: [] };
				const gate = await gateApproval(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					{
						trigger: "asset.retire",
						entityType: "asset",
						entityId: a.id,
						entityOwnerUserId: a.ownerUserId,
						title: `Asset außer Betrieb nehmen: ${a.name}`,
						link: "/assets",
						facts: { assetType: a.type, classification: a.classification },
					},
				);
				if (gate.status === "error")
					throw new GateBlocked(gate.error, gate.warnings);
				const pending = gate.status === "pending";
				if (!pending)
					await tx
						.update(assets)
						.set({ status: "retired" })
						.where(eq(assets.id, a.id));
				return {
					result: { ok: true, data: { approvalPending: pending } },
					audit: {
						action: pending ? "asset.retire_requested" : "asset.retired",
						target: `asset:${a.id}`,
						before: { status: a.status },
						after: { status: pending ? a.status : "retired", note: d.note },
					},
				};
			},
		);
		revalidatePath("/assets");
		return res;
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
}

// ── Schulungen ─────────────────────────────────────────────────────────────
async function createTrainingImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ training: ["create"] });
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
		const fns = await loadAssignments(tx, c.orgId);
		const owners = await tx
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, c.orgId));
		const start = d.startDate ? new Date(d.startDate) : new Date();
		const resolve = (rule?: string): string => {
			if (!rule) return c.userId;
			const [kind, value] = rule.split(":");
			if (kind === "function")
				return responsibleFor(fns, value as RoleFunction) ?? c.userId;
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
export const retireAsset = safeAction("retireAsset", retireAssetImpl);
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
