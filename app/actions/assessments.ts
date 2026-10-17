"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	assessmentAnswers,
	assessments,
	controlImplementations,
	controls,
	evidence,
	tasks,
} from "@/db/schema";
import type { ImplStatus } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { applyChanges, proposeControlStatus } from "@/lib/assessments/apply";
import {
	CATALOG_TEMPLATE,
	catalogQuestions,
} from "@/lib/assessments/catalog-template";
import { scoreAssessment } from "@/lib/assessments/score";
import { answerStates, nextAssessmentCode } from "@/lib/assessments/state";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { getOrgProfile, loadApplicability } from "@/lib/compliance/queries";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
import {
	answerQuestionSchema,
	assessmentIdSchema,
	createAssessmentSchema,
	createMeasuresSchema,
	delegateQuestionSchema,
	linkAnswerEvidenceSchema,
	reviewAnswerSchema,
} from "@/lib/validation/assessments";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Geführte Gap-Analyse: Fragebogen (eine Frage je Control) → Antworten mit
// Dokumenten → Bewertung → Ergebnis in den Control-Status übernehmen →
// Maßnahmen als Aufgaben. Jede Mutation: requireOrg → mutateOrg → Audit.

const PATH = "/gap-analyse";

async function loadAssessment(tx: OrgTx, orgId: string, id: string) {
	const [a] = await tx
		.select()
		.from(assessments)
		.where(and(eq(assessments.id, id), eq(assessments.organizationId, orgId)))
		.limit(1);
	return a ?? null;
}

async function implementationIds(
	tx: OrgTx,
	orgId: string,
	codes: readonly string[],
): Promise<Map<string, { id: string; status: ImplStatus }>> {
	if (codes.length === 0) return new Map();
	const rows = await tx
		.select({
			id: controlImplementations.id,
			status: controlImplementations.status,
			code: controls.code,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				inArray(controls.code, [...codes]),
			),
		);
	return new Map(rows.map((r) => [r.code, { id: r.id, status: r.status }]));
}

async function createAssessmentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; questions: number }>> {
	const c = await requireOrg({ assessment: ["create"] });
	const parsed = createAssessmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await getOrgProfile(tx, c.orgId);
		if (!p) return { result: null, audit: [] };
		const frameworks = (d.frameworks ?? p.frameworks).filter((s) =>
			p.frameworks.includes(s),
		);
		if (frameworks.length === 0) return { result: null, audit: [] };
		const manual = new Map<string, boolean>();
		for (const [k, v] of await loadApplicability(tx, c.orgId))
			if (v.source === "manual") manual.set(k, v.applicable);
		const existing = await tx
			.select({
				code: assessments.code,
				kind: assessments.kind,
				status: assessments.status,
				questions: assessments.questions,
			})
			.from(assessments)
			.where(eq(assessments.organizationId, c.orgId));
		// Nur Neues: Controls, die keine frühere Gap-Analyse abgefragt hat.
		let onlyControls: Set<string> | undefined;
		if (d.onlyNew) {
			const asked = new Set(
				existing
					.filter((x) => x.kind === "self" && x.status !== "cancelled")
					.flatMap((x) => x.questions.map((q) => q.code)),
			);
			const all = catalogQuestions({
				sector: p.profile.sector,
				licenceStage: p.profile.licenceStage,
				caspServices: p.profile.caspServices,
				frameworks,
				tlptDesignated: p.profile.tlptDesignated,
				issuesTokens: p.profile.issuesTokens,
				productRoles: p.profile.productRoles,
				asOf: d.asOf ? new Date(`${d.asOf}T12:00:00Z`) : undefined,
				manual,
			});
			onlyControls = new Set(
				all.map((q) => q.code).filter((code) => !asked.has(code)),
			);
		}
		const questions = catalogQuestions({
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			frameworks,
			tlptDesignated: p.profile.tlptDesignated,
			issuesTokens: p.profile.issuesTokens,
			productRoles: p.profile.productRoles,
			asOf: d.asOf ? new Date(`${d.asOf}T12:00:00Z`) : undefined,
			manual,
			onlyControls,
		});
		if (questions.length === 0) return { result: null, audit: [] };
		const code = nextAssessmentCode(
			existing.map((x) => x.code),
			"GA",
			new Date(),
		);
		const [row] = await tx
			.insert(assessments)
			.values({
				organizationId: c.orgId,
				code,
				kind: "self",
				templateCode: CATALOG_TEMPLATE,
				title: d.title || `Gap-Analyse ${code}`,
				frameworks,
				asOf: d.asOf ?? null,
				questions,
				status: "in_progress",
				ownerUserId: c.userId,
			})
			.returning({ id: assessments.id });
		if (!row) throw new Error("insert failed");
		return {
			result: { id: row.id, questions: questions.length },
			audit: {
				action: "assessment.create",
				target: `assessment:${row.id}`,
				after: { code, frameworks, questions: questions.length },
			},
		};
	});
	if (!out) return { ok: false, error: "noQuestions" };
	revalidatePath(PATH);
	return { ok: true, data: out };
}

