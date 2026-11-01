import { createHash } from "node:crypto";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import {
	approvalDecisions,
	approvalRequests,
	approvalWorkflows,
	assessmentAnswers,
	assessments,
	controlImplementations,
	controls,
	orgSettings,
} from "@/db/schema";
import {
	ensureOrgWorkflows,
	type GateResult,
	gateApproval,
} from "@/lib/approvals/service";
import { triggerOf } from "@/lib/approvals/triggers";
import type { AuditInput } from "@/lib/audit";
import { excludeRequirements } from "@/lib/compliance/exclusion-service";
import {
	exclusionAllowedForKey,
	type NaImpact,
	naImpact,
} from "@/lib/compliance/exclusions";
import { loadOrgCatalog } from "@/lib/compliance/org-catalog-server";
import {
	loadApplicability,
	orgCoverage,
	userNames,
} from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { proposeExclusions } from "./apply";
import { type NaConfirmation, naDropsControl, naImpactOf } from "./na";
import { answerStates } from "./state";

export type { NaConfirmation };

// „Nicht relevant“ in der Gap-Analyse wirkt erst bestätigt: Eine zweite
// Person (Standard: Geschäftsleitung, im Freigabe-Designer änderbar)
// bestätigt die Begründung, bevor beim Übernehmen eine Maßnahme entfällt
// oder eine Anforderung ausgeschlossen wird.
//
// Der Antrag hängt an der Umsetzung des Controls (entityType "control",
// entityId = control_implementations.id) — so sieht die Geschäftsleitung im
// Posteingang die Maßnahme. Welche Gap-Analyse, Frage und Begründung er
// bestätigt, steht in entityVersionRef; eine geänderte Begründung braucht
// eine neue Bestätigung.

export const NA_TRIGGER = "control.not_applicable";

export function naVersionRef(
	assessmentId: string,
	questionCode: string,
	reason: string,
): string {
	const h = createHash("sha256").update(reason.trim()).digest("hex");
	return `na:${assessmentId}:${questionCode}:${h.slice(0, 16)}`;
}

function refPrefix(assessmentId: string, questionCode: string): string {
	return `na:${assessmentId}:${questionCode}:`;
}

// Ist der Ablauf in der Org aktiv? Ohne aktiven Ablauf (im Designer
// abgeschaltet) wirkt „Nicht relevant“ wie zuvor ohne Bestätigung
export async function naWorkflowActive(
	tx: OrgTx,
	orgId: string,
): Promise<boolean> {
	const rows = await tx
		.select({
			kind: approvalWorkflows.kind,
			trigger: approvalWorkflows.trigger,
			enabled: approvalWorkflows.enabled,
		})
		.from(approvalWorkflows)
		.where(eq(approvalWorkflows.organizationId, orgId));
	return rows.some((w) => w.enabled && triggerOf(w) === NA_TRIGGER);
}

// Stand je Frage für die Antworten „nicht relevant“ einer Gap-Analyse
export async function naConfirmations(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
	answers: readonly {
		questionCode: string;
		answer: string | null;
		naReason: string | null;
	}[],
): Promise<Map<string, NaConfirmation>> {
	const out = new Map<string, NaConfirmation>();
	const na = answers.filter((a) => a.answer === "na");
	if (na.length === 0) return out;
	if (!(await naWorkflowActive(tx, orgId))) {
		for (const a of na)
			out.set(a.questionCode, { status: "confirmed", by: null, at: null });
		return out;
	}
	const reqs = await tx
		.select({
			id: approvalRequests.id,
			ref: approvalRequests.entityVersionRef,
			status: approvalRequests.status,
			decidedAt: approvalRequests.decidedAt,
		})
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, "control"),
				like(approvalRequests.entityVersionRef, `na:${assessmentId}:%`),
			),
		)
		.orderBy(desc(approvalRequests.requestedAt));
	const ids = reqs.map((r) => r.id);
	const decisions =
		ids.length === 0
			? []
			: await tx
					.select({
						requestId: approvalDecisions.requestId,
						userId: approvalDecisions.approverUserId,
						decision: approvalDecisions.decision,
						note: approvalDecisions.note,
						at: approvalDecisions.decidedAt,
					})
					.from(approvalDecisions)
					.where(
						and(
							eq(approvalDecisions.organizationId, orgId),
							inArray(approvalDecisions.requestId, ids),
						),
					)
					.orderBy(desc(approvalDecisions.decidedAt));
	const names = await userNames(
		tx,
		decisions.map((d) => d.userId),
	);
	const lastDecision = (requestId: string) =>
		decisions.find((d) => d.requestId === requestId);
	for (const a of na) {
		const ref = naVersionRef(assessmentId, a.questionCode, a.naReason ?? "");
		// jüngster Antrag genau dieser Begründung (zurückgezogene zählen nicht)
		const r = reqs.find(
			(x) =>
				x.ref === ref && x.status !== "withdrawn" && x.status !== "expired",
		);
		if (!r) {
			out.set(a.questionCode, { status: "missing" });
			continue;
		}
		const d = lastDecision(r.id);
		const by = d?.userId ? (names.get(d.userId) ?? null) : null;
		if (r.status === "approved")
			out.set(a.questionCode, {
				status: "confirmed",
				by,
				at: (r.decidedAt ?? d?.at ?? null)?.toISOString() ?? null,
			});
		else if (r.status === "rejected" || r.status === "changes_requested")
			out.set(a.questionCode, {
				status: r.status === "rejected" ? "rejected" : "changes",
				by,
				note: d?.note ?? null,
			});
		else out.set(a.questionCode, { status: "pending" });
	}
	return out;
}

