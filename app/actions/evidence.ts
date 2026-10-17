"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	controlEvidence,
	controlImplementations,
	documents,
	evidence,
	storagePurgeQueue,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { isOrgMember, ownedIds } from "@/lib/db/owned";
import { mutateOrg } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { purgeAfter } from "@/lib/jobs/storage";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
import { writeTombstone } from "@/lib/storage/tombstones";
import { type ActionResult, fromZod, uuid } from "@/lib/validation/common";
import { evidenceLinkSchema } from "@/lib/validation/grc";

// Nachweise: Link/Attestierung ohne Datei oder Datei-Upload (verschlüsselt
// mit dem Org-DEK, S3-Key org/<orgId>/nachweise/<uuid>). Download nur über
// /api/nachweise/[id] (Guard → RLS → Entschlüsselung → Attachment, auditiert).

async function s3AvailableImpl(): Promise<boolean> {
	await requireOrg();
	return s3Configured();
}

async function createEvidenceLinkImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = evidenceLinkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(evidence)
			.values({
				organizationId: c.orgId,
				title: d.title,
				description: d.description ?? null,
				type: d.type,
				classification: d.classification,
				url: d.url ?? null,
				validUntil: d.validUntil ?? null,
				createdByUserId: c.userId,
			})
			.returning({ id: evidence.id });
		if (!row) throw new Error("insert failed");
		if (d.implementationId)
			await linkEvidenceToControl(tx, c.orgId, d.implementationId, row.id);
		return {
			result: row.id,
			audit: {
				action: "evidence.create",
				target: `evidence:${row.id}`,
				after: {
					title: d.title,
					type: d.type,
					implementationId: d.implementationId ?? null,
				},
			},
		};
	});
	revalidatePath("/nachweise");
	revalidatePath("/controls", "layout");
	return { ok: true, data: { id } };
}

// Datei-Upload über FormData (Datei + Metadaten). Prüfung und Ablage über
// die gemeinsame Pipeline (lib/evidence/store.ts).
async function uploadEvidenceImpl(
	formData: FormData,
): Promise<
	ActionResult<{ id: string; classification: string; dlpRaised: boolean }>
> {
	const c = await requireOrg({ evidence: ["create"] });
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	const meta = evidenceLinkSchema.safeParse({
		implementationId: formData.get("implementationId") || undefined,
		title: formData.get("title") || file.name,
		description: formData.get("description") || undefined,
		type: formData.get("type") || "document",
		classification: formData.get("classification") || "internal",
		validUntil: formData.get("validUntil") || undefined,
	});
	if (!meta.success) return fromZod(meta.error);
	const d = meta.data;

	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: d.classification,
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};

	const rawDocId = formData.get("documentId");
	const documentId =
		typeof rawDocId === "string" && uuid.safeParse(rawDocId).success
			? rawDocId
			: null;

	const id = await mutateOrg<string | "locked">(toOrgCtx(c), async (tx) => {
		// Datei eines Dokument-Entwurfs: nur im Entwurf, freigegebene Stände
		// bleiben unverändert.
		if (documentId) {
			const [doc] = await tx
				.select({ status: documents.status })
				.from(documents)
				.where(
					and(
						eq(documents.id, documentId),
						eq(documents.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (doc?.status !== "draft") return { result: "locked", audit: [] };
		}
		const stored = await storeEncryptedEvidence(tx, {
			orgId: c.orgId,
			bytes,
			safeName: v.safeName,
			mime: v.mime,
			title: d.title,
			description: d.description,
			type: d.type,
			classification: v.classification,
			validUntil: d.validUntil,
			createdByUserId: c.userId,
			dlp: v.dlp,
		});
		if (d.implementationId)
			await linkEvidenceToControl(tx, c.orgId, d.implementationId, stored.id);
		if (documentId)
			await tx
				.update(documents)
				.set({ fileEvidenceId: stored.id })
				.where(eq(documents.id, documentId));
		return {
			result: stored.id,
			audit: {
				action: "evidence.upload",
				target: `evidence:${stored.id}`,
				after: {
					title: d.title,
					fileName: v.safeName,
					mime: v.mime,
					size: bytes.byteLength,
					implementationId: d.implementationId ?? null,
					classification: v.classification,
					dlp: { action: v.dlp.action, findings: v.dlp.findings },
				},
			},
		};
	});
	if (id === "locked") return { ok: false, error: "upload_locked" };
	revalidatePath("/nachweise");
	revalidatePath("/controls", "layout");
	if (documentId) revalidatePath("/dokumente", "layout");
	return {
		ok: true,
		data: {
			id,
			classification: v.classification,
			dlpRaised: v.classification !== d.classification,
		},
	};
}

async function linkEvidenceImpl(input: {
	implementationId: string;
	evidenceId: string;
}): Promise<ActionResult> {
	const c = await requireOrg({ evidence: ["create"] });
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await linkEvidenceToControl(
			tx,
			c.orgId,
			input.implementationId,
			input.evidenceId,
		);
		return {
			result: null,
			audit: {
				action: "evidence.link",
				target: `control:${input.implementationId}`,
				after: { evidenceId: input.evidenceId },
			},
		};
	});
	revalidatePath("/controls", "layout");
	return { ok: true, data: undefined };
}