async function answerQuestionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["answer"] });
	const parsed = answerQuestionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, d.assessmentId);
		if (
			!a ||
			a.status === "completed" ||
			a.status === "cancelled" ||
			!a.questions.some((q) => q.code === d.questionCode)
		)
			return { result: false, audit: [] };
		const values = {
			answer: d.answer,
			comment: d.comment ?? null,
			naReason: d.answer === "na" ? (d.naReason ?? null) : null,
			answeredByUserId: c.userId,
		};
		await tx
			.insert(assessmentAnswers)
			.values({
				organizationId: c.orgId,
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
				after: { question: d.questionCode, answer: d.answer },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	return { ok: true, data: undefined };
}

// Dokument direkt an der Frage hochladen: gemeinsame Pipeline (DLP, clamd,
// Verschlüsselung), Verknüpfung mit dem Control und der Antwort.
async function uploadAnswerEvidenceImpl(
	formData: FormData,
): Promise<
	ActionResult<{ id: string; classification: string; dlpRaised: boolean }>
> {
	const c = await requireOrg({ assessment: ["answer"], evidence: ["create"] });
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	const assessmentId = String(formData.get("assessmentId") ?? "");
	const questionCode = String(formData.get("questionCode") ?? "");
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!/^[0-9a-f-]{36}$/i.test(assessmentId) || !questionCode)
		return { ok: false, error: "notFound" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const declared = "internal" as const;
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: declared,
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, assessmentId);
		const q = a?.questions.find((x) => x.code === questionCode);
		if (!a || !q || a.status === "completed" || a.status === "cancelled")
			return { result: null, audit: [] };
		const stored = await storeEncryptedEvidence(tx, {
			orgId: c.orgId,
			bytes,
			safeName: v.safeName,
			mime: v.mime,
			title: file.name.slice(0, 200),
			description: `Gap-Analyse ${a.code}: ${q.text}`.slice(0, 2000),
			type: "document",
			classification: v.classification,
			createdByUserId: c.userId,
			source: "assessment",
			dlp: v.dlp,
		});
		// Produktcheckliste: Nachweis zählt für das tragende Control (mapsTo)
		const control = q.controlCode ?? q.mapsTo?.control;
		if (control) {
			const impl = (await implementationIds(tx, c.orgId, [control])).get(
				control,
			);
			if (impl) await linkEvidenceToControl(tx, c.orgId, impl.id, stored.id);
		}
		await appendEvidence(tx, c.orgId, a.id, questionCode, stored.id, c.userId);
		return {
			result: stored.id,
			audit: {
				action: "evidence.upload",
				target: `evidence:${stored.id}`,
				after: {
					fileName: v.safeName,
					size: bytes.byteLength,
					assessment: a.code,
					question: questionCode,
					classification: v.classification,
					dlp: { action: v.dlp.action, findings: v.dlp.findings },
				},
			},
		};
	});
	if (!id) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${assessmentId}`);
	return {
		ok: true,
		data: {
			id,
			classification: v.classification,
			dlpRaised: v.classification !== declared,
		},
	};
}

async function appendEvidence(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
	questionCode: string,
	evidenceId: string,
	userId: string,
) {
	const [row] = await tx
		.select({ id: assessmentAnswers.id, ids: assessmentAnswers.evidenceIds })
		.from(assessmentAnswers)
		.where(
			and(
				eq(assessmentAnswers.assessmentId, assessmentId),
				eq(assessmentAnswers.questionCode, questionCode),
			),
		)
		.limit(1);
	if (row) {
		if (row.ids.includes(evidenceId)) return;
		await tx
			.update(assessmentAnswers)
			.set({ evidenceIds: [...row.ids, evidenceId] })
			.where(eq(assessmentAnswers.id, row.id));
	} else {
		await tx.insert(assessmentAnswers).values({
			organizationId: orgId,
			assessmentId,
			questionCode,
			evidenceIds: [evidenceId],
			answeredByUserId: userId,
		});
	}
}

async function linkAnswerEvidenceImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["answer"] });
	const parsed = linkAnswerEvidenceSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, d.assessmentId);
		const q = a?.questions.find((x) => x.code === d.questionCode);
		const [ev] = await tx
			.select({ id: evidence.id })
			.from(evidence)
			.where(
				and(
					eq(evidence.id, d.evidenceId),
					eq(evidence.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!a || !q || !ev) return { result: false, audit: [] };
		const control = q.controlCode ?? q.mapsTo?.control;
		if (control) {
			const impl = (await implementationIds(tx, c.orgId, [control])).get(
				control,
			);
			if (impl) await linkEvidenceToControl(tx, c.orgId, impl.id, ev.id);
		}
		await appendEvidence(tx, c.orgId, a.id, d.questionCode, ev.id, c.userId);
		return {
			result: true,
			audit: {
				action: "assessment.evidence_linked",
				target: `assessment:${a.id}`,
				after: { question: d.questionCode, evidenceId: ev.id },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${d.assessmentId}`);
	return { ok: true, data: undefined };
}

