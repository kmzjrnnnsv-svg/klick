"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	accessTokens,
	assessmentAnswers,
	assessments,
	providers,
	tasks,
} from "@/db/schema";
import { PORTAL_SCOPES } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { scoreAssessment } from "@/lib/assessments/score";
import { answerStates, nextAssessmentCode } from "@/lib/assessments/state";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { SUPPLIER_TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/questionnaires";
import {
	contractClausesFrom,
	dueDiligenceFrom,
	needsFollowUp,
	nextAssessmentDate,
	supplierQuestions,
} from "@/lib/compliance/supplier-assessment";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { sendTransactionalMail } from "@/lib/mail/send";
import { supplierPortalEmail } from "@/lib/mail/templates";
import { notify } from "@/lib/notifications/notify";
import { newToken } from "@/lib/security/tokens";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	completeSupplierAssessmentSchema,
	contractClausesSchema,
	portalLinkSchema,
	reopenSupplierAssessmentSchema,
	startSupplierAssessmentSchema,
} from "@/lib/validation/suppliers";

// Lieferantenbewertung (S6): Fragebogen am Dienstleister starten, Portal-Link
// (ADR-017) erzeugen oder widerrufen, Ergebnis mit Entscheidung abschließen.
// Abschluss schreibt Sorgfaltsprüfung, Wiedervorlage und — bei DORA — die
// Art.-30-Klauseln an den Dienstleister (before/after im Audit).

const PATH = "/dienstleister";

async function loadSupplierAssessment(tx: OrgTx, orgId: string, id: string) {
	const [a] = await tx
		.select()
		.from(assessments)
		.where(
			and(
				eq(assessments.id, id),
				eq(assessments.organizationId, orgId),
				eq(assessments.kind, "supplier"),
			),
		)
		.limit(1);
	return a ?? null;
}

async function loadProvider(tx: OrgTx, orgId: string, id: string) {
	const [p] = await tx
		.select()
		.from(providers)
		.where(and(eq(providers.id, id), eq(providers.organizationId, orgId)))
		.limit(1);
	return p ?? null;
}

async function revokeActiveLinks(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
	userId: string,
): Promise<string[]> {
	const rows = await tx
		.update(accessTokens)
		.set({ revokedAt: new Date(), revokedByUserId: userId })
		.where(
			and(
				eq(accessTokens.organizationId, orgId),
				eq(accessTokens.kind, "supplier_portal"),
				eq(accessTokens.subjectType, "assessment"),
				eq(accessTokens.subjectId, assessmentId),
				isNull(accessTokens.revokedAt),
				gt(accessTokens.expiresAt, new Date()),
			),
		)
		.returning({ prefix: accessTokens.prefix });
	return rows.map((r) => r.prefix);
}

