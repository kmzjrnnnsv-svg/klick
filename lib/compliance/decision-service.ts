import { and, desc, eq, inArray, like } from "drizzle-orm";
import {
	amlRiskAnalyses,
	approvalDecisions,
	approvalRequests,
	approvalWorkflows,
	controls,
	decisionRequests,
	documentRequirements,
	documents,
	frameworks,
	incidents,
	objectives,
	orgSettings,
	providerRatings,
	providers,
	requirements,
	resolutions,
	riskControls,
	risks,
} from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import { soloModeAllowed, stepRules } from "@/lib/approvals/rules";
import {
	ensureOrgWorkflows,
	loadCandidates,
	requestApproval,
	requestSteps,
} from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { listOrgFrameworks } from "@/lib/org/queries";
import { EDGES_BY_CONTROL, REQUIREMENT_BY_KEY } from "./catalog";
import {
	frameworkRefs,
	isManagementDecision,
	nextDecisionCode,
	resolutionFromDecision,
} from "./decision-resolutions";
import { insertResolution } from "./resolutions-service";
import { topManagementOf } from "./top-management";

// Rahmenwerk-Bezug einer Entität (E1/E2): über verknüpfte Controls bzw.
// Anforderungen; nur aktive Rahmenwerke zählen (frameworkRefs).
const CONTROL_PREFIX: Partial<Record<EntityKind, string>> = {
	provider: "CC-TPR-",
	provider_rating: "CC-TPR-",
	incident: "CC-INC-",
	aml_risk_analysis: "CC-AML-",
	own_funds_calculation: "CC-CAP-",
	product: "CC-PRD-",
	security_finding: "CC-OPS-",
	asset: "CC-AST-",
};

function keysOfControls(codes: readonly string[]): string[] {
	return codes.flatMap((c) =>
		(EDGES_BY_CONTROL.get(c) ?? []).map((e) => e.requirement),
	);
}

export async function entityFrameworkRefs(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind | null | undefined,
	entityId: string | null | undefined,
): Promise<{ frameworks: string[]; requirementKeys: string[] }> {
	const active = (await listOrgFrameworks(tx, orgId)).map((f) => f.slug);
	if (!entityType || !entityId) return { frameworks: [], requirementKeys: [] };
	let keys: string[] = [];
	let extra: string[] = [];
	if (entityType === "risk") {
		const rows = await tx
			.select({ code: controls.code })
			.from(riskControls)
			.innerJoin(controls, eq(controls.id, riskControls.controlId))
			.where(eq(riskControls.riskId, entityId));
		keys = keysOfControls(rows.map((r) => r.code));
	} else if (entityType === "document") {
		const rows = await tx
			.select({ code: requirements.code, slug: frameworks.slug })
			.from(documentRequirements)
			.innerJoin(
				requirements,
				eq(requirements.id, documentRequirements.requirementId),
			)
			.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.where(eq(documentRequirements.documentId, entityId));
		keys = rows.map((r) => `${r.slug}:${r.code}`);
	} else if (entityType === "objective") {
		const [o] = await tx
			.select({ fw: objectives.frameworkIds })
			.from(objectives)
			.where(eq(objectives.id, entityId));
		extra = o?.fw ?? [];
	} else if (entityType === "decision_request") {
		const [d] = await tx
			.select({
				fw: decisionRequests.frameworks,
				keys: decisionRequests.requirementKeys,
			})
			.from(decisionRequests)
			.where(eq(decisionRequests.id, entityId));
		keys = d?.keys ?? [];
		extra = d?.fw ?? [];
	} else if (entityType === "requirement") {
		const [r] = await tx
			.select({ code: requirements.code, slug: frameworks.slug })
			.from(requirements)
			.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.where(eq(requirements.id, entityId));
		if (r) keys = [`${r.slug}:${r.code}`];
	} else if (entityType === "scope") {
		keys = ["iso27001:4.3"];
	} else {
		const prefix = CONTROL_PREFIX[entityType];
		if (prefix) {
			const rows = await tx
				.select({ code: controls.code })
				.from(controls)
				.where(like(controls.code, `${prefix}%`));
			keys = keysOfControls(rows.map((r) => r.code));
		}
	}
	return frameworkRefs(keys, active, extra);
}