// Bestätigung beantragen (beim Beantworten mit „nicht relevant“). Gibt den
// neuen Stand zurück; ein Antrag mit derselben Begründung wird nicht
// wiederholt. error = niemand kann entscheiden (Antwort bleibt gespeichert,
// wirkt aber nicht).
export async function requestNaConfirmation(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: {
		assessmentId: string;
		assessmentCode: string;
		questionCode: string;
		controlImplementationId: string;
		reason: string;
	},
): Promise<NaConfirmation> {
	const [s] = await tx
		.select({ stage: orgSettings.licenceStage })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, ctx.orgId))
		.limit(1);
	// neuer Ablauf auch für bestehende Orgs
	await ensureOrgWorkflows(tx, ctx.orgId, s?.stage ?? "0_vorbereitung");
	const ref = naVersionRef(
		input.assessmentId,
		input.questionCode,
		input.reason,
	);
	const known = await naConfirmations(tx, ctx.orgId, input.assessmentId, [
		{ questionCode: input.questionCode, answer: "na", naReason: input.reason },
	]);
	// gleiche Begründung: bestehender Stand gilt — abgelehnt oder Rückfrage
	// gehen erst mit geänderter Begründung erneut an die Geschäftsleitung
	const state = known.get(input.questionCode);
	if (state && state.status !== "missing") return state;
	const gate: GateResult = await gateApproval(tx, ctx, {
		trigger: NA_TRIGGER,
		entityType: "control",
		entityId: input.controlImplementationId,
		entityVersionRef: ref,
		title: `Nicht relevant: ${input.assessmentCode} · ${input.questionCode}`,
		link: `/gap-analyse/${input.assessmentId}?schritt=fragen#q-${input.questionCode}`,
		// Ein-Personen-Org (Solo-Modus): die Begründung ist die Begründung
		// der Selbstfreigabe
		selfApprovalReason: input.reason,
	});
	if (gate.status === "error") return { status: "blocked", error: gate.error };
	if (gate.status === "pending") return { status: "pending" };
	return { status: "confirmed", by: ctx.name, at: new Date().toISOString() };
}

// Antwort ist nicht mehr „nicht relevant“: offene Anträge dieser Frage
// zurückziehen
export async function withdrawNaConfirmation(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
	questionCode: string,
): Promise<number> {
	const res = await tx
		.update(approvalRequests)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, "control"),
				eq(approvalRequests.status, "pending"),
				like(
					approvalRequests.entityVersionRef,
					`${refPrefix(assessmentId, questionCode)}%`,
				),
			),
		)
		.returning({ id: approvalRequests.id });
	return res.length;
}

const REF = /^na:([0-9a-f-]{36}):([^:]+):([0-9a-f]{16})$/;

