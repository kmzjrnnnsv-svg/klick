"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obligationRuns, obligations, tasks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { OBLIGATION_BY_CODE } from "@/lib/compliance/catalog/obligations";
import {
	planObligationRuns,
	syncObligations,
} from "@/lib/compliance/obligations-service";
import { getOrgProfile } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	completeRunSchema,
	updateObligationSchema,
	waiveRunSchema,
} from "@/lib/validation/governance";

const PATH = "/kalender";

// Pflichten aus dem Katalog übernehmen (Rahmenwerke + Stufe) und Läufe für
// zwölf Monate planen. Idempotent.
async function applyObligationSeedImpl(): Promise<
	ActionResult<{ created: number; runs: number; deactivated: number }>
> {
	const c = await requireOrg({ obligation: ["update"] });
	const data = await mutateOrg(toOrgCtx(c), async (tx) => {
		const profile = await getOrgProfile(tx, c.orgId);
		const sync = await syncObligations(
			tx,
			c.orgId,
			profile?.frameworks ?? [],
			profile?.profile.licenceStage ?? "0_vorbereitung",
			{
				tlptDesignated: profile?.profile.tlptDesignated,
				ownerUserId: c.userId,
			},
		);
		const now = new Date();
		const runs = await planObligationRuns(
			tx,
			c.orgId,
			now,
			new Date(now.getTime() + 366 * 86_400_000),
			OBLIGATION_BY_CODE,
		);
		return {
			result: {
				created: sync.created.length,
				runs,
				deactivated: sync.deactivated.length,
			},
			audit:
				sync.created.length + runs + sync.deactivated.length > 0
					? {
							action: "obligations.synced",
							target: `organization:${c.orgId}`,
							after: {
								created: sync.created,
								deactivated: sync.deactivated,
								runs,
							},
						}
					: [],
		};
	});
	revalidatePath(PATH);
	return { ok: true, data };
}

async function completeObligationRunImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ obligation: ["complete"] });
	const parsed = completeRunSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { runId, evidenceId, note } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [run] = await tx
			.select({
				r: obligationRuns,
				code: obligations.code,
				title: obligations.title,
			})
			.from(obligationRuns)
			.innerJoin(obligations, eq(obligations.id, obligationRuns.obligationId))
			.where(
				and(
					eq(obligationRuns.id, runId),
					eq(obligationRuns.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!run) return { result: false, audit: [] };
		await tx
			.update(obligationRuns)
			.set({
				status: "done",
				completedAt: new Date(),
				completedByUserId: c.userId,
				evidenceId: evidenceId ?? null,
				note: note ?? run.r.note,
			})
			.where(eq(obligationRuns.id, runId));
		await tx
			.update(tasks)
			.set({ status: "done", completedAt: new Date() })
			.where(
				and(eq(tasks.entityType, "obligation_run"), eq(tasks.entityId, runId)),
			);
		return {
			result: true,
			audit: {
				action: "obligation_run.completed",
				target: `obligation_run:${runId}`,
				before: { status: run.r.status },
				after: {
					status: "done",
					code: run.code,
					period: run.r.periodLabel,
					evidenceId: evidenceId ?? null,
				},
			},
		};
	});
	revalidatePath(PATH);
	revalidatePath("/heute");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

async function waiveObligationRunImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ obligation: ["complete"] });
	const parsed = waiveRunSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { runId, note } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [run] = await tx
			.select()
			.from(obligationRuns)
			.where(
				and(
					eq(obligationRuns.id, runId),
					eq(obligationRuns.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!run) return { result: false, audit: [] };
		await tx
			.update(obligationRuns)
			.set({
				status: "waived",
				note,
				completedByUserId: c.userId,
				completedAt: new Date(),
			})
			.where(eq(obligationRuns.id, runId));
		await tx
			.update(tasks)
			.set({ status: "done", completedAt: new Date() })
			.where(
				and(eq(tasks.entityType, "obligation_run"), eq(tasks.entityId, runId)),
			);
		return {
			result: true,
			audit: {
				action: "obligation_run.waived",
				target: `obligation_run:${runId}`,
				before: { status: run.status },
				after: { status: "waived", note },
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

async function updateObligationImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ obligation: ["update"] });
	const parsed = updateObligationSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { obligationId, ...patch } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				ownerUserId: obligations.ownerUserId,
				leadDays: obligations.leadDays,
				active: obligations.active,
			})
			.from(obligations)
			.where(
				and(
					eq(obligations.id, obligationId),
					eq(obligations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: false, audit: [] };
		const set: Record<string, unknown> = {};
		if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId;
		if (patch.leadDays !== undefined) set.leadDays = patch.leadDays;
		if (patch.active !== undefined) set.active = patch.active;
		if (Object.keys(set).length > 0)
			await tx
				.update(obligations)
				.set(set)
				.where(eq(obligations.id, obligationId));
		return {
			result: true,
			audit: {
				action: "obligation.update",
				target: `obligation:${obligationId}`,
				before,
				after: set,
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const applyObligationSeed = safeAction(
	"applyObligationSeed",
	applyObligationSeedImpl,
);
export const completeObligationRun = safeAction(
	"completeObligationRun",
	completeObligationRunImpl,
);
export const waiveObligationRun = safeAction(
	"waiveObligationRun",
	waiveObligationRunImpl,
);
export const updateObligation = safeAction(
	"updateObligation",
	updateObligationImpl,
);
