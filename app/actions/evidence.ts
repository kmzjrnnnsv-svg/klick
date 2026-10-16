"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlImplementations, evidence } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
import { type ActionResult, fromZod } from "@/lib/validation/common";
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
): Promise<ActionResult<{ id: string }>> {
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
	});
	if (!v.ok) return { ok: false, error: v.error };

	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const stored = await storeEncryptedEvidence(tx, {
			orgId: c.orgId,
			bytes,
			safeName: v.safeName,
			mime: v.mime,
			title: d.title,
			description: d.description,
			type: d.type,
			classification: d.classification,
			validUntil: d.validUntil,
			createdByUserId: c.userId,
		});
		if (d.implementationId)
			await linkEvidenceToControl(tx, c.orgId, d.implementationId, stored.id);
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
				},
			},
		};
	});
	revalidatePath("/nachweise");
	revalidatePath("/controls", "layout");
	return { ok: true, data: { id } };
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
		if (!row) return { result: false, audit: [] };
		await tx.delete(evidence).where(eq(evidence.id, evidenceId));
		if (row.storageKey && s3Configured()) {
			const { deleteObject } = await import("@/lib/storage/s3");
			await deleteObject(row.storageKey).catch(() => undefined);
		}
		return {
			result: true,
			audit: {
				action: "evidence.delete",
				target: `evidence:${evidenceId}`,
				before: {
					title: row.title,
					fileName: row.fileName,
					sha256: row.sha256,
				},
			},
		};
	});
	if (!removed) return { ok: false, error: "notFound" };
	revalidatePath("/nachweise");
	revalidatePath("/controls", "layout");
	return { ok: true, data: undefined };
}

// „Nachweis anfordern": Aufgabe an eine Person für ein Control.
async function requestEvidenceImpl(input: {
	implementationId: string;
	assigneeUserId: string;
	title: string;
}): Promise<ActionResult<{ taskId: string }>> {
	const c = await requireOrg({ task: ["create"] });
	const { tasks, controls } = await import("@/db/schema");
	const taskId = await mutateOrg(toOrgCtx(c), async (tx) => {
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
export const deleteEvidence = safeAction("deleteEvidence", deleteEvidenceImpl);
export const requestEvidence = safeAction(
	"requestEvidence",
	requestEvidenceImpl,
);