// Nachweise eines Controls setzen (vorhandene verknüpfen, falsche lösen) —
// ein PDF kann mehrere Controls belegen, die Datei selbst bleibt erhalten.
async function setControlEvidenceImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = z
		.object({
			implementationId: uuid,
			evidenceIds: z.array(uuid).max(500),
		})
		.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { implementationId, evidenceIds } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [impl] = await tx
			.select({ id: controlImplementations.id })
			.from(controlImplementations)
			.where(
				and(
					eq(controlImplementations.id, implementationId),
					eq(controlImplementations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!impl) return { result: false, audit: [] };
		const before = (
			await tx
				.select({ id: controlEvidence.evidenceId })
				.from(controlEvidence)
				.where(eq(controlEvidence.implementationId, impl.id))
		).map((x) => x.id);
		const after = await ownedIds(tx, evidence, c.orgId, evidenceIds);
		const keep = new Set(after);
		const removed = before.filter((id) => !keep.has(id));
		const had = new Set(before);
		const added = after.filter((id) => !had.has(id));
		if (removed.length > 0)
			await tx
				.delete(controlEvidence)
				.where(
					and(
						eq(controlEvidence.implementationId, impl.id),
						inArray(controlEvidence.evidenceId, removed),
					),
				);
		if (added.length > 0)
			await tx
				.insert(controlEvidence)
				.values(
					added.map((evidenceId) => ({
						organizationId: c.orgId,
						implementationId: impl.id,
						evidenceId,
					})),
				)
				.onConflictDoNothing();
		return {
			result: true,
			audit:
				added.length + removed.length === 0
					? []
					: {
							action: "evidence.links",
							target: `control:${impl.id}`,
							before: { evidenceIds: before },
							after: { evidenceIds: after, added, removed },
						},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/controls", "layout");
	revalidatePath("/nachweise");
	return { ok: true, data: undefined };
}

// Löschen: Zeile sofort weg, Objekt erst nach der Backup-Aufbewahrung
// (storage_purge_queue → Job storage-purge). Ein Tombstone im Objektspeicher
// sorgt dafür, dass ein später eingespieltes DB-Backup die Löschung nachholt.
async function deleteEvidenceImpl(evidenceId: string): Promise<ActionResult> {
	const c = await requireStepUp({ evidence: ["delete"] });
	const removed = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(evidence)
			.where(
				and(eq(evidence.id, evidenceId), eq(evidence.organizationId, c.orgId)),
			)
			.limit(1);
		if (!row) return { result: null, audit: [] };
		await tx.delete(evidence).where(eq(evidence.id, evidenceId));
		const after = row.storageKey ? purgeAfter(new Date()) : null;
		if (row.storageKey && after) {
			await tx
				.insert(storagePurgeQueue)
				.values({
					organizationId: c.orgId,
					storageKey: row.storageKey,
					reason: "evidence_deleted",
					refId: row.id,
					requestedByUserId: c.userId,
					purgeAfter: after,
				})
				.onConflictDoNothing();
		}
		return {
			result: { hadFile: Boolean(row.storageKey) },
			audit: {
				action: "evidence.delete",
				target: `evidence:${evidenceId}`,
				before: {
					title: row.title,
					fileName: row.fileName,
					sha256: row.sha256,
				},
				after: { objectPurgeAfter: after?.toISOString() ?? null },
			},
		};
	});
	if (!removed) return { ok: false, error: "notFound" };
	if (removed.hadFile && s3Configured()) {
		await writeTombstone({
			kind: "evidence",
			orgId: c.orgId,
			id: evidenceId,
			deletedAt: new Date().toISOString(),
		}).catch((err) =>
			logger.warn({ err, evidenceId }, "evidence tombstone failed"),
		);
	}
	revalidatePath("/nachweise");
	revalidatePath("/controls", "layout");
	return { ok: true, data: undefined };
}

