"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { decisionRequests } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { withdraw } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { openDecisionRequest } from "@/lib/compliance/decision-service";
import { mutateOrg } from "@/lib/db/with-org";
import {
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { getOrgLimiter } from "@/lib/rate-limit";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { decisionRequestSchema } from "@/lib/validation/governance";

// Entscheidung beim Management anfragen (E2): Frage + Ausgangslage +
// Optionen + Frist, Bezug zur Entität und zu Anforderungen. Entschieden wird
// über den Workflow management_decision (/heute/freigaben); das Ergebnis
// wird automatisch ein Beschluss (lib/compliance/decision-service.ts).

async function createDecisionRequestImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string; status: string }>> {
	const c = await requireOrg({ decision: ["create"] });
	const parsed = decisionRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ id: string; code: string; status: string }>
	>(toOrgCtx(c), async (tx) => {
		const r = await openDecisionRequest(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			d,
		);
		return r.ok
			? {
					result: {
						ok: true,
						data: { id: r.id, code: r.code, status: r.status },
					},
					audit: r.audit,
				}
			: { result: { ok: false, error: r.error }, audit: [] };
	});
	revalidatePath("/beschluesse");
	return res;
}

async function withdrawDecisionRequestImpl(id: string): Promise<ActionResult> {
	const c = await requireOrg({ decision: ["create"] });
	const done = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [q] = await tx
			.select({
				status: decisionRequests.status,
				requestedByUserId: decisionRequests.requestedByUserId,
				approvalRequestId: decisionRequests.approvalRequestId,
			})
			.from(decisionRequests)
			.where(
				and(
					eq(decisionRequests.id, id),
					eq(decisionRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!q || q.status !== "open" || q.requestedByUserId !== c.userId)
			return { result: false, audit: [] };
		if (q.approvalRequestId)
			await withdraw(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				q.approvalRequestId,
			);
		await tx
			.update(decisionRequests)
			.set({ status: "withdrawn" })
			.where(eq(decisionRequests.id, id));
		return {
			result: true,
			audit: {
				action: "decision_request.withdrawn",
				target: `decision_request:${id}`,
			},
		};
	});
	if (!done) return { ok: false, error: "notFound" };
	revalidatePath("/beschluesse");
	return { ok: true, data: undefined };
}

// Unterlagen zur Anfrage (C1): nur die anfragende Person, über die
// Upload-Pipeline (Typ, Virenscan, DLP, Org-DEK); höchstens 10 je Anfrage.
const MAX_ATTACHMENTS = 10;

async function uploadDecisionAttachmentImpl(
	formData: FormData,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ decision: ["create"] });
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	const id = String(formData.get("decisionRequestId") ?? "");
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "notFound" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: "confidential",
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [q] = await tx
				.select({
					code: decisionRequests.code,
					question: decisionRequests.question,
					status: decisionRequests.status,
					requestedByUserId: decisionRequests.requestedByUserId,
					attachmentEvidenceIds: decisionRequests.attachmentEvidenceIds,
				})
				.from(decisionRequests)
				.where(
					and(
						eq(decisionRequests.id, id),
						eq(decisionRequests.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!q || q.requestedByUserId !== c.userId || q.status === "withdrawn")
				return { result: { ok: false, error: "notFound" }, audit: [] };
			if (q.attachmentEvidenceIds.length >= MAX_ATTACHMENTS)
				return { result: { ok: false, error: "tooMany" }, audit: [] };
			const stored = await storeEncryptedEvidence(tx, {
				orgId: c.orgId,
				bytes,
				safeName: v.safeName,
				mime: v.mime,
				title: file.name.slice(0, 200),
				description: `Managementanfrage ${q.code}: ${q.question}`.slice(
					0,
					2000,
				),
				type: "document",
				classification: v.classification,
				createdByUserId: c.userId,
				source: "decision_request",
				dlp: v.dlp,
			});
			await tx
				.update(decisionRequests)
				.set({
					attachmentEvidenceIds: [...q.attachmentEvidenceIds, stored.id],
				})
				.where(eq(decisionRequests.id, id));
			return {
				result: { ok: true, data: { id: stored.id } },
				audit: {
					action: "evidence.upload",
					target: `evidence:${stored.id}`,
					after: {
						fileName: v.safeName,
						size: bytes.byteLength,
						decisionRequest: q.code,
						classification: v.classification,
						dlp: { action: v.dlp.action, findings: v.dlp.findings },
					},
				},
			};
		},
	);
	revalidatePath("/beschluesse");
	revalidatePath("/heute/freigaben");
	return res;
}

export const createDecisionRequest = safeAction(
	"createDecisionRequest",
	createDecisionRequestImpl,
);
export const withdrawDecisionRequest = safeAction(
	"withdrawDecisionRequest",
	withdrawDecisionRequestImpl,
);
export const uploadDecisionAttachment = safeAction(
	"uploadDecisionAttachment",
	uploadDecisionAttachmentImpl,
);