// Anzeige der Entität im Beschluss + Hinweise für den Pflichtbeschluss
async function entityFacts(
	tx: OrgTx,
	entityType: EntityKind,
	entityId: string,
): Promise<{
	label: string;
	documentTemplateCode?: string | null;
	providerMaterial?: boolean;
	question?: string;
}> {
	switch (entityType) {
		case "risk": {
			const [r] = await tx
				.select({ code: risks.code, title: risks.title })
				.from(risks)
				.where(eq(risks.id, entityId));
			return { label: r ? `${r.code} ${r.title}` : "Risiko" };
		}
		case "document": {
			const [d] = await tx
				.select({
					no: documents.docNumber,
					title: documents.title,
					tpl: documents.templateCode,
				})
				.from(documents)
				.where(eq(documents.id, entityId));
			return {
				label: d ? `${d.no} ${d.title}` : "Dokument",
				documentTemplateCode: d?.tpl ?? null,
			};
		}
		case "provider": {
			const [p] = await tx
				.select({ name: providers.name, material: providers.isMaterial })
				.from(providers)
				.where(eq(providers.id, entityId));
			return {
				label: p?.name ?? "Dienstleister",
				providerMaterial: p?.material,
			};
		}
		case "provider_rating": {
			const [r] = await tx
				.select({
					code: providerRatings.code,
					name: providers.name,
					material: providers.isMaterial,
				})
				.from(providerRatings)
				.innerJoin(providers, eq(providers.id, providerRatings.providerId))
				.where(eq(providerRatings.id, entityId));
			return {
				label: r ? `${r.code} ${r.name}` : "Lieferantenbewertung",
				providerMaterial: r?.material,
			};
		}
		case "incident": {
			const [i] = await tx
				.select({ code: incidents.code, title: incidents.title })
				.from(incidents)
				.where(eq(incidents.id, entityId));
			return { label: i ? `${i.code} ${i.title}` : "Vorfall" };
		}
		case "objective": {
			const [o] = await tx
				.select({ title: objectives.title })
				.from(objectives)
				.where(eq(objectives.id, entityId));
			return { label: o?.title ?? "Ziel" };
		}
		case "aml_risk_analysis": {
			const [a] = await tx
				.select({ id: amlRiskAnalyses.id })
				.from(amlRiskAnalyses)
				.where(eq(amlRiskAnalyses.id, entityId));
			return { label: a ? "Geldwäsche-Risikoanalyse" : "Risikoanalyse" };
		}
		case "decision_request": {
			const [d] = await tx
				.select({ code: decisionRequests.code, q: decisionRequests.question })
				.from(decisionRequests)
				.where(eq(decisionRequests.id, entityId));
			return { label: d?.code ?? "Anfrage", question: d?.q };
		}
		default:
			return { label: entityType };
	}
}

// Nach einer abschließenden Freigabe-Entscheidung (app/actions/approvals.ts):
// war es die Geschäftsleitung, entsteht ein Beschluss — höchstens einer je
// Antrag. Liefert die Audit-Einträge für die laufende Transaktion.
export async function resolutionForApproval(
	tx: OrgTx,
	actor: { orgId: string; userId: string; name: string },
	requestId: string,
): Promise<AuditInput[]> {
	const [row] = await tx
		.select({
			req: approvalRequests,
			kind: approvalWorkflows.kind,
			name: approvalWorkflows.name,
			wfSteps: approvalWorkflows.steps,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.id, requestId),
				eq(approvalRequests.organizationId, actor.orgId),
			),
		)
		.limit(1);
	if (!row) return [];
	const { req } = row;
	if (req.status !== "approved" && req.status !== "rejected") return [];
	const [already] = await tx
		.select({ id: resolutions.id })
		.from(resolutions)
		.where(
			and(
				eq(resolutions.organizationId, actor.orgId),
				eq(resolutions.approvalRequestId, requestId),
			),
		)
		.limit(1);
	if (already) return [];
	const step = requestSteps(req, row.wfSteps).find(
		(s) => s.order === req.currentStep,
	);
	const top = await topManagementOf(tx, actor.orgId, actor.userId);
	if (
		!isManagementDecision({
			approverRule: step
				? (stepRules(step).find((r) => r === "function:management_body") ??
					step.approverRule)
				: undefined,
			deciderIsTopManagement: top.isTopManagement,
			entityType: req.entityType,
		})
	)
		return [];
	const [last] = await tx
		.select({ note: approvalDecisions.note })
		.from(approvalDecisions)
		.where(eq(approvalDecisions.requestId, requestId))
		.orderBy(desc(approvalDecisions.decidedAt))
		.limit(1);
	return createDecisionResolution(tx, actor, {
		workflowKind: row.kind,
		workflowName: row.name,
		entityType: req.entityType,
		entityId: req.entityId,
		outcome: req.status,
		note: last?.note ?? null,
		requestId,
	});
}