// „Nachweis anfordern": Aufgabe an eine Person für ein Control.
async function requestEvidenceImpl(
	raw: unknown,
): Promise<ActionResult<{ taskId: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const parsed = z
		.object({
			implementationId: uuid,
			assigneeUserId: z.string().min(1).max(64),
			title: z.string().trim().min(1).max(200),
		})
		.safeParse(raw);
	if (!parsed.success) return fromZod(parsed.error);
	const input = parsed.data;
	const { tasks, controls } = await import("@/db/schema");
	const taskId = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		if (!(await isOrgMember(tx, c.orgId, input.assigneeUserId)))
			return { result: null, audit: [] };
		const [impl] = await tx
			.select({ id: controlImplementations.id, code: controls.code })
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.id, input.implementationId),
					eq(controlImplementations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!impl) throw new Error("notFound");
		const [row] = await tx
			.insert(tasks)
			.values({
				organizationId: c.orgId,
				title: input.title.slice(0, 200),
				assigneeUserId: input.assigneeUserId,
				createdByUserId: c.userId,
				entityType: "control",
				entityId: impl.id,
				sourceKind: "evidence_request",
				priority: "normal",
			})
			.returning({ id: tasks.id });
		if (!row) throw new Error("insert failed");
		await notify(tx, {
			orgId: c.orgId,
			recipients: [input.assigneeUserId],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Nachweis angefordert: ${impl.code}`,
			link: `/controls/${impl.code}`,
		});
		return {
			result: row.id,
			audit: {
				action: "evidence.request",
				target: `control:${impl.id}`,
				after: { taskId: row.id, assigneeUserId: input.assigneeUserId },
			},
		};
	});
	if (!taskId) return { ok: false, error: "notMember" };
	revalidatePath("/controls", "layout");
	return { ok: true, data: { taskId } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const s3Available = safeAction(
	"s3Available",
	s3AvailableImpl,
	() => false,
);
export const createEvidenceLink = safeAction(
	"createEvidenceLink",
	createEvidenceLinkImpl,
);
export const uploadEvidence = safeAction("uploadEvidence", uploadEvidenceImpl);
export const linkEvidence = safeAction("linkEvidence", linkEvidenceImpl);
export const setControlEvidence = safeAction(
	"setControlEvidence",
	setControlEvidenceImpl,
);
export const deleteEvidence = safeAction("deleteEvidence", deleteEvidenceImpl);
export const requestEvidence = safeAction(
	"requestEvidence",
	requestEvidenceImpl,
);