// Frage an eine Kollegin/einen Kollegen weitergeben → Aufgabe mit Deep-Link.
async function delegateQuestionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["answer"], task: ["create"] });
	const parsed = delegateQuestionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, d.assessmentId);
		const q = a?.questions.find((x) => x.code === d.questionCode);
		if (!a || !q) return { result: false, audit: [] };
		const link = `${PATH}/${a.id}?schritt=fragen&kapitel=${q.sectionCode}#q-${q.code}`;
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: c.orgId,
				title: `Gap-Analyse ${a.code}: ${q.text}`.slice(0, 200),
				description: `Bitte beantworte die Frage und lade vorhandene Dokumente hoch: ${link}`,
				assigneeUserId: d.assigneeUserId,
				createdByUserId: c.userId,
				dueAt: d.dueAt ?? a.dueAt ?? null,
				priority: "normal",
				entityType: "assessment",
				entityId: a.id,
				sourceKind: "assessment",
			})
			.returning({ id: tasks.id });
		await notify(tx, {
			orgId: c.orgId,
			recipients: [d.assigneeUserId],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `Frage zur Gap-Analyse: ${q.text}`,
			link,
		});
		return {
			result: true,
			audit: {
				action: "assessment.delegate",
				target: `assessment:${a.id}`,
				after: {
					question: d.questionCode,
					assigneeUserId: d.assigneeUserId,
					taskId: task?.id ?? null,
				},
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	return { ok: true, data: undefined };
}

async function reviewAnswerImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["review"] });
	const parsed = reviewAnswerSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, d.assessmentId);
		if (
			!a ||
			a.status === "completed" ||
			a.status === "cancelled" ||
			!a.questions.some((q) => q.code === d.questionCode)
		)
			return { result: false, audit: [] };
		const values = {
			reviewerVerdict: d.verdict,
			reviewerAnswer:
				d.verdict === "adjusted" ? (d.reviewerAnswer ?? null) : null,
			reviewerNote: d.note ?? null,
			reviewedByUserId: c.userId,
			reviewedAt: new Date(),
		};
		await tx
			.insert(assessmentAnswers)
			.values({
				organizationId: c.orgId,
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
		if (a.status === "in_progress" || a.status === "submitted")
			await tx
				.update(assessments)
				.set({ status: "in_review", reviewerUserId: c.userId })
				.where(eq(assessments.id, a.id));
		return {
			result: true,
			audit: {
				action: "assessment.review",
				target: `assessment:${a.id}`,
				after: {
					question: d.questionCode,
					verdict: d.verdict,
					reviewerAnswer: values.reviewerAnswer,
				},
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${d.assessmentId}`);
	return { ok: true, data: undefined };
}

async function submitAssessmentImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["answer"] });
	const parsed = assessmentIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, parsed.data.assessmentId);
		if (!a || a.status === "completed" || a.status === "cancelled")
			return { result: false, audit: [] };
		await tx
			.update(assessments)
			.set({ status: "submitted", submittedAt: new Date() })
			.where(eq(assessments.id, a.id));
		return {
			result: true,
			audit: {
				action: "assessment.submit",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: { status: "submitted" },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${parsed.data.assessmentId}`);
	return { ok: true, data: undefined };
}

// Ergebnis übernehmen: Antworten (nach Bewertung) setzen den Control-Status
// in einer Transaktion. Das ist eine Neubewertung wie im Onboarding — der
// Fragebogen ist die Begründung; jede Änderung steht mit before/after im
// Audit. Status-Schnappschuss (Score, Rating) wird am Fragebogen gespeichert.
async function applyAssessmentResultsImpl(
	input: unknown,
): Promise<ActionResult<{ changed: number }>> {
	const c = await requireOrg({ assessment: ["apply"], control: ["update"] });
	const parsed = assessmentIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, parsed.data.assessmentId);
		if (!a || a.kind !== "self" || a.status === "cancelled")
			return { result: null, audit: [] };
		const rows = await tx
			.select()
			.from(assessmentAnswers)
			.where(eq(assessmentAnswers.assessmentId, a.id));
		const codes = a.questions
			.map((q) => q.controlCode)
			.filter((x): x is string => Boolean(x));
		const impls = await implementationIds(tx, c.orgId, codes);
		const current = new Map(
			[...impls].map(([code, v]) => [code, v.status] as const),
		);
		const states = answerStates(a.questions, rows);
		const changes = proposeControlStatus(a.questions, states, current);
		const audits: AuditInput[] = [];
		for (const ch of changes) {
			const impl = impls.get(ch.controlCode);
			if (!impl) continue;
			await tx
				.update(controlImplementations)
				.set({
					status: ch.to,
					source: "manual",
					implementedAt: ch.to === "implemented" ? new Date() : null,
					...(ch.to === "not_applicable" && ch.naReason
						? { note: ch.naReason }
						: {}),
				})
				.where(eq(controlImplementations.id, impl.id));
			audits.push({
				action: "control.status",
				target: `control:${impl.id}`,
				before: { status: ch.from },
				after: { status: ch.to, via: `assessment:${a.code}` },
			});
		}
		const score = scoreAssessment(a.questions, states);
		await tx
			.update(assessments)
			.set({
				status: "completed",
				completedAt: new Date(),
				appliedAt: new Date(),
				appliedByUserId: c.userId,
				score: score.score,
				rating: score.rating,
				result: {
					counts: score.counts,
					bySection: score.bySection,
					changes: changes.length,
					statusAfter: Object.fromEntries(applyChanges(current, changes)),
				},
			})
			.where(eq(assessments.id, a.id));
		audits.push({
			action: "assessment.apply",
			target: `assessment:${a.id}`,
			before: { status: a.status },
			after: {
				status: "completed",
				score: score.score,
				changes: changes.map((x) => `${x.controlCode}:${x.from}→${x.to}`),
			},
		});
		return { result: { changed: changes.length }, audit: audits };
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath("/", "layout");
	return { ok: true, data: out };
}

const MEASURE_TITLE = {
	implement: "Umsetzen",
	clarify: "Klären",
	evidence: "Nachweis hinterlegen",
} as const;

// Produktcheckliste und Lieferantenbewertung: Maßnahmen als Aufgaben am
// Produkt bzw. Dienstleister (nicht am Control), je Frage; offene Aufgaben
// mit gleichem Titel werden nicht doppelt angelegt.
async function subjectMeasureTasks(
	tx: OrgTx,
	c: { orgId: string; userId: string },
	a: typeof assessments.$inferSelect,
	d: {
		items: { controlCode: string; kind: keyof typeof MEASURE_TITLE }[];
		assigneeUserId?: string | null;
		dueAt?: string | null;
	},
): Promise<number> {
	const subjectId = a.subjectId as string;
	const entityType = a.kind === "supplier" ? "provider" : "product";
	const source =
		a.kind === "supplier" ? "Lieferantenbewertung" : "CRA-Checkliste";
	const byCode = new Map(a.questions.map((q) => [q.code, q]));
	const open = await tx
		.select({ title: tasks.title })
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, c.orgId),
				eq(tasks.entityType, entityType),
				eq(tasks.entityId, subjectId),
				ne(tasks.status, "done"),
			),
		);
	const openTitles = new Set(open.map((o) => o.title));
	let created = 0;
	for (const item of d.items) {
		const q = byCode.get(item.controlCode);
		if (!q) continue;
		const title = `${MEASURE_TITLE[item.kind]}: ${q.text}`.slice(0, 200);
		if (openTitles.has(title)) continue;
		await tx.insert(tasks).values({
			organizationId: c.orgId,
			title,
			description: [
				`Aus ${source} ${a.code} (${q.mapsTo?.requirement ?? q.code}).`,
				q.evidenceHints?.length
					? `Nachweise: ${q.evidenceHints.join(", ")}`
					: null,
			]
				.filter(Boolean)
				.join("\n"),
			assigneeUserId: d.assigneeUserId ?? c.userId,
			createdByUserId: c.userId,
			dueAt: d.dueAt ?? null,
			priority: q.critical || item.kind === "implement" ? "high" : "normal",
			entityType,
			entityId: subjectId,
			sourceKind: "assessment",
		});
		openTitles.add(title);
		created += 1;
	}
	return created;
}