// Auch für direkte Entscheidungen der Geschäftsleitung ohne Workflow.
export async function createDecisionResolution(
	tx: OrgTx,
	actor: { orgId: string; userId: string; name: string },
	d: {
		workflowKind: string;
		workflowName: string;
		entityType: EntityKind;
		entityId: string;
		outcome: "approved" | "rejected";
		note?: string | null;
		requestId?: string | null;
	},
): Promise<AuditInput[]> {
	const facts = await entityFacts(tx, d.entityType, d.entityId);
	const res = resolutionFromDecision({
		workflowKind: d.workflowKind,
		workflowName: d.workflowName,
		entityType: d.entityType,
		entityLabel: facts.label,
		outcome: d.outcome,
		note: d.note,
		documentTemplateCode: facts.documentTemplateCode,
		providerMaterial: facts.providerMaterial,
		question: facts.question,
	});
	const refs = await entityFrameworkRefs(
		tx,
		actor.orgId,
		d.entityType,
		d.entityId,
	);
	const created = await insertResolution(tx, actor, {
		subject: res.subject,
		decisionText: res.decisionText,
		body: "management",
		date: new Date().toISOString().slice(0, 10),
		requiredCode: res.requiredCode,
		linkedEntityType: d.entityType,
		linkedEntityId: d.entityId,
		attendeeUserIds: [actor.userId],
		requestApproval: false,
		frameworks: refs.frameworks,
		requirementKeys: refs.requirementKeys,
		decidedRequestId: d.requestId ?? null,
	});
	if (!created.ok) return [];
	if (d.entityType === "decision_request")
		await tx
			.update(decisionRequests)
			.set({ resolutionId: created.data.id })
			.where(eq(decisionRequests.id, d.entityId));
	return [created.audit];
}

// Beschlüsse zu einer Entität (Detailseiten, Aktivität)
export async function listResolutionsFor(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityIds: readonly string[],
) {
	if (entityIds.length === 0) return [];
	return tx
		.select({
			id: resolutions.id,
			number: resolutions.resolutionNumber,
			date: resolutions.date,
			subject: resolutions.subject,
			decisionText: resolutions.decisionText,
		})
		.from(resolutions)
		.where(
			and(
				eq(resolutions.organizationId, orgId),
				eq(resolutions.linkedEntityType, entityType),
				inArray(resolutions.linkedEntityId, [...entityIds]),
			),
		)
		.orderBy(desc(resolutions.date));
}

// Managementanfragen (E2) — alle oder zu einer Entität
export async function listDecisionRequests(
	tx: OrgTx,
	orgId: string,
	entity?: { type: EntityKind; id: string },
) {
	return tx
		.select({
			id: decisionRequests.id,
			code: decisionRequests.code,
			question: decisionRequests.question,
			context: decisionRequests.context,
			recommendation: decisionRequests.recommendation,
			options: decisionRequests.options,
			dueAt: decisionRequests.dueAt,
			status: decisionRequests.status,
			outcome: decisionRequests.outcome,
			frameworks: decisionRequests.frameworks,
			requirementKeys: decisionRequests.requirementKeys,
			linkedEntityType: decisionRequests.linkedEntityType,
			linkedEntityId: decisionRequests.linkedEntityId,
			requestedByUserId: decisionRequests.requestedByUserId,
			decidedAt: decisionRequests.decidedAt,
			createdAt: decisionRequests.createdAt,
			resolutionNumber: resolutions.resolutionNumber,
		})
		.from(decisionRequests)
		.leftJoin(resolutions, eq(resolutions.id, decisionRequests.resolutionId))
		.where(
			and(
				eq(decisionRequests.organizationId, orgId),
				entity ? eq(decisionRequests.linkedEntityType, entity.type) : undefined,
				entity ? eq(decisionRequests.linkedEntityId, entity.id) : undefined,
			),
		)
		.orderBy(desc(decisionRequests.createdAt));
}

// Managementanfrage anlegen und an die Geschäftsleitung schicken (E2) —
// aus dem Dialog und automatisch bei Zielverfehlung (B5). Solo-Modus:
// sofort selbst entschieden, dann gleich ein Beschluss.
export async function openDecisionRequest(
	tx: OrgTx,
	actor: { orgId: string; userId: string; name: string },
	d: {
		question: string;
		context?: string | null;
		recommendation?: string | null;
		options?: string[];
		dueAt?: string | null;
		linkedEntityType?: EntityKind | null;
		linkedEntityId?: string | null;
		requirementKeys?: string[];
		selfApprovalReason?: string;
	},
): Promise<
	| { ok: true; id: string; code: string; status: string; audit: AuditInput[] }
	| { ok: false; error: string }