// Bestätigung kommt nach „Ergebnis übernehmen“: dann wirkt sie hier
// (Ausschluss der ausschließbaren Anforderungen, Maßnahme entfällt, wenn
// nichts offen bliebe). Vorher liest das Übernehmen die Bestätigung selbst.
// Nur, solange Antwort und Begründung noch dieselben sind.
export async function applyConfirmedNa(
	tx: OrgTx,
	orgId: string,
	ref: string | null,
): Promise<AuditInput[]> {
	const m = REF.exec(ref ?? "");
	if (!m?.[1] || !m[2]) return [];
	const assessmentId = m[1];
	const questionCode = m[2];
	const [a] = await tx
		.select({
			id: assessments.id,
			code: assessments.code,
			kind: assessments.kind,
			appliedAt: assessments.appliedAt,
			questions: assessments.questions,
		})
		.from(assessments)
		.where(
			and(
				eq(assessments.organizationId, orgId),
				eq(assessments.id, assessmentId),
			),
		)
		.limit(1);
	if (!a || a.kind !== "self" || !a.appliedAt) return [];
	const q = a.questions.find((x) => x.code === questionCode);
	const [row] = await tx
		.select()
		.from(assessmentAnswers)
		.where(
			and(
				eq(assessmentAnswers.organizationId, orgId),
				eq(assessmentAnswers.assessmentId, a.id),
				eq(assessmentAnswers.questionCode, questionCode),
			),
		)
		.limit(1);
	if (
		!q?.controlCode ||
		row?.answer !== "na" ||
		naVersionRef(a.id, questionCode, row.naReason ?? "") !== ref
	)
		return [];
	const catalog = await loadOrgCatalog(tx, orgId);
	const allowedKey = (k: string) => exclusionAllowedForKey(k, catalog);
	const stored = await loadApplicability(tx, orgId);
	const excluded = new Set(
		[...stored]
			.filter(([, v]) => v.source === "manual" && !v.applicable)
			.map(([k]) => k),
	);
	for (const [slug, info] of catalog.custom)
		for (const code of info.excluded.keys()) excluded.add(`${slug}:${code}`);
	const exclusions = proposeExclusions(
		[q],
		answerStates([q], [row]),
		allowedKey,
		excluded,
	);
	const audits = await excludeRequirements(
		tx,
		orgId,
		exclusions,
		`assessment:${a.code}`,
		catalog,
	);
	if (!naDropsControl(q, catalog)) return audits;
	const [impl] = await tx
		.select({
			id: controlImplementations.id,
			status: controlImplementations.status,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controls.code, q.controlCode),
			),
		)
		.limit(1);
	if (!impl || impl.status === "not_applicable") return audits;
	await tx
		.update(controlImplementations)
		.set({
			status: "not_applicable",
			source: "manual",
			implementedAt: null,
			note: row.naReason,
		})
		.where(eq(controlImplementations.id, impl.id));
	audits.push({
		action: "control.status",
		target: `control:${impl.id}`,
		before: { status: impl.status },
		after: { status: "not_applicable", via: `assessment:${a.code}` },
	});
	return audits;
}

export type NaRequestDetail = {
	assessmentCode: string;
	questionText: string;
	reason: string;
	// stimmt die Begründung noch mit dem Antrag überein?
	current: boolean;
	link: string;
	excludes: string[];
	keeps: string[];
};

// Posteingang: was die zweite Person bestätigt (Frage, Begründung, Folgen)
export async function naRequestDetails(
	tx: OrgTx,
	orgId: string,
	rows: readonly { id: string; entityVersionRef: string | null }[],
): Promise<Map<string, NaRequestDetail>> {
	const out = new Map<string, NaRequestDetail>();
	const refs = rows.flatMap((r) => {
		const m = REF.exec(r.entityVersionRef ?? "");
		return m?.[1] && m[2]
			? [
					{
						id: r.id,
						ref: r.entityVersionRef ?? "",
						assessmentId: m[1],
						code: m[2],
					},
				]
			: [];
	});
	if (refs.length === 0) return out;
	const ids = [...new Set(refs.map((r) => r.assessmentId))];
	const list = await tx
		.select({
			id: assessments.id,
			code: assessments.code,
			questions: assessments.questions,
		})
		.from(assessments)
		.where(
			and(eq(assessments.organizationId, orgId), inArray(assessments.id, ids)),
		);
	const answers = await tx
		.select({
			assessmentId: assessmentAnswers.assessmentId,
			questionCode: assessmentAnswers.questionCode,
			answer: assessmentAnswers.answer,
			naReason: assessmentAnswers.naReason,
		})
		.from(assessmentAnswers)
		.where(
			and(
				eq(assessmentAnswers.organizationId, orgId),
				inArray(assessmentAnswers.assessmentId, ids),
			),
		);
	const catalog = await loadOrgCatalog(tx, orgId);
	for (const r of refs) {
		const a = list.find((x) => x.id === r.assessmentId);
		const q = a?.questions.find((x) => x.code === r.code);
		if (!a || !q) continue;
		const ans = answers.find(
			(x) => x.assessmentId === a.id && x.questionCode === r.code,
		);
		const reason = ans?.naReason ?? "";
		const impact = naImpactOf(q, catalog);
		out.set(r.id, {
			assessmentCode: a.code,
			questionText: q.text,
			reason,
			current:
				ans?.answer === "na" && naVersionRef(a.id, r.code, reason) === r.ref,
			link: `/gap-analyse/${a.id}?schritt=fragen&kapitel=${encodeURIComponent(q.sectionCode)}#q-${r.code}`,
			excludes: impact.excludable.map((x) => x.label),
			keeps: impact.kept.map((x) => x.label),
		});
	}
	return out;
}

