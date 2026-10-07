"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { controlImplementations, controls } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { REQUIREMENT_BY_KEY } from "@/lib/compliance/catalog";
import { coverageDelta } from "@/lib/compliance/coverage";
import { orgCoverage } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import { CONTROL_STATUS } from "@/lib/entities/control";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import {
	type ActionResult,
	fromZod,
	uuid as uuidSchema,
} from "@/lib/validation/common";
import {
	assignControlSchema,
	setControlStatusSchema,
} from "@/lib/validation/grc";

export type StatusChangeResult = {
	code: string;
	status: string;
	// Für den Toast „Erfüllt damit ISO A.8.24 · DORA Art. 9(2) — ISO 61 % → 62 %"
	satisfied: { framework: string; code: string; title: string }[];
	frameworks: {
		framework: string;
		before: number | null;
		after: number | null;
	}[];
};

export async function setControlStatus(
	input: unknown,
): Promise<ActionResult<StatusChangeResult>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = setControlStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { implementationId, status, note } = parsed.data;

	const result = await mutateOrg<ActionResult<StatusChangeResult>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select({
					id: controlImplementations.id,
					status: controlImplementations.status,
					note: controlImplementations.note,
					ownerUserId: controlImplementations.ownerUserId,
					assigneeUserId: controlImplementations.assigneeUserId,
					code: controls.code,
					title: controls.title,
				})
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.id, implementationId),
						eq(controlImplementations.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!row)
				return { result: { ok: false as const, error: "notFound" }, audit: [] };

			const check = canTransition(CONTROL_STATUS, row.status, status, {
				hasNote: Boolean(note && note.trim().length >= 3),
			});
			if (!check.ok) {
				return {
					result: { ok: false as const, error: `transition_${check.reason}` },
					audit: [],
				};
			}

			// Abdeckungsdifferenz vor dem Schreiben rechnen (gleicher Stand).
			const cov = await orgCoverage(tx, c.orgId);
			const delta = cov ? coverageDelta(cov.input, row.code, status) : null;

			await tx
				.update(controlImplementations)
				.set({
					status,
					note: note?.trim() ? note.trim() : row.note,
					implementedAt: status === "implemented" ? new Date() : null,
					source: "manual",
				})
				.where(eq(controlImplementations.id, implementationId));

			await notify(tx, {
				orgId: c.orgId,
				recipients: [row.ownerUserId, row.assigneeUserId],
				actorUserId: c.userId,
				kind: "entity_changed",
				title: `${row.code} · ${row.title}: Status ${status}`,
				link: `/controls/${row.code}`,
			});

			const satisfied = (delta?.affected ?? [])
				.filter((a) => a.after === "covered" && a.before !== "covered")
				.map((a) => {
					const req = REQUIREMENT_BY_KEY.get(a.key);
					const idx = a.key.indexOf(":");
					return {
						framework: a.key.slice(0, idx),
						code: a.key.slice(idx + 1),
						title: req?.title ?? "",
					};
				});

			return {
				result: {
					ok: true as const,
					data: {
						code: row.code,
						status,
						satisfied,
						frameworks: delta?.frameworks ?? [],
					},
				},
				audit: {
					action: "control.status",
					target: `control:${implementationId}`,
					before: { status: row.status, note: row.note },
					after: { status, note: note?.trim() || row.note, code: row.code },
				},
			};
		},
	);

	revalidatePath("/controls");
	revalidatePath("/ueberblick");
	revalidatePath("/synergien");
	revalidatePath("/rahmenwerke", "layout");
	return result;
}