// Maßnahmen aus der Gap-Analyse als Aufgaben am Control (Herkunft
// "assessment"), Empfehlung aus dem Katalog in der Beschreibung.
async function createMeasuresImpl(
	input: unknown,
): Promise<ActionResult<{ created: number }>> {
	const c = await requireOrg({ assessment: ["read"], task: ["create"] });
	const parsed = createMeasuresSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, d.assessmentId);
		if (!a) return { result: null, audit: [] };
		if ((a.kind === "product" || a.kind === "supplier") && a.subjectId) {
			const created = await subjectMeasureTasks(tx, c, a, d);
			return {
				result: { created },
				audit: {
					action: "assessment.measures",
					target: `assessment:${a.id}`,
					after: {
						created,
						items: d.items.map((i) => `${i.kind}:${i.controlCode}`),
					},
				},
			};
		}
		const impls = await implementationIds(
			tx,
			c.orgId,
			d.items.map((i) => i.controlCode),
		);
		// keine Doppelten: offene Aufgaben aus diesem Fragebogen je Control
		const open = await tx
			.select({ entityId: tasks.entityId, title: tasks.title })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, c.orgId),
					eq(tasks.sourceKind, "assessment"),
					eq(tasks.entityType, "control"),
					ne(tasks.status, "done"),
				),
			);
		const openKeys = new Set(open.map((o) => `${o.entityId}:${o.title}`));
		let created = 0;
		for (const item of d.items) {
			const impl = impls.get(item.controlCode);
			const meta = CONTROL_BY_CODE.get(item.controlCode);
			if (!impl || !meta) continue;
			const title =
				`${MEASURE_TITLE[item.kind]}: ${item.controlCode} ${meta.title}`.slice(
					0,
					200,
				);
			if (openKeys.has(`${impl.id}:${title}`)) continue;
			const rec =
				meta.recommendations?.find((r) => r.level === "must")?.text ??
				meta.recommendations?.[0]?.text;
			await tx.insert(tasks).values({
				organizationId: c.orgId,
				title,
				description: [
					`Aus Gap-Analyse ${a.code}.`,
					rec ? `Empfehlung: ${rec}` : null,
					meta.evidenceHints?.length
						? `Nachweise: ${meta.evidenceHints.join(", ")}`
						: null,
				]
					.filter(Boolean)
					.join("\n"),
				assigneeUserId: d.assigneeUserId ?? c.userId,
				createdByUserId: c.userId,
				dueAt: d.dueAt ?? null,
				priority: item.kind === "implement" ? "high" : "normal",
				entityType: "control",
				entityId: impl.id,
				sourceKind: "assessment",
			});
			created += 1;
		}
		if (created > 0 && d.assigneeUserId)
			await notify(tx, {
				orgId: c.orgId,
				recipients: [d.assigneeUserId],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `${created} Maßnahmen aus der Gap-Analyse ${a.code}`,
				link: "/heute/aufgaben",
			});
		return {
			result: { created },
			audit: {
				action: "assessment.measures",
				target: `assessment:${a.id}`,
				after: {
					created,
					items: d.items.map((i) => `${i.kind}:${i.controlCode}`),
				},
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath("/heute/aufgaben");
	revalidatePath(`${PATH}/${d.assessmentId}`);
	return { ok: true, data: out };
}

// Wiederholung (z. B. jährlich): aktueller Katalog, Antworten und Nachweise
// der Vorlage vorbefüllt — nur Bestätigen und Abweichungen ändern.
async function cloneAssessmentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ assessment: ["create"] });
	const parsed = assessmentIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const src = await loadAssessment(tx, c.orgId, parsed.data.assessmentId);
		const p = await getOrgProfile(tx, c.orgId);
		if (!src || !p || src.kind !== "self") return { result: null, audit: [] };
		const manual = new Map<string, boolean>();
		for (const [k, v] of await loadApplicability(tx, c.orgId))
			if (v.source === "manual") manual.set(k, v.applicable);
		const frameworks = src.frameworks.filter((s) => p.frameworks.includes(s));
		const questions = catalogQuestions({
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			frameworks: frameworks.length > 0 ? frameworks : p.frameworks,
			tlptDesignated: p.profile.tlptDesignated,
			issuesTokens: p.profile.issuesTokens,
			productRoles: p.profile.productRoles,
			manual,
		});
		const existing = await tx
			.select({ code: assessments.code })
			.from(assessments)
			.where(eq(assessments.organizationId, c.orgId));
		const code = nextAssessmentCode(
			existing.map((x) => x.code),
			"GA",
			new Date(),
		);
		const [row] = await tx
			.insert(assessments)
			.values({
				organizationId: c.orgId,
				code,
				kind: "self",
				templateCode: CATALOG_TEMPLATE,
				title: `Gap-Analyse ${code}`,
				frameworks: frameworks.length > 0 ? frameworks : p.frameworks,
				questions,
				status: "in_progress",
				ownerUserId: c.userId,
			})
			.returning({ id: assessments.id });
		if (!row) throw new Error("insert failed");
		const prev = await tx
			.select()
			.from(assessmentAnswers)
			.where(eq(assessmentAnswers.assessmentId, src.id));
		const codes = new Set(questions.map((q) => q.code));
		const carry = prev.filter((x) => codes.has(x.questionCode));
		if (carry.length > 0)
			await tx.insert(assessmentAnswers).values(
				carry.map((x) => ({
					organizationId: c.orgId,
					assessmentId: row.id,
					questionCode: x.questionCode,
					answer: x.reviewerAnswer ?? x.answer,
					naReason: x.naReason,
					comment: x.comment,
					evidenceIds: x.evidenceIds,
					answeredByUserId: x.answeredByUserId,
				})),
			);
		return {
			result: row.id,
			audit: {
				action: "assessment.clone",
				target: `assessment:${row.id}`,
				after: { code, from: src.code, carried: carry.length },
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: { id: out } };
}

