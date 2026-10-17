"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assessmentAnswers, assessments, evidence } from "@/db/schema";
import { PORTAL_SCOPES } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import {
	AuthError,
	type PortalContext,
	requirePortal,
} from "@/lib/auth/guards";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import {
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter, SlidingWindowLimiter } from "@/lib/rate-limit";
import { hasScopes } from "@/lib/security/tokens";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	portalAnswerSchema,
	portalFileSchema,
} from "@/lib/validation/suppliers";

// Lieferantenportal (ADR-017): Actions ohne Konto. Zugang nur über das
// Portal-Cookie (requirePortal); der Fragebogen kommt aus dem Token, nie aus
// der Eingabe. Jede Mutation läuft im Org-Kontext des Tokens und steht mit
// via: supplier_portal im Audit-Log (Akteur ohne User). Nach dem Einreichen
// ist der Fragebogen für den Lieferanten schreibgeschützt.

const PATH = "/lieferant";
const perTokenAnswers = new SlidingWindowLimiter(300, 10 * 60_000);
const perTokenUploads = new SlidingWindowLimiter(30, 10 * 60_000);

async function portal(): Promise<PortalContext> {
	const p = await requirePortal();
	if (!hasScopes(p.token.scopes, PORTAL_SCOPES))
		throw new AuthError("forbidden");
	return p;
}

async function openAssessment(tx: OrgTx, p: PortalContext) {
	const [a] = await tx
		.select()
		.from(assessments)
		.where(
			and(
				eq(assessments.id, p.assessmentId),
				eq(assessments.organizationId, p.ctx.orgId),
				eq(assessments.kind, "supplier"),
			),
		)
		.limit(1);
	if (!a || (a.status !== "in_progress" && a.status !== "draft")) return null;
	return a;
}

const via = (p: PortalContext) => ({
	via: "supplier_portal",
	tokenId: p.token.id,
});

async function answerAsSupplierImpl(input: unknown): Promise<ActionResult> {
	const p = await portal();
	if (!perTokenAnswers.check(p.token.id).allowed)
		return { ok: false, error: "rate_limited" };
	const parsed = portalAnswerSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(p.ctx, async (tx) => {
		const a = await openAssessment(tx, p);
		if (!a?.questions.some((q) => q.code === d.questionCode))
			return { result: false, audit: [] };
		const values = {
			answer: d.answer,
			comment: d.comment ?? null,
			naReason: d.answer === "na" ? (d.naReason ?? null) : null,
			answeredBy: "supplier" as const,
			answeredByUserId: null,
		};
		await tx
			.insert(assessmentAnswers)
			.values({
				organizationId: p.ctx.orgId,
				assessmentId: a.id,
				questionCode: d.questionCode,
				...values,
			})
			.onConflictDoUpdate({
				target: [
					assessmentAnswers.assessmentId,
					assessmentAnswers.questionCode,
				],
				set: values,
			});
		if (a.status === "draft")
			await tx
				.update(assessments)
				.set({ status: "in_progress" })
				.where(eq(assessments.id, a.id));
		return {
			result: true,
			audit: {
				action: "assessment.answer",
				target: `assessment:${a.id}`,
				after: { question: d.questionCode, answer: d.answer, ...via(p) },
			},
		};
	});
	if (!ok) return { ok: false, error: "locked" };
	return { ok: true, data: undefined };
}