async function startSupplierAssessmentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; existing: boolean }>> {
	const c = await requireOrg({ assessment: ["create"], provider: ["update"] });
	const parsed = startSupplierAssessmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const template = SUPPLIER_TEMPLATE_BY_CODE.get(d.templateCode);
	if (!template) return { ok: false, error: "notFound" };
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await loadProvider(tx, c.orgId, d.providerId);
		if (!p) return { result: null, audit: [] };
		const existing = await tx
			.select({
				id: assessments.id,
				code: assessments.code,
				status: assessments.status,
				subjectId: assessments.subjectId,
				templateCode: assessments.templateCode,
			})
			.from(assessments)
			.where(eq(assessments.organizationId, c.orgId));
		// je Dienstleister und Vorlage höchstens ein laufender Fragebogen
		const running = existing.find(
			(a) =>
				a.subjectId === p.id &&
				a.templateCode === template.code &&
				a.status !== "completed" &&
				a.status !== "cancelled",
		);
		if (running)
			return { result: { id: running.id, existing: true }, audit: [] };
		const questions = supplierQuestions(template, p);
		const code = nextAssessmentCode(
			existing.map((a) => a.code),
			"LB",
			new Date(),
		);
		const [row] = await tx
			.insert(assessments)
			.values({
				organizationId: c.orgId,
				code,
				kind: "supplier",
				subjectType: "provider",
				subjectId: p.id,
				templateCode: template.code,
				templateVersion: template.version,
				title: `${template.title}: ${p.name}`.slice(0, 200),
				frameworks: template.frameworks,
				questions,
				status: "draft",
				ownerUserId: p.ownerUserId ?? c.userId,
				dueAt: d.dueAt ?? null,
				contactName: d.contactName || null,
				contactEmail: d.contactEmail ?? null,
			})
			.returning({ id: assessments.id });
		if (!row) throw new Error("insert failed");
		return {
			result: { id: row.id, existing: false },
			audit: {
				action: "assessment.create",
				target: `assessment:${row.id}`,
				after: {
					code,
					kind: "supplier",
					template: template.code,
					provider: p.id,
					questions: questions.length,
				},
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${d.providerId}`);
	return { ok: true, data: out };
}

// Portal-Link: neuer Token für genau diesen Fragebogen, ältere werden
// widerrufen. Der Klartext steht nur in der Antwort (und ggf. der Mail).
async function createPortalLinkImpl(
	input: unknown,
): Promise<ActionResult<{ url: string; expiresAt: Date; mailed: boolean }>> {
	const c = await requireOrg({ assessment: ["create"], provider: ["update"] });
	const parsed = portalLinkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const t = newToken("supplier_portal");
	const expiresAt = new Date(Date.now() + d.expiresInDays * 86_400_000);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadSupplierAssessment(tx, c.orgId, d.assessmentId);
		if (!a || a.status === "completed" || a.status === "cancelled")
			return { result: null, audit: [] };
		const revoked = await revokeActiveLinks(tx, c.orgId, a.id, c.userId);
		const [row] = await tx
			.insert(accessTokens)
			.values({
				organizationId: c.orgId,
				kind: "supplier_portal",
				name: `Portal ${a.code}`,
				prefix: t.prefix,
				tokenHash: t.hash,
				scopes: [...PORTAL_SCOPES],
				subjectType: "assessment",
				subjectId: a.id,
				createdByUserId: c.userId,
				expiresAt,
			})
			.returning({ id: accessTokens.id });
		if (!row) throw new Error("insert failed");
		if (a.status === "draft")
			await tx
				.update(assessments)
				.set({ status: "in_progress" })
				.where(eq(assessments.id, a.id));
		return {
			result: {
				title: a.title,
				contactName: a.contactName,
				contactEmail: a.contactEmail,
				dueAt: a.dueAt,
			},
			audit: {
				action: "supplier_portal.link_created",
				target: `assessment:${a.id}`,
				after: {
					tokenId: row.id,
					prefix: t.prefix,
					expiresAt,
					revoked,
					mailTo: d.sendMail ? a.contactEmail : null,
				},
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	const url = `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/lieferant#${t.token}`;
	let mailed = false;
	if (d.sendMail && out.contactEmail) {
		const org = await getOrgSummary(c.orgId);
		const mail = supplierPortalEmail({
			url,
			organization: org?.name ?? "Klick",
			questionnaire: out.title,
			contactName: out.contactName,
			expiresAt,
			dueAt: out.dueAt,
		});
		const res = await sendTransactionalMail({ to: out.contactEmail, ...mail });
		mailed = res.ok && res.path !== "console";
		if (!res.ok)
			logger.warn(
				{ assessmentId: d.assessmentId, path: res.path },
				"supplier portal mail failed",
			);
	}
	revalidatePath(PATH, "layout");
	return { ok: true, data: { url, expiresAt, mailed } };
}

async function revokePortalLinksImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["create"], provider: ["update"] });
	const parsed = portalLinkSchema.pick({ assessmentId: true }).safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadSupplierAssessment(
			tx,
			c.orgId,
			parsed.data.assessmentId,
		);
		if (!a) return { result: false, audit: [] };
		const revoked = await revokeActiveLinks(tx, c.orgId, a.id, c.userId);
		return {
			result: true,
			audit: {
				action: "supplier_portal.link_revoked",
				target: `assessment:${a.id}`,
				after: { revoked },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

// Zur Nachbesserung zurückgeben: Lieferant kann wieder antworten (solange
// sein Link gilt); der Grund steht im Audit und am Fragebogen.
async function reopenSupplierAssessmentImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ assessment: ["review"] });
	const parsed = reopenSupplierAssessmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadSupplierAssessment(tx, c.orgId, d.assessmentId);
		if (!a || (a.status !== "submitted" && a.status !== "in_review"))
			return { result: false, audit: [] };
		await tx
			.update(assessments)
			.set({
				status: "in_progress",
				result: { ...(a.result ?? {}), reopenNote: d.note },
			})
			.where(eq(assessments.id, a.id));
		return {
			result: true,
			audit: {
				action: "assessment.reopen",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: { status: "in_progress", note: d.note },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/gap-analyse", "layout");
	return { ok: true, data: undefined };
}

const DECISION_LABEL = {
	accept: "Freigegeben",
	accept_with_conditions: "Freigegeben mit Auflagen",
	reject: "Abgelehnt",
} as const;

// Abschluss mit Entscheidung: Score/Rating festhalten, Dienstleister
// aktualisieren (Sorgfaltsprüfung, letzte/nächste Bewertung, Klauseln),
// Portal-Links widerrufen, bei Auflagen/Ablehnung/C/D eine Folgeaufgabe.
async function completeSupplierAssessmentImpl(
	input: unknown,
): Promise<ActionResult<{ rating: string | null; taskId: string | null }>> {
	const c = await requireOrg({ assessment: ["apply"], provider: ["update"] });
	const parsed = completeSupplierAssessmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const a = await loadSupplierAssessment(tx, c.orgId, d.assessmentId);
		if (!a?.subjectId || a.status === "completed" || a.status === "cancelled")
			return { result: null, audit: [] };
		const p = await loadProvider(tx, c.orgId, a.subjectId);
		if (!p) return { result: null, audit: [] };
		const rows = await tx
			.select()
			.from(assessmentAnswers)
			.where(eq(assessmentAnswers.assessmentId, a.id));
		const states = answerStates(a.questions, rows);
		const score = scoreAssessment(a.questions, states);
		const now = new Date();
		const dueDiligence = dueDiligenceFrom({
			assessmentId: a.id,
			code: a.code,
			template: a.templateCode,
			score: score.score,
			rating: score.rating,
			knockouts: score.knockouts,
			decision: d.decision,
			decisionNote: d.decisionNote || null,
			completedAt: now,
		});
		const hasClauses = a.questions.some((q) => q.mapsTo?.art30?.length);
		const contractClauses = hasClauses
			? contractClausesFrom(a.questions, states, p.contractClauses)
			: p.contractClauses;
		const nextAt = nextAssessmentDate(p.criticality, score.rating, now);
		const today = now.toISOString().slice(0, 10);
		await tx
			.update(assessments)
			.set({
				status: "completed",
				completedAt: now,
				score: score.score,
				rating: score.rating,
				decision: d.decision,
				decisionNote: d.decisionNote || null,
				reviewerUserId: a.reviewerUserId ?? c.userId,
				result: {
					counts: score.counts,
					bySection: score.bySection,
					knockouts: score.knockouts,
				},
			})
			.where(eq(assessments.id, a.id));
		await tx
			.update(providers)
			.set({
				dueDiligence,
				contractClauses,
				lastAssessmentAt: today,
				nextAssessmentAt: nextAt,
			})
			.where(eq(providers.id, p.id));
		const revoked = await revokeActiveLinks(tx, c.orgId, a.id, c.userId);
		let taskId: string | null = null;
		if (needsFollowUp(score.rating, d.decision)) {
			const title =
				d.decision === "reject"
					? `Ablehnung umsetzen: ${p.name} (${a.code})`
					: `Auflagen nachhalten: ${p.name} (${a.code})`;
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: c.orgId,
					title: title.slice(0, 200),
					description: [
						`Lieferantenbewertung ${a.code}: ${DECISION_LABEL[d.decision]}, Rating ${score.rating ?? "—"} (${score.score ?? "—"} %).`,
						score.knockouts.length > 0
							? `K.-o.-Fragen nicht erfüllt: ${score.knockouts.join(", ")}.`
							: null,
						d.decisionNote ? `Begründung: ${d.decisionNote}` : null,
						d.decision === "reject"
							? "Nächste Schritte: Ausstiegsplan prüfen, Alternativen bewerten, Vertrag/Kündigung klären."
							: "Nächste Schritte: Auflagen mit dem Lieferanten vereinbaren und Umsetzung belegen.",
					]
						.filter(Boolean)
						.join("\n"),
					assigneeUserId: p.ownerUserId ?? c.userId,
					createdByUserId: c.userId,
					priority:
						d.decision === "reject" || score.rating === "D" ? "high" : "normal",
					dueAt: new Date(now.getTime() + 30 * 86_400_000)
						.toISOString()
						.slice(0, 10),
					entityType: "provider",
					entityId: p.id,
					sourceKind: "assessment",
				})
				.returning({ id: tasks.id });
			taskId = task?.id ?? null;
			if (p.ownerUserId)
				await notify(tx, {
					orgId: c.orgId,
					recipients: [p.ownerUserId],
					actorUserId: c.userId,
					kind: "task_assigned",
					title,
					link: `${PATH}/${p.id}?tab=bewertungen`,
				});
		}
		const audits: AuditInput[] = [
			{
				action: "provider.update",
				target: `provider:${p.id}`,
				before: {
					dueDiligence: p.dueDiligence,
					contractClauses: p.contractClauses,
					lastAssessmentAt: p.lastAssessmentAt,
					nextAssessmentAt: p.nextAssessmentAt,
				},
				after: {
					dueDiligence,
					contractClauses,
					lastAssessmentAt: today,
					nextAssessmentAt: nextAt,
					via: `assessment:${a.code}`,
				},
			},
			{
				action: "assessment.completed",
				target: `assessment:${a.id}`,
				before: { status: a.status },
				after: {
					status: "completed",
					score: score.score,
					rating: score.rating,
					decision: d.decision,
					followUpTaskId: taskId,
					revokedLinks: revoked,
				},
			},
		];
		return { result: { rating: score.rating, taskId }, audit: audits };
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath(PATH, "layout");
	revalidatePath("/gap-analyse", "layout");
	return { ok: true, data: out };
}

