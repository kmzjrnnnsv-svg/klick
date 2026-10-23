"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	assessmentAnswers,
	assessments,
	documents,
	products,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import {
	PRODUCT_TEMPLATE,
	PRODUCT_TEMPLATE_VERSION,
	productQuestions,
} from "@/lib/assessments/product-template";
import { scoreAssessment } from "@/lib/assessments/score";
import { answerStates, nextAssessmentCode } from "@/lib/assessments/state";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nextProductCode } from "@/lib/compliance/cra";
import { storeSbom } from "@/lib/compliance/sbom-service";
import type { OrgTx } from "@/lib/db/with-org";
import { mutateOrg } from "@/lib/db/with-org";
import { PRODUCT_STATUS } from "@/lib/entities/product";
import { canTransition } from "@/lib/entities/status-machine";
import { s3Configured, screenUpload } from "@/lib/evidence/store";
import { parseIsolated, sbomResultSchema } from "@/lib/parse/client";
import { getOrgLimiter } from "@/lib/rate-limit";
import { checkSbom } from "@/lib/security/sbom-check";
import { assessmentIdSchema } from "@/lib/validation/assessments";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	createProductSchema,
	productIdSchema,
	setProductStatusSchema,
	updateProductSchema,
} from "@/lib/validation/products";

// Produktregister (CRA): anlegen, einstufen, Lebenszyklus, SBOM, Checkliste.
// Jede Mutation mit before/after im Audit; Konformitätsweg und offene Punkte
// werden abgeleitet (lib/compliance/cra.ts), nie gespeichert.

const PATH = "/produkte";

async function loadProduct(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select()
		.from(products)
		.where(and(eq(products.id, id), eq(products.organizationId, orgId)))
		.limit(1);
	return row ?? null;
}

async function createProductImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ product: ["create"] });
	const parsed = createProductSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = await tx
			.select({ code: products.code })
			.from(products)
			.where(eq(products.organizationId, c.orgId));
		const code = nextProductCode(existing.map((r) => r.code));
		const [row] = await tx
			.insert(products)
			.values({
				organizationId: c.orgId,
				code,
				name: d.name,
				description: d.description ?? null,
				kind: d.kind,
				role: d.role,
				version: d.version ?? null,
				// reiner SaaS ist meist nicht erfasst — Vorschlag, Org bestätigt
				craInScope: d.kind === "saas" ? false : null,
				scopeReason:
					d.kind === "saas"
						? "Reiner Webdienst ohne Produktbezug — NIS2 statt CRA (Art. 3 Nr. 2). Prüfen, ob Apps, Clients oder SDKs dazugehören."
						: null,
				ownerUserId: d.ownerUserId ?? c.userId,
			})
			.returning({ id: products.id });
		if (!row) throw new Error("insert failed");
		return {
			result: { id: row.id, code },
			audit: {
				action: "product.create",
				target: `product:${row.id}`,
				after: { code, name: d.name, kind: d.kind, role: d.role },
			},
		};
	});
	revalidatePath(PATH);
	revalidatePath("/", "layout");
	return { ok: true, data: out };
}

async function updateProductImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ product: ["update"] });
	const parsed = updateProductSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { productId, ...patch } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const row = await loadProduct(tx, c.orgId, productId);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		// Fremdschlüssel prüfen nicht über RLS — Dokumente explizit auf die Org
		// einschränken.
		const docIds = [patch.riskDocumentId, patch.techDocDocumentId].filter(
			(x): x is string => Boolean(x),
		);
		if (docIds.length > 0) {
			const found = await tx
				.select({ id: documents.id })
				.from(documents)
				.where(
					and(
						eq(documents.organizationId, c.orgId),
						inArray(documents.id, docIds),
					),
				);
			if (found.length !== new Set(docIds).size)
				return { result: { ok: false, error: "notFound" }, audit: [] };
		}
		const set = Object.fromEntries(
			Object.entries(patch).filter(([, v]) => v !== undefined),
		) as Partial<typeof products.$inferInsert>;
		if (Object.keys(set).length === 0)
			return { result: { ok: true, data: undefined }, audit: [] };
		await tx.update(products).set(set).where(eq(products.id, row.id));
		const before = Object.fromEntries(
			Object.keys(set).map((k) => [k, row[k as keyof typeof row]]),
		);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "product.update",
				target: `product:${row.id}`,
				before,
				after: set,
			},
		};
	});
	revalidatePath(PATH, "layout");
	revalidatePath("/", "layout");
	return res;
}