export async function assignControl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ control: ["assign"] });
	const parsed = assignControlSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { implementationId, ownerUserId, assigneeUserId, nextReviewAt } =
		parsed.data;

	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({
				ownerUserId: controlImplementations.ownerUserId,
				assigneeUserId: controlImplementations.assigneeUserId,
				nextReviewAt: controlImplementations.nextReviewAt,
				code: controls.code,
				title: controls.title,
			})
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.id, implementationId),
					eq(controlImplementations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const patch: Partial<typeof controlImplementations.$inferInsert> = {};
		if (ownerUserId !== undefined) patch.ownerUserId = ownerUserId;
		if (assigneeUserId !== undefined) patch.assigneeUserId = assigneeUserId;
		if (nextReviewAt !== undefined) patch.nextReviewAt = nextReviewAt;
		await tx
			.update(controlImplementations)
			.set(patch)
			.where(eq(controlImplementations.id, implementationId));
		if (assigneeUserId && assigneeUserId !== row.assigneeUserId) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [assigneeUserId],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `Dir wurde ${row.code} · ${row.title} zugewiesen`,
				link: `/controls/${row.code}`,
			});
		}
		return {
			result: true,
			audit: {
				action: "control.assign",
				target: `control:${implementationId}`,
				before: {
					ownerUserId: row.ownerUserId,
					assigneeUserId: row.assigneeUserId,
					nextReviewAt: row.nextReviewAt,
				},
				after: { ...patch, code: row.code },
			},
		};
	});
	if (!res) return { ok: false, error: "notFound" };
	revalidatePath("/controls");
	return { ok: true, data: undefined };
}

const bulkSchema = z.object({
	implementationIds: z.array(uuidSchema).min(1).max(200),
	status: z.enum(["not_started", "planned", "in_progress"]).optional(),
	ownerUserId: uuidSchema.nullable().optional(),
	assigneeUserId: uuidSchema.nullable().optional(),
});

// Bulk: Status (nur Übergänge ohne Begründungspflicht) und Zuweisung für
// mehrere Controls. Jede Zeile einzeln geprüft (RLS, Statusmaschine) und
// auditiert; nicht erlaubte Übergänge werden übersprungen.
export async function bulkUpdateControls(
	input: unknown,
): Promise<ActionResult<{ updated: number; skipped: number }>> {
	const c = await requireOrg({ control: ["update", "assign"] });
	const parsed = bulkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const rows = await tx
			.select({
				id: controlImplementations.id,
				status: controlImplementations.status,
				ownerUserId: controlImplementations.ownerUserId,
				assigneeUserId: controlImplementations.assigneeUserId,
				code: controls.code,
				title: controls.title,
			})
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.organizationId, c.orgId),
					inArray(controlImplementations.id, d.implementationIds),
				),
			);
		const audits: AuditInput[] = [];
		let updated = 0;
		let skipped = d.implementationIds.length - rows.length;
		for (const row of rows) {
			const patch: Partial<typeof controlImplementations.$inferInsert> = {};
			if (d.status && d.status !== row.status) {
				const check = canTransition(CONTROL_STATUS, row.status, d.status, {});
				if (!check.ok) {
					skipped += 1;
					continue;
				}
				patch.status = d.status;
				patch.source = "manual";
			}
			if (d.ownerUserId !== undefined) patch.ownerUserId = d.ownerUserId;
			if (d.assigneeUserId !== undefined)
				patch.assigneeUserId = d.assigneeUserId;
			if (Object.keys(patch).length === 0) {
				skipped += 1;
				continue;
			}
			await tx
				.update(controlImplementations)
				.set(patch)
				.where(eq(controlImplementations.id, row.id));
			if (d.assigneeUserId && d.assigneeUserId !== row.assigneeUserId) {
				await notify(tx, {
					orgId: c.orgId,
					recipients: [d.assigneeUserId],
					actorUserId: c.userId,
					kind: "task_assigned",
					title: `Dir wurde ${row.code} · ${row.title} zugewiesen`,
					link: `/controls/${row.code}`,
				});
			}
			audits.push({
				action: "control.bulk_update",
				target: `control:${row.id}`,
				before: {
					status: row.status,
					ownerUserId: row.ownerUserId,
					assigneeUserId: row.assigneeUserId,
				},
				after: {
					status: patch.status ?? row.status,
					ownerUserId: patch.ownerUserId ?? row.ownerUserId,
					assigneeUserId: patch.assigneeUserId ?? row.assigneeUserId,
				},
			});
			updated += 1;
		}
		return { result: { updated, skipped }, audit: audits };
	});
	revalidatePath("/controls");
	revalidatePath("/ueberblick");
	return { ok: true, data: out };
}