// Klausel-Checkliste DORA Art. 30 von Hand pflegen (Vertragsprüfung).
async function updateContractClausesImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = contractClausesSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await loadProvider(tx, c.orgId, d.providerId);
		if (!p) return { result: false, audit: [] };
		const next: Record<string, boolean | string> = {
			...(p.contractClauses ?? {}),
		};
		for (const [k, v] of Object.entries(d.clauses)) {
			if (v === null) delete next[k];
			else next[k] = v;
		}
		await tx
			.update(providers)
			.set({ contractClauses: next })
			.where(eq(providers.id, p.id));
		return {
			result: true,
			audit: {
				action: "provider.update",
				target: `provider:${p.id}`,
				before: { contractClauses: p.contractClauses },
				after: { contractClauses: next },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${d.providerId}`);
	return { ok: true, data: undefined };
}

export const startSupplierAssessment = safeAction(
	"startSupplierAssessment",
	startSupplierAssessmentImpl,
);
export const createPortalLink = safeAction(
	"createPortalLink",
	createPortalLinkImpl,
);
export const revokePortalLinks = safeAction(
	"revokePortalLinks",
	revokePortalLinksImpl,
);
export const reopenSupplierAssessment = safeAction(
	"reopenSupplierAssessment",
	reopenSupplierAssessmentImpl,
);
export const completeSupplierAssessment = safeAction(
	"completeSupplierAssessment",
	completeSupplierAssessmentImpl,
);
export const updateContractClauses = safeAction(
	"updateContractClauses",
	updateContractClausesImpl,
);