async function setProductStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ product: ["update"] });
	const parsed = setProductStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { productId, status, note } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const row = await loadProduct(tx, c.orgId, productId);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(PRODUCT_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};
		const today = new Date().toISOString().slice(0, 10);
		await tx
			.update(products)
			.set({
				status,
				// Inverkehrbringen: Datum setzen, falls noch leer (Supportzeitraum)
				...(status === "on_market" && !row.placedOnMarketAt
					? { placedOnMarketAt: today }
					: {}),
			})
			.where(eq(products.id, row.id));
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "product.status",
				target: `product:${row.id}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

// SBOM hochladen: Datei verschlüsselt als Nachweis (Herkunft sbom, am Control
// CC-PRD-03), Zusammenfassung mit Pflichtfeld-Prüfung am Produkt. Ungültige
// Formate werden vor dem Speichern abgewiesen, geparst wird erst nach dem
// Screening.
async function uploadSbomImpl(
	formData: FormData,
): Promise<ActionResult<{ ok: boolean; issues: string[] }>> {
	const c = await requireOrg({ product: ["update"], evidence: ["create"] });
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	const productId = String(formData.get("productId") ?? "");
	const idCheck = productIdSchema.safeParse({ productId });
	if (!idCheck.success) return fromZod(idCheck.error);
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Erst die Pipeline (Typ, clamd, DLP), dann das Format — beides im
	// Parser-Prozess, nie im App-Prozess
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: "application/json",
		classification: "internal",
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const parsed = await parseIsolated({ op: "sbom" }, bytes, sbomResultSchema);
	if (!parsed.ok) return { ok: false, error: "upload_parser_unavailable" };
	if (!parsed.data.ok) return { ok: false, error: `sbom_${parsed.data.error}` };
	const summary = checkSbom(parsed.data.sbom, new Date());
	const res = await mutateOrg<ActionResult<{ ok: boolean; issues: string[] }>>(
		toOrgCtx(c),
		async (tx) => {
			const row = await loadProduct(tx, c.orgId, productId);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			const { audit } = await storeSbom(tx, c, {
				product: row,
				summary,
				file: {
					bytes,
					safeName: v.safeName,
					mime: v.mime,
					classification: v.classification,
					dlp: v.dlp,
					source: "sbom",
				},
			});
			return {
				result: { ok: true, data: { ok: summary.ok, issues: summary.issues } },
				audit,
			};
		},
	);
	revalidatePath(`${PATH}/${productId}`);
	revalidatePath("/nachweise");
	return res;
}

// CRA-Checkliste je Produkt über den Fragebogen-Motor (kind product). Eine
// laufende Checkliste wird fortgesetzt statt doppelt angelegt.
async function startProductChecklistImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ product: ["read"], assessment: ["create"] });
	const parsed = productIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const row = await loadProduct(tx, c.orgId, parsed.data.productId);
		if (!row) return { result: null, audit: [] };
		const existing = await tx
			.select({
				id: assessments.id,
				code: assessments.code,
				status: assessments.status,
				subjectId: assessments.subjectId,
			})
			.from(assessments)
			.where(eq(assessments.organizationId, c.orgId));
		const running = existing.find(
			(a) =>
				a.subjectId === row.id &&
				a.status !== "completed" &&
				a.status !== "cancelled",
		);
		if (running) return { result: { id: running.id }, audit: [] };
		const questions = productQuestions(row.role);
		// Open-Source-Verwalter: keine Produktpflichten aus Anhang I (Art. 24)
		if (questions.length === 0) return { result: null, audit: [] };
		const code = nextAssessmentCode(
			existing.map((a) => a.code),
			"PC",
			new Date(),
		);
		const [a] = await tx
			.insert(assessments)
			.values({
				organizationId: c.orgId,
				code,
				kind: "product",
				subjectType: "product",
				subjectId: row.id,
				templateCode: PRODUCT_TEMPLATE,
				templateVersion: PRODUCT_TEMPLATE_VERSION,
				title: `CRA-Checkliste ${row.code} ${row.name}`,
				frameworks: ["cra"],
				questions,
				status: "in_progress",
				ownerUserId: row.ownerUserId ?? c.userId,
			})
			.returning({ id: assessments.id });
		if (!a) throw new Error("insert failed");
		return {
			result: { id: a.id },
			audit: {
				action: "assessment.create",
				target: `assessment:${a.id}`,
				after: {
					code,
					kind: "product",
					product: row.code,
					questions: questions.length,
				},
			},
		};
	});
	if (!out) return { ok: false, error: "noQuestions" };
	revalidatePath(`${PATH}/${parsed.data.productId}`);
	return { ok: true, data: out };
}

// Checkliste abschließen: Score und Rating festhalten. Anders als die
// Gap-Analyse ändert das keinen Control-Status — die Antworten gelten nur für
// dieses Produkt.
async function completeProductChecklistImpl(
	input: unknown,
): Promise<ActionResult<{ score: number | null }>> {
	const c = await requireOrg({ assessment: ["apply"], product: ["update"] });
	const parsed = assessmentIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [a] = await tx
			.select()
			.from(assessments)
			.where(
				and(
					eq(assessments.id, parsed.data.assessmentId),
					eq(assessments.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (
			!a ||
			a.kind !== "product" ||
			a.status === "completed" ||
			a.status === "cancelled"
		)
			return { result: null, audit: [] };
		const rows = await tx
			.select()
			.from(assessmentAnswers)
			.where(eq(assessmentAnswers.assessmentId, a.id));
		const score = scoreAssessment(a.questions, answerStates(a.questions, rows));
		await tx
			.update(assessments)
			.set({
				status: "completed",
				completedAt: new Date(),
				score: score.score,
				rating: score.rating,
				result: { counts: score.counts, bySection: score.bySection },
			})
			.where(eq(assessments.id, a.id));
		return {
			result: { score: score.score },
			audit: {
				action: "assessment.completed",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: {
					status: "completed",
					score: score.score,
					rating: score.rating,
					product: a.subjectId,
				},
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath(PATH, "layout");
	revalidatePath("/gap-analyse", "layout");
	return { ok: true, data: out };
}

export const createProduct = safeAction("createProduct", createProductImpl);
export const updateProduct = safeAction("updateProduct", updateProductImpl);
export const setProductStatus = safeAction(
	"setProductStatus",
	setProductStatusImpl,
);
export const uploadSbom = safeAction("uploadSbom", uploadSbomImpl);
export const startProductChecklist = safeAction(
	"startProductChecklist",
	startProductChecklistImpl,
);
export const completeProductChecklist = safeAction(
	"completeProductChecklist",
	completeProductChecklistImpl,
);