// ── Control-Seite: Status „nicht anwendbar“ ──────────────────────────────

export function controlNaRef(reason: string): string {
	return `ctl:${createHash("sha256").update(reason.trim()).digest("hex").slice(0, 16)}`;
}

type Coverage = NonNullable<Awaited<ReturnType<typeof orgCoverage>>>;

// Anwendbare Anforderungen der gewählten Rahmenwerke, die das Control trägt,
// und was „nicht anwendbar“ für sie bewirkt
export function controlNaImpact(cov: Coverage, code: string): NaImpact {
	const keys = (cov.catalog.edgesByControl.get(code) ?? [])
		.map((e) => e.requirement)
		.filter(
			(k) =>
				cov.frameworks.includes(k.slice(0, k.indexOf(":"))) &&
				cov.result.byRequirement.get(k) !== "not_applicable",
		);
	return naImpact(keys, cov.catalog, code);
}

// Bestätigung für „nicht anwendbar“ an der Control-Seite beantragen
export async function requestControlNa(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: {
		implementationId: string;
		code: string;
		title: string;
		reason: string;
	},
): Promise<
	| { status: "confirmed" }
	| { status: "pending" }
	| { status: "blocked"; error: string }
> {
	const [s] = await tx
		.select({ stage: orgSettings.licenceStage })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, ctx.orgId))
		.limit(1);
	await ensureOrgWorkflows(tx, ctx.orgId, s?.stage ?? "0_vorbereitung");
	const gate = await gateApproval(tx, ctx, {
		trigger: NA_TRIGGER,
		entityType: "control",
		entityId: input.implementationId,
		entityVersionRef: controlNaRef(input.reason),
		title: `Nicht anwendbar: ${input.code} · ${input.title}`,
		link: `/controls/${input.code}`,
		selfApprovalReason: input.reason,
	});
	if (gate.status === "error") return { status: "blocked", error: gate.error };
	if (gate.status === "pending") return { status: "pending" };
	return { status: "confirmed" };
}

// Bestätigt: Status „nicht anwendbar“ setzen und die ausschließbaren
// Anforderungen mit derselben Begründung ausschließen — nur, solange die
// Begründung an der Umsetzung noch die des Antrags ist
export async function applyControlNa(
	tx: OrgTx,
	orgId: string,
	implementationId: string,
	ref: string,
): Promise<AuditInput[]> {
	const [impl] = await tx
		.select({
			id: controlImplementations.id,
			status: controlImplementations.status,
			note: controlImplementations.note,
			code: controls.code,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controlImplementations.id, implementationId),
			),
		)
		.limit(1);
	if (
		!impl ||
		impl.status === "not_applicable" ||
		controlNaRef(impl.note ?? "") !== ref
	)
		return [];
	const cov = await orgCoverage(tx, orgId);
	if (!cov) return [];
	const impact = controlNaImpact(cov, impl.code);
	// Regeln haben sich geändert (z. B. neues Rahmenwerk ohne Ausschluss)
	if (impact.blocked.length > 0) return [];
	const reason = impl.note ?? "";
	const audits = await excludeRequirements(
		tx,
		orgId,
		impact.excludable.map((x) => ({ key: x.key, note: reason })),
		`control:${impl.code}`,
		cov.catalog,
	);
	await tx
		.update(controlImplementations)
		.set({ status: "not_applicable", source: "manual", implementedAt: null })
		.where(eq(controlImplementations.id, impl.id));
	audits.push({
		action: "control.status",
		target: `control:${impl.id}`,
		before: { status: impl.status },
		after: { status: "not_applicable", via: "approval", code: impl.code },
	});
	return audits;
}