> {
	const [settings] = await tx
		.select({ stage: orgSettings.licenceStage })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, actor.orgId))
		.limit(1);
	await ensureOrgWorkflows(
		tx,
		actor.orgId,
		settings?.stage ?? "0_vorbereitung",
	);
	const refs = await entityFrameworkRefs(
		tx,
		actor.orgId,
		d.linkedEntityType,
		d.linkedEntityId,
	);
	const chosen = (d.requirementKeys ?? []).filter((k) =>
		REQUIREMENT_BY_KEY.has(k),
	);
	const keys = [...new Set([...chosen, ...refs.requirementKeys])].slice(0, 20);
	const fws = [
		...new Set([...refs.frameworks, ...keys.map((k) => k.split(":")[0] ?? "")]),
	];
	const existing = await tx
		.select({ code: decisionRequests.code })
		.from(decisionRequests)
		.where(eq(decisionRequests.organizationId, actor.orgId));
	const code = nextDecisionCode(
		existing.map((e) => e.code),
		new Date().getFullYear(),
	);
	const [row] = await tx
		.insert(decisionRequests)
		.values({
			organizationId: actor.orgId,
			code,
			question: d.question,
			context: d.context ?? null,
			recommendation: d.recommendation ?? null,
			options: d.options ?? [],
			dueAt: d.dueAt ?? null,
			linkedEntityType: d.linkedEntityType ?? null,
			linkedEntityId: d.linkedEntityId ?? null,
			frameworks: fws,
			requirementKeys: keys,
			requestedByUserId: actor.userId,
		})
		.returning({ id: decisionRequests.id });
	if (!row) throw new Error("insert failed");
	const r = await requestApproval(tx, actor, {
		kind: "management_decision",
		entityType: "decision_request",
		entityId: row.id,
		entityOwnerUserId: actor.userId,
		title: `${code} · ${d.question}`,
		link: "/beschluesse?tab=anfragen",
		selfApprovalReason: d.selfApprovalReason,
	});
	if (!r.ok) {
		// nichts halb Angelegtes zurücklassen
		await tx.delete(decisionRequests).where(eq(decisionRequests.id, row.id));
		return { ok: false, error: r.error };
	}
	await tx
		.update(decisionRequests)
		.set({ approvalRequestId: r.requestId })
		.where(eq(decisionRequests.id, row.id));
	const audit: AuditInput[] = [
		{
			action: "decision_request.create",
			target: `decision_request:${row.id}`,
			after: {
				code,
				question: d.question,
				linked: d.linkedEntityType
					? `${d.linkedEntityType}:${d.linkedEntityId}`
					: null,
				frameworks: fws,
				requirementKeys: keys,
			},
		},
	];
	if (r.status === "approved") {
		await tx
			.update(decisionRequests)
			.set({
				status: "decided",
				outcome: "approved",
				decidedByUserId: actor.userId,
				decidedAt: new Date(),
			})
			.where(eq(decisionRequests.id, row.id));
		audit.push(
			...(await createDecisionResolution(tx, actor, {
				workflowKind: "management_decision",
				workflowName: "Managemententscheidung",
				entityType: "decision_request",
				entityId: row.id,
				outcome: "approved",
				note: d.selfApprovalReason ?? null,
				requestId: r.requestId,
			})),
		);
	}
	return { ok: true, id: row.id, code, status: r.status, audit };
}

// Hinweis vor dem Absenden (B4/E2): Gibt es jemanden außer der anfragenden
// Person in der Geschäftsleitung (inkl. Vertretung)? Sonst scheitert die
// Freigabe am Vier-Augen-Prinzip — das sagt der Dialog vorher.
export async function managementApproverHint(
	tx: OrgTx,
	orgId: string,
	requesterUserId: string,
): Promise<"none" | "only_you" | null> {
	const candidates = await loadCandidates(tx, orgId);
	// Solo-Modus (eine Person, Stufe < 2) gibt mit Begründung selbst frei
	const [s] = await tx
		.select({
			stage: orgSettings.licenceStage,
			self: orgSettings.allowSelfApproval,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	if (
		s &&
		soloModeAllowed({
			memberCount: candidates.length,
			allowSelfApproval: s.self,
			licenceStage: s.stage,
		})
	)
		return null;
	const mgmt = candidates.filter((c) =>
		c.functions.includes("management_body"),
	);
	if (mgmt.length === 0) return "none";
	if (mgmt.every((c) => c.userId === requesterUserId)) return "only_you";
	return null;
}
