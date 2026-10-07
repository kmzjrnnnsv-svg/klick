"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	controlEvidence,
	controlImplementations,
	evidence,
	orgSettings,
} from "@/db/schema";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import {
	encryptBytes,
	packEnvelope,
	sha256Hex,
	unwrapDek,
} from "@/lib/crypto/envelope";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { evidenceAad } from "@/lib/evidence/aad";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
import { clamdConfigured, scanBytes } from "@/lib/uploads/clamav";
import { validateUpload } from "@/lib/uploads/validate";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { evidenceLinkSchema } from "@/lib/validation/grc";

// Nachweise: Link/Attestierung ohne Datei oder Datei-Upload (verschlüsselt
// mit dem Org-DEK, S3-Key org/<orgId>/nachweise/<uuid>). Download nur über
// /api/nachweise/[id] (Guard → RLS → Entschlüsselung → Attachment, auditiert).

function s3Configured(): boolean {
	const e = env();
	return Boolean(e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
}

export async function s3Available(): Promise<boolean> {
	await requireOrg();
	return s3Configured();
}

export async function createEvidenceLink(
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
			await linkToImplementation(tx, c.orgId, d.implementationId, row.id);
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

// Datei-Upload über FormData (Datei + Metadaten). Magic-Bytes-Prüfung,
// 25 MB, Verschlüsselung mit Org-DEK, Hash über den Klartext.
export async function uploadEvidence(
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
	const v = await validateUpload({
		name: file.name,
		bytes,
		declaredMime: file.type,
	});
	if (!v.ok) return { ok: false, error: `upload_${v.reason}` };

	// Optionaler Malware-Scan (clamd). Fail closed: konfiguriert, aber nicht
	// erreichbar → Upload abgelehnt. Treffer stehen als denied im Audit-Log.
	if (clamdConfigured()) {
		const scan = await scanBytes(bytes);
		if (scan.status !== "clean") {
			await mutateOrg(toOrgCtx(c), async () => ({
				result: null,
				audit: {
					action: "evidence.upload_blocked",
					target: `organization:${c.orgId}`,
					outcome: "denied" as const,
					after: {
						reason: scan.status,
						signature: scan.status === "infected" ? scan.signature : undefined,
						fileName: v.safeName,
					},
				},
			}));
			return {
				ok: false,
				error:
					scan.status === "infected"
						? "upload_malware"
						: "upload_scan_unavailable",
			};
		}
	}

	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [s] = await tx
			.select({
				encryptedDek: orgSettings.encryptedDek,
				keyVersion: orgSettings.keyVersion,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		if (!s) throw new Error("org settings missing");
		const evidenceId = crypto.randomUUID();
		const storageKey = `org/${c.orgId}/nachweise/${evidenceId}`;
		const dek = await unwrapDek({
			wrapped: s.encryptedDek,
			keyVersion: s.keyVersion,
		});
		const sealed = await encryptBytes(bytes, dek, {
			keyVersion: s.keyVersion,
			aad: evidenceAad(evidenceId),
		});
		const packed = packEnvelope(sealed);
		const { putBytes } = await import("@/lib/storage/s3");
		await putBytes(storageKey, packed);
		await tx.insert(evidence).values({
			id: evidenceId,
			organizationId: c.orgId,
			title: d.title,
			description: d.description ?? null,
			type: d.type,
			classification: d.classification,
			fileName: v.safeName,
			mimeType: v.mime,
			sizeBytes: bytes.byteLength,
			storageKey,
			keyVersion: s.keyVersion,
			sha256: sha256Hex(bytes),
			validUntil: d.validUntil ?? null,
			createdByUserId: c.userId,
		});
		if (d.implementationId)
			await linkToImplementation(tx, c.orgId, d.implementationId, evidenceId);
		return {
			result: evidenceId,
			audit: {
				action: "evidence.upload",
				target: `evidence:${evidenceId}`,
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

export async function linkEvidence(input: {
	implementationId: string;
	evidenceId: string;
}): Promise<ActionResult> {
	const c = await requireOrg({ evidence: ["create"] });
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await linkToImplementation(
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

export async function deleteEvidence(
	evidenceId: string,
): Promise<ActionResult> {
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
export async function requestEvidence(input: {
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

async function linkToImplementation(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	implementationId: string,
	evidenceId: string,
): Promise<void> {
	const [impl] = await tx
		.select({ id: controlImplementations.id })
		.from(controlImplementations)
		.where(
			and(
				eq(controlImplementations.id, implementationId),
				eq(controlImplementations.organizationId, orgId),
			),
		)
		.limit(1);
	if (!impl) throw new Error("implementation not found");
	await tx
		.insert(controlEvidence)
		.values({ organizationId: orgId, implementationId, evidenceId })
		.onConflictDoNothing();
}