// Datei an einer Frage: gleiche Pipeline wie intern (Format, clamd, DLP,
// Verschlüsselung mit Org-DEK). Ohne Control-Verknüpfung — die Datei belegt
// den Lieferanten, nicht ein eigenes Control.
async function uploadAsSupplierImpl(
	formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
	const p = await portal();
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	if (
		!perTokenUploads.check(p.token.id).allowed ||
		!getOrgLimiter().check(p.ctx.orgId).allowed
	)
		return { ok: false, error: "rate_limited" };
	const questionCode = String(formData.get("questionCode") ?? "").slice(0, 60);
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!questionCode) return { ok: false, error: "notFound" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(p.ctx, {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: "internal",
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const id = await mutateOrg(p.ctx, async (tx) => {
		const a = await openAssessment(tx, p);
		const q = a?.questions.find((x) => x.code === questionCode);
		if (!a || !q) return { result: null, audit: [] };
		const stored = await storeEncryptedEvidence(tx, {
			orgId: p.ctx.orgId,
			bytes,
			safeName: v.safeName,
			mime: v.mime,
			title: file.name.slice(0, 200),
			description:
				`Lieferantenbewertung ${a.code} (${q.code}): ${q.text}`.slice(0, 2000),
			type: "document",
			classification: v.classification,
			createdByUserId: null,
			source: "supplier_portal",
			dlp: v.dlp,
		});
		const [row] = await tx
			.select({ id: assessmentAnswers.id, ids: assessmentAnswers.evidenceIds })
			.from(assessmentAnswers)
			.where(
				and(
					eq(assessmentAnswers.assessmentId, a.id),
					eq(assessmentAnswers.questionCode, q.code),
				),
			)
			.limit(1);
		if (row)
			await tx
				.update(assessmentAnswers)
				.set({ evidenceIds: [...row.ids, stored.id] })
				.where(eq(assessmentAnswers.id, row.id));
		else
			await tx.insert(assessmentAnswers).values({
				organizationId: p.ctx.orgId,
				assessmentId: a.id,
				questionCode: q.code,
				evidenceIds: [stored.id],
				answeredBy: "supplier",
			});
		return {
			result: stored.id,
			audit: {
				action: "evidence.upload",
				target: `evidence:${stored.id}`,
				after: {
					fileName: v.safeName,
					size: bytes.byteLength,
					assessment: a.code,
					question: q.code,
					classification: v.classification,
					dlp: { action: v.dlp.action, findings: v.dlp.findings },
					...via(p),
				},
			},
		};
	});
	if (!id) return { ok: false, error: "locked" };
	revalidatePath(PATH);
	return { ok: true, data: { id, name: v.safeName } };
}

// Datei von der Antwort lösen (falsche Datei erwischt). Der Nachweis selbst
// bleibt beim Auftraggeber — löschen kann nur er.
async function detachSupplierFileImpl(input: unknown): Promise<ActionResult> {
	const p = await portal();
	const parsed = portalFileSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(p.ctx, async (tx) => {
		const a = await openAssessment(tx, p);
		if (!a) return { result: false, audit: [] };
		const [row] = await tx
			.select({ id: assessmentAnswers.id, ids: assessmentAnswers.evidenceIds })
			.from(assessmentAnswers)
			.where(
				and(
					eq(assessmentAnswers.assessmentId, a.id),
					eq(assessmentAnswers.questionCode, d.questionCode),
				),
			)
			.limit(1);
		if (!row?.ids.includes(d.evidenceId)) return { result: false, audit: [] };
		// nur eigene Uploads aus dem Portal
		const [ev] = await tx
			.select({ id: evidence.id })
			.from(evidence)
			.where(
				and(
					eq(evidence.id, d.evidenceId),
					eq(evidence.organizationId, p.ctx.orgId),
					eq(evidence.source, "supplier_portal"),
				),
			)
			.limit(1);
		if (!ev) return { result: false, audit: [] };
		await tx
			.update(assessmentAnswers)
			.set({ evidenceIds: row.ids.filter((x) => x !== d.evidenceId) })
			.where(eq(assessmentAnswers.id, row.id));
		return {
			result: true,
			audit: {
				action: "assessment.evidence_detached",
				target: `assessment:${a.id}`,
				after: {
					question: d.questionCode,
					evidenceId: d.evidenceId,
					...via(p),
				},
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Einreichen: Fragebogen geht an den Auftraggeber zur Bewertung; danach
// schreibgeschützt, bis der Auftraggeber ihn zur Nachbesserung zurückgibt.
async function submitAsSupplierImpl(): Promise<ActionResult<{ open: number }>> {
	const p = await portal();
	const out = await mutateOrg(p.ctx, async (tx) => {
		const a = await openAssessment(tx, p);
		if (!a) return { result: null, audit: [] };
		const rows = await tx
			.select({
				questionCode: assessmentAnswers.questionCode,
				answer: assessmentAnswers.answer,
			})
			.from(assessmentAnswers)
			.where(
				and(
					eq(assessmentAnswers.assessmentId, a.id),
					inArray(
						assessmentAnswers.questionCode,
						a.questions.map((q) => q.code),
					),
				),
			);
		const answered = new Set(
			rows.filter((r) => r.answer !== null).map((r) => r.questionCode),
		);
		const open = a.questions.filter((q) => !answered.has(q.code)).length;
		await tx
			.update(assessments)
			.set({ status: "submitted", submittedAt: new Date() })
			.where(eq(assessments.id, a.id));
		await notify(tx, {
			orgId: p.ctx.orgId,
			recipients: [a.ownerUserId, a.reviewerUserId],
			actorUserId: null,
			kind: "review_due",
			title: `Lieferant hat ${a.code} eingereicht: ${a.title}`,
			body:
				open > 0
					? `${open} Fragen sind unbeantwortet geblieben.`
					: "Alle Fragen sind beantwortet.",
			link: `/gap-analyse/${a.id}?schritt=bewertung`,
		});
		return {
			result: { open },
			audit: {
				action: "assessment.submit",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: { status: "submitted", unanswered: open, ...via(p) },
			},
		};
	});
	if (!out) return { ok: false, error: "locked" };
	revalidatePath(PATH);
	return { ok: true, data: out };
}

export const answerAsSupplier = safeAction(
	"answerAsSupplier",
	answerAsSupplierImpl,
);
export const uploadAsSupplier = safeAction(
	"uploadAsSupplier",
	uploadAsSupplierImpl,
);
export const detachSupplierFile = safeAction(
	"detachSupplierFile",
	detachSupplierFileImpl,
);
export const submitAsSupplier = safeAction(
	"submitAsSupplier",
	submitAsSupplierImpl,
);
