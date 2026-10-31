"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { approvalRequests, documentVersions } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { gateApproval } from "@/lib/approvals/service";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { restrictedView } from "@/lib/auth/visibility";
import { mutateOrg } from "@/lib/db/with-org";
import {
	type DestroyError,
	destroyVersion,
	loadVersionRetention,
} from "@/lib/documents/destruction";
import { s3Configured } from "@/lib/evidence/store";
import { logger } from "@/lib/log";
import { writeTombstone } from "@/lib/storage/tombstones";
import type { ActionResult } from "@/lib/validation/common";
import { fromZod } from "@/lib/validation/common";
import {
	destroyVersionSchema,
	extendRetentionSchema,
} from "@/lib/validation/registers";

// Aufbewahrung und Vernichtung von Dokument-Fassungen (AP9.3). Vernichten
// erst nach Ablauf der Aufbewahrung und mit Freigabe (Ablauf
// document_destruction, Standard: Geschäftsleitung); verlängern jederzeit
// vor der Vernichtung, nie verkürzen.

type DestroyOutcome = { status: "destroyed" | "pending"; fileKept: boolean };

async function requestVersionDestructionImpl(
	input: unknown,
): Promise<ActionResult<DestroyOutcome>> {
	const c = await requireStepUp({ document: ["update"] });
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const parsed = destroyVersionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { versionId, note } = parsed.data;
	const now = new Date();
	const res = await mutateOrg<
		| { ok: true; data: DestroyOutcome; tombstone: string | null }
		| { ok: false; error: DestroyError | "approval_pending" | string }
	>(toOrgCtx(c), async (tx) => {
		const loaded = await loadVersionRetention(tx, c.orgId, versionId, now);
		if (!loaded) return { result: { ok: false, error: "notFound" }, audit: [] };
		const { version: v, doc, info } = loaded;
		if (info.state === "destroyed")
			return { result: { ok: false, error: "already_destroyed" }, audit: [] };
		if (info.state !== "due")
			return {
				result: {
					ok: false,
					error: info.state === "retained" ? "not_due" : "in_force",
				},
				audit: [],
			};
		const [open] = await tx
			.select({ id: approvalRequests.id })
			.from(approvalRequests)
			.where(
				and(
					eq(approvalRequests.organizationId, c.orgId),
					eq(approvalRequests.entityType, "document"),
					eq(approvalRequests.entityId, doc.id),
					eq(approvalRequests.entityVersionRef, v.version),
					eq(approvalRequests.status, "pending"),
				),
			)
			.limit(1);
		if (open)
			return { result: { ok: false, error: "approval_pending" }, audit: [] };
		// Begründung an der Fassung; die Wirkung (outcomes.ts) liest sie
		await tx
			.update(documentVersions)
			.set({ destructionNote: note })
			.where(eq(documentVersions.id, v.id));
		const gate = await gateApproval(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			{
				trigger: "document.destroy",
				entityType: "document",
				entityId: doc.id,
				entityOwnerUserId: doc.ownerUserId,
				entityVersionRef: v.version,
				facts: { classification: doc.classification },
				title: `Vernichtung: ${doc.docNumber} v${v.version}`,
				link: `/dokumente/${encodeURIComponent(doc.docNumber)}`,
			},
		);
		if (gate.status === "error")
			return { result: { ok: false, error: gate.error }, audit: [] };
		if (gate.status === "pending")
			return {
				result: {
					ok: true,
					data: { status: "pending", fileKept: false },
					tombstone: null,
				},
				audit: {
					action: "document.destruction_requested",
					target: `document:${doc.id}`,
					after: { version: v.version, note },
				},
			};
		// kein Ablauf aktiv bzw. sofort freigegeben: jetzt vernichten. Bei
		// Sofort-Freigabe hat die Wirkung (outcomes.ts) schon vernichtet.
		const [after] = await tx
			.select({ destroyedAt: documentVersions.destroyedAt })
			.from(documentVersions)
			.where(eq(documentVersions.id, v.id))
			.limit(1);
		if (after?.destroyedAt)
			return {
				result: {
					ok: true,
					data: { status: "destroyed", fileKept: false },
					tombstone: null,
				},
				audit: [],
			};
		const done = await destroyVersion(tx, {
			orgId: c.orgId,
			versionId: v.id,
			userId: c.userId,
			note,
			now,
		});
		if (!done.ok) return { result: done, audit: [] };
		return {
			result: {
				ok: true,
				data: { status: "destroyed", fileKept: done.fileKept },
				tombstone: done.objectInS3 ? done.purgedEvidenceId : null,
			},
			audit: done.audit,
		};
	});
	if (!res.ok) return { ok: false, error: res.error };
	if (res.tombstone && s3Configured())
		await writeTombstone({
			kind: "evidence",
			orgId: c.orgId,
			id: res.tombstone,
			deletedAt: now.toISOString(),
		}).catch((err) =>
			logger.warn({ err }, "document destruction tombstone failed"),
		);
	revalidatePath("/dokumente", "layout");
	return { ok: true, data: res.data };
}

async function extendVersionRetentionImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireStepUp({ document: ["update"] });
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const parsed = extendRetentionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { versionId, until, reason } = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const loaded = await loadVersionRetention(tx, c.orgId, versionId);
		if (!loaded) return { result: "notFound", audit: [] };
		const { version: v, doc, info } = loaded;
		if (info.state === "destroyed")
			return { result: "already_destroyed", audit: [] };
		// nur verlängern: das neue Datum liegt nach dem bisherigen Ende
		const current = info.retainUntil?.toISOString().slice(0, 10) ?? null;
		if (current && until <= current) return { result: "not_later", audit: [] };
		await tx
			.update(documentVersions)
			.set({ retainUntil: until })
			.where(eq(documentVersions.id, v.id));
		return {
			result: null,
			audit: {
				action: "document.retention_extended",
				target: `document:${doc.id}`,
				before: { version: v.version, retainUntil: current },
				after: { retainUntil: until, reason },
			},
		};
	});
	if (res) return { ok: false, error: res };
	revalidatePath("/dokumente", "layout");
	return { ok: true, data: undefined };
}

export const requestVersionDestruction = safeAction(
	"requestVersionDestruction",
	requestVersionDestructionImpl,
);
export const extendVersionRetention = safeAction(
	"extendVersionRetention",
	extendVersionRetentionImpl,
);