async function cancelAssessmentImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["create"] });
	const parsed = assessmentIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadAssessment(tx, c.orgId, parsed.data.assessmentId);
		if (!a || a.status === "completed") return { result: false, audit: [] };
		await tx
			.update(assessments)
			.set({ status: "cancelled" })
			.where(eq(assessments.id, a.id));
		return {
			result: true,
			audit: {
				action: "assessment.cancel",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: { status: "cancelled" },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const createAssessment = safeAction(
	"createAssessment",
	createAssessmentImpl,
);
export const answerQuestion = safeAction("answerQuestion", answerQuestionImpl);
export const uploadAnswerEvidence = safeAction(
	"uploadAnswerEvidence",
	uploadAnswerEvidenceImpl,
);
export const linkAnswerEvidence = safeAction(
	"linkAnswerEvidence",
	linkAnswerEvidenceImpl,
);
export const delegateQuestion = safeAction(
	"delegateQuestion",
	delegateQuestionImpl,
);
export const reviewAnswer = safeAction("reviewAnswer", reviewAnswerImpl);
export const submitAssessment = safeAction(
	"submitAssessment",
	submitAssessmentImpl,
);
export const applyAssessmentResults = safeAction(
	"applyAssessmentResults",
	applyAssessmentResultsImpl,
);
export const createMeasures = safeAction("createMeasures", createMeasuresImpl);
export const cloneAssessment = safeAction(
	"cloneAssessment",
	cloneAssessmentImpl,
);
export const cancelAssessment = safeAction(
	"cancelAssessment",
	cancelAssessmentImpl,
);
