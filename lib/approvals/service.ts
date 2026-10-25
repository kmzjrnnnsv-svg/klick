import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	approvalDecisions,
	approvalRequests,
	approvalWorkflows,
	delegations,
	memberRoles,
	orgRoles,
	orgSettings,
	roleAssignments,
} from "@/db/schema";
import type { EntityKind, RoleFunction } from "@/db/schema/enums";
import type { ApprovalStep } from "@/db/schema/grc";
import { effectivePermissions } from "@/lib/auth/permission-catalog";
import { type OrgRole, permissionsAllow } from "@/lib/auth/permissions";
import { normalizeRole } from "@/lib/auth/session-rules";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";
import { type OrgTx, queueAudit } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	entityApproverOf,
	entityOwnerOf,
	entityOwnersOf,
	ownerKey,
} from "./entity-owner";
import {
	type Facts,
	planRoute,
	type RouteWarning,
	selectWorkflow,
} from "./route";
import {
	type ApproverCandidate,
	advance,
	approverEligibility,
	canDecideNow,
	eligibleApprovers,
	openRules,
	slaDueAt,
	soloModeAllowed,
} from "./rules";
import { triggerForKind, triggerOf } from "./triggers";

// Freigabe-Service (DB, innerhalb einer Org-Transaktion). Die reinen Regeln
// liegen in rules.ts; hier: Workflows je Org sicherstellen, Kandidaten aus
// Mitgliedern + role_assignments + Vertretungen auflösen, Anfrage anlegen,
// entscheiden, zurückziehen. Jede Entscheidung schreibt der Aufrufer ins Audit.

export async function ensureOrgWorkflows(
	tx: OrgTx,
	orgId: string,
	licenceStage: string,
): Promise<number> {
	const stage = Number.parseInt(licenceStage.charAt(0), 10) || 0;
	const existing = new Set(
		(
			await tx
				.select({ kind: approvalWorkflows.kind })
				.from(approvalWorkflows)
				.where(eq(approvalWorkflows.organizationId, orgId))
		).map((w) => w.kind),
	);
	let created = 0;
	for (const t of APPROVAL_WORKFLOW_TEMPLATES) {
		if (existing.has(t.kind)) continue;
		await tx.insert(approvalWorkflows).values({
			organizationId: orgId,
			entityType: t.entityType,
			kind: t.kind,
			name: t.name,
			trigger: triggerForKind(t.kind)?.key ?? null,
			description: t.description,
			steps: t.steps,
			enabled:
				t.defaultEnabled ||
				(t.enabledFromStage !== undefined && stage >= t.enabledFromStage),
		});
		created += 1;
	}
	return created;
}

export async function getWorkflow(tx: OrgTx, orgId: string, kind: string) {
	const [w] = await tx
		.select()
		.from(approvalWorkflows)
		.where(
			and(
				eq(approvalWorkflows.organizationId, orgId),
				eq(approvalWorkflows.kind, kind),
			),
		)
		.limit(1);
	return w ?? null;
}

// Alle Mitglieder als Kandidaten mit Org-Rolle und Funktionen (inkl. Vertretung
// einer Funktion über deputyUserId). Alle zählen für den Solo-Modus; freigeben
// darf nur, wer `approval:decide` hat (canDecide).
export async function loadCandidates(
	tx: OrgTx,
	orgId: string,
): Promise<ApproverCandidate[]> {
	const members = await tx
		.select({ memberId: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	// eigene Rollen (ADR-020): Rechte + Zugehörigkeit für Stufen role:<id>
	const custom = await tx
		.select({
			memberId: memberRoles.memberId,
			roleId: orgRoles.id,
			permissions: orgRoles.permissions,
		})
		.from(memberRoles)
		.innerJoin(orgRoles, eq(orgRoles.id, memberRoles.roleId))
		.where(eq(memberRoles.organizationId, orgId));
	const customByMember = new Map<
		string,
		{ roleId: string; permissions: unknown }[]
	>();
	for (const c of custom) {
		if (!c.memberId) continue;
		const list = customByMember.get(c.memberId) ?? [];
		list.push(c);
		customByMember.set(c.memberId, list);
	}
	const fns = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
		})
		.from(roleAssignments)
		.where(
			and(eq(roleAssignments.organizationId, orgId), effectiveAssignment()),
		);
	const byUser = new Map<string, Set<RoleFunction>>();
	const heldBy = new Map<string, Set<RoleFunction>>();
	for (const f of fns) {
		for (const uid of [f.userId, f.deputyUserId]) {
			if (!uid) continue;
			const set = byUser.get(uid) ?? new Set<RoleFunction>();
			set.add(f.function);
			byUser.set(uid, set);
		}
		if (f.userId) {
			const held = heldBy.get(f.userId) ?? new Set<RoleFunction>();
			held.add(f.function);
			heldBy.set(f.userId, held);
		}
	}
	return members.map((m) => {
		const orgRole = normalizeRole(m.role) as OrgRole;
		const own = customByMember.get(m.memberId) ?? [];
		const perms = effectivePermissions(
			orgRole,
			own.map((c) => c.permissions),
		);
		return {
			userId: m.userId,
			orgRole,
			functions: [...(byUser.get(m.userId) ?? [])],
			holderFunctions: [...(heldBy.get(m.userId) ?? [])],
			customRoleIds: own.map((c) => c.roleId),
			// Berater:innen u. a. ohne approval:decide bekommen keine Anfragen
			canDecide: permissionsAllow(perms, { approval: ["decide"] }),
		};
	});
}

export async function activeDelegations(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
) {
	return tx
		.select({
			fromUserId: delegations.fromUserId,
			toUserId: delegations.toUserId,
		})
		.from(delegations)
		.where(
			and(
				eq(delegations.organizationId, orgId),
				eq(delegations.scope, "approvals"),
				lte(delegations.validFrom, now),
				gt(delegations.validUntil, now),
			),
		);
}

export type RequestApprovalInput = {
	// Auslöser (lib/approvals/triggers.ts); alternativ das bisherige kind
	trigger?: string;
	kind?: string;
	// Fakten für Bedingungen (Varianten und „Nur wenn …“)
	facts?: Facts;
	entityType: EntityKind;
	entityId: string;
	entityOwnerUserId?: string | null;
	// Stelle approver_of_entity; fehlt der Wert, liest der Dienst ihn aus der
	// Entität (Dokument: approverFunction)
	entityApproverFunction?: RoleFunction | null;
	entityVersionRef?: string | null;
	title: string;
	link: string;
	// Solo-Modus: begründete Selbstfreigabe
	selfApprovalReason?: string;
	// Stufen nur für diesen Antrag (z. B. je Risikoklasse, B4); sonst die
	// Stufen des Workflows
	steps?: ApprovalStep[];
	// Stufen „alle Personen“: zählen nicht mit (abberufene Person)
	everyoneExclude?: string[];
};

// Stufen eines Antrags: Schnappschuss am Antrag, sonst Workflow
export function requestSteps(
	req: { steps?: ApprovalStep[] | null },
	workflowSteps: unknown,
): ApprovalStep[] {
	return req.steps && req.steps.length > 0
		? req.steps
		: (workflowSteps as ApprovalStep[]);
}

export type RequestApprovalResult =
	| {
			ok: true;
			requestId: string;
			status: "pending" | "approved";
			selfApproved: boolean;
			approverIds: string[];
			workflowName: string;
			// alle Stufen entfallen (z. B. anfragende Person ist selbst Stelle)
			autoApproved?: boolean;
	  }
	| {
			ok: false;
			error:
				| "workflow_disabled"
				| "no_approver"
				| "solo_reason_required"
				| "solo_not_allowed";
			warnings?: RouteWarning[];
	  };

// Aktiver Ablauf für einen Auslöser bzw. ein kind (Varianten zuerst)
async function resolveWorkflow(
	tx: OrgTx,
	orgId: string,
	input: { trigger?: string; kind?: string; facts?: Facts },
) {
	const rows = await tx
		.select()
		.from(approvalWorkflows)
		.where(eq(approvalWorkflows.organizationId, orgId));
	const trigger =
		input.trigger ?? (input.kind ? triggerForKind(input.kind)?.key : undefined);
	if (trigger) return selectWorkflow(rows, trigger, input.facts ?? {});
	return rows.find((w) => w.kind === input.kind && w.enabled) ?? null;
}

// Sofort freigegebener Antrag: gehört die anfragende Person zur
// Geschäftsleitung, entsteht wie bei einer Entscheidung ein Beschluss (E1).
// Dynamischer Import: decision-service nutzt selbst requestApproval.
async function immediateResolution(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	requestId: string,
): Promise<void> {
	const { resolutionForApproval } = await import(
		"@/lib/compliance/decision-service"
	);
	queueAudit(
		tx,
		await resolutionForApproval(tx, ctx, requestId, { immediate: true }),
	);
}

export async function requestApproval(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: RequestApprovalInput,
): Promise<RequestApprovalResult> {
	const wf = await resolveWorkflow(tx, ctx.orgId, input);
	if (!wf?.enabled) return { ok: false, error: "workflow_disabled" };
	const own = input.steps && input.steps.length > 0 ? input.steps : null;
	const baseSteps = own ?? (wf.steps as ApprovalStep[]);
	if (baseSteps.length === 0) return { ok: false, error: "workflow_disabled" };

	// Offene Anfrage derselben Entität zurückziehen (nur eine aktiv).
	await tx
		.update(approvalRequests)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequests.organizationId, ctx.orgId),
				eq(approvalRequests.entityType, input.entityType),
				eq(approvalRequests.entityId, input.entityId),
				eq(approvalRequests.status, "pending"),
			),
		);

	const candidates = await loadCandidates(tx, ctx.orgId);
	const dels = await activeDelegations(tx, ctx.orgId);
	const eligCtx = {
		requesterUserId: ctx.userId,
		entityOwnerUserId:
			input.entityOwnerUserId ??
			(await entityOwnerOf(tx, ctx.orgId, input.entityType, input.entityId)),
		entityApproverFunction:
			input.entityApproverFunction !== undefined
				? input.entityApproverFunction
				: await entityApproverOf(
						tx,
						ctx.orgId,
						input.entityType,
						input.entityId,
					),
		delegations: dels,
	};
	// Schnappschuss: entfallende Stufen (anfragende Person, Bedingungen)
	const route = planRoute(baseSteps, {
		requester: candidates.find((c) => c.userId === ctx.userId) ?? null,
		facts: input.facts ?? {},
		candidates,
		ctx: eligCtx,
		exclude: input.everyoneExclude,
	});
	const steps = route.steps;
	// „Alle Personen“: kann eine Person nie zustimmen (fehlendes Recht, keine
	// Vertretung), käme der Antrag nie durch — gleich melden statt hängen
	if (
		steps.some(
			(s) =>
				s.everyone &&
				!s.skipped &&
				route.warnings.some((w) => w.order === s.order),
		)
	)
		return { ok: false, error: "no_approver", warnings: route.warnings };
	const first = steps.find((s) => s.order === route.firstOrder);
	if (!first) {
		// Alle Stufen entfallen → ohne Entscheidung freigegeben, nachvollziehbar
		// am Antrag (Schnappschuss mit Gründen)
		const [req] = await tx
			.insert(approvalRequests)
			.values({
				organizationId: ctx.orgId,
				workflowId: wf.id,
				entityType: input.entityType,
				entityId: input.entityId,
				entityVersionRef: input.entityVersionRef ?? null,
				requestedByUserId: ctx.userId,
				currentStep: steps[0]?.order ?? 1,
				steps,
				status: "approved",
				decidedAt: new Date(),
			})
			.returning({ id: approvalRequests.id });
		if (!req) throw new Error("insert failed");
		// entfiel eine Stufe wegen der anfragenden Person (z. B. sie gehört
		// selbst zur Geschäftsleitung), ist das ihre Entscheidung → Beschluss
		if (steps.some((s) => s.skipped?.by === "requester"))
			await immediateResolution(tx, ctx, req.id);
		return {
			ok: true,
			requestId: req.id,
			status: "approved",
			selfApproved: false,
			approverIds: [],
			workflowName: wf.name,
			autoApproved: true,
		};
	}
	const eligible = eligibleApprovers(first, candidates, eligCtx);

	if (eligible.length === 0) {
		const [s] = await tx
			.select({
				allowSelfApproval: orgSettings.allowSelfApproval,
				licenceStage: orgSettings.licenceStage,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		const solo = soloModeAllowed({
			memberCount: candidates.length,
			allowSelfApproval: s?.allowSelfApproval ?? false,
			licenceStage: s?.licenceStage ?? "0_vorbereitung",
		});
		if (!solo)
			return { ok: false, error: "no_approver", warnings: route.warnings };
		if (
			!input.selfApprovalReason ||
			input.selfApprovalReason.trim().length < 10
		) {
			return { ok: false, error: "solo_reason_required" };
		}
		const [req] = await tx
			.insert(approvalRequests)
			.values({
				organizationId: ctx.orgId,
				workflowId: wf.id,
				entityType: input.entityType,
				entityId: input.entityId,
				entityVersionRef: input.entityVersionRef ?? null,
				requestedByUserId: ctx.userId,
				currentStep: first.order,
				steps,
				status: "approved",
				decidedAt: new Date(),
				selfApproved: true,
				selfApprovalReason: input.selfApprovalReason.trim(),
			})
			.returning({ id: approvalRequests.id });
		if (!req) throw new Error("insert failed");
		await tx.insert(approvalDecisions).values({
			organizationId: ctx.orgId,
			requestId: req.id,
			step: first.order,
			approverUserId: ctx.userId,
			decision: "approved",
			note: `Selbstfreigabe (Solo-Modus): ${input.selfApprovalReason.trim()}`,
		});
		await immediateResolution(tx, ctx, req.id);
		return {
			ok: true,
			requestId: req.id,
			status: "approved",
			selfApproved: true,
			approverIds: [],
			workflowName: wf.name,
		};
	}

	const [req] = await tx
		.insert(approvalRequests)
		.values({
			organizationId: ctx.orgId,
			workflowId: wf.id,
			entityType: input.entityType,
			entityId: input.entityId,
			entityVersionRef: input.entityVersionRef ?? null,
			requestedByUserId: ctx.userId,
			currentStep: first.order,
			steps,
			status: "pending",
			dueAt: slaDueAt(first, new Date()),
		})
		.returning({ id: approvalRequests.id });
	if (!req) throw new Error("insert failed");
	const approverIds = eligible.map((e) => e.userId);
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: approverIds,
		actorUserId: ctx.userId,
		kind: "approval_requested",
		title: `Freigabe angefragt: ${input.title}`,
		body: `${ctx.name} bittet um Freigabe (${wf.name}).`,
		link: `/heute/freigaben?request=${req.id}`,
		payload: { requestId: req.id, entityLink: input.link },
	});
	return {
		ok: true,
		requestId: req.id,
		status: "pending",
		selfApproved: false,
		approverIds,
		workflowName: wf.name,
	};
}

export type GateResult =
	| { status: "none" }
	| { status: "pending"; requestId: string; approverIds: string[] }
	| {
			status: "approved";
			requestId: string;
			selfApproved: boolean;
			autoApproved: boolean;
	  }
	| {
			status: "error";
			error: "no_approver" | "solo_reason_required" | "solo_not_allowed";
			warnings: RouteWarning[];
	  };

// Einheitlicher Einstieg für Auslöser (Freigabe-Designer): kein aktiver
// Ablauf → „none“ (die Aktion läuft wie ohne Freigabe weiter).
export async function gateApproval(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: Omit<RequestApprovalInput, "kind"> & { trigger: string },
): Promise<GateResult> {
	const r = await requestApproval(tx, ctx, input);
	if (!r.ok)
		return r.error === "workflow_disabled"
			? { status: "none" }
			: { status: "error", error: r.error, warnings: r.warnings ?? [] };
	return r.status === "pending"
		? { status: "pending", requestId: r.requestId, approverIds: r.approverIds }
		: {
				status: "approved",
				requestId: r.requestId,
				selfApproved: r.selfApproved,
				autoApproved: Boolean(r.autoApproved),
			};
}

// „Vorab“-Auslöser: darf die Aktion laufen? not_required = kein aktiver
// Ablauf; approved = letzter passender Antrag freigegeben.
export async function approvalState(
	tx: OrgTx,
	orgId: string,
	input: {
		trigger: string;
		entityType: EntityKind;
		entityId: string;
		entityVersionRef?: string | null;
		facts?: Facts;
	},
): Promise<"not_required" | "approved" | "pending" | "missing"> {
	const wf = await resolveWorkflow(tx, orgId, input);
	if (!wf) return "not_required";
	const rows = await tx
		.select({
			status: approvalRequests.status,
			versionRef: approvalRequests.entityVersionRef,
			trigger: approvalWorkflows.trigger,
			kind: approvalWorkflows.kind,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, input.entityType),
				eq(approvalRequests.entityId, input.entityId),
			),
		)
		.orderBy(desc(approvalRequests.requestedAt));
	const hit = rows.find(
		(r) =>
			triggerOf(r) === input.trigger &&
			(input.entityVersionRef === undefined ||
				r.versionRef === (input.entityVersionRef ?? null)),
	);
	if (hit?.status === "approved") return "approved";
	if (hit?.status === "pending") return "pending";
	return "missing";
}

export type DecideResult =
	| {
			ok: true;
			status: "pending" | "approved" | "rejected" | "changes_requested";
			requesterUserId: string | null;
			entityType: EntityKind;
			entityId: string;
			onBehalfOf?: string;
			// Auslöser des Ablaufs (outcomes.ts unterscheidet z. B.
			// risk.create von risk.accept)
			trigger: string | null;
	  }
	| {
			ok: false;
			error:
				| "not_found"
				| "not_pending"
				| "four_eyes"
				| "rule_not_met"
				| "already_decided";
	  };

export async function decide(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: {
		requestId: string;
		decision: "approved" | "rejected" | "changes_requested";
		note?: string;
	},
): Promise<DecideResult> {
	const [req] = await tx
		.select()
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.id, input.requestId),
				eq(approvalRequests.organizationId, ctx.orgId),
			),
		)
		.limit(1);
	if (!req) return { ok: false, error: "not_found" };
	if (req.status !== "pending") return { ok: false, error: "not_pending" };
	const wf = await tx
		.select()
		.from(approvalWorkflows)
		.where(eq(approvalWorkflows.id, req.workflowId))
		.limit(1)
		.then((r) => r[0]);
	if (!wf) return { ok: false, error: "not_found" };
	const steps = requestSteps(req, wf.steps);
	const step = steps.find((s) => s.order === req.currentStep);
	if (!step) return { ok: false, error: "not_found" };

	const candidates = await loadCandidates(tx, ctx.orgId);
	const me = candidates.find((c) => c.userId === ctx.userId);
	if (!me) return { ok: false, error: "rule_not_met" };
	const dels = await activeDelegations(tx, ctx.orgId);
	// Verantwortliche:r frisch aus der Entität (Stufe `owner_of_entity`)
	const entityOwnerUserId = await entityOwnerOf(
		tx,
		ctx.orgId,
		req.entityType,
		req.entityId,
	);
	const elig = approverEligibility(
		step,
		me,
		{
			requesterUserId: req.requestedByUserId,
			entityOwnerUserId,
			delegations: dels,
		},
		candidates,
	);
	if (!elig.eligible) return { ok: false, error: elig.reason };

	const before = await tx
		.select({
			decision: approvalDecisions.decision,
			rule: approvalDecisions.rule,
			approverUserId: approvalDecisions.approverUserId,
		})
		.from(approvalDecisions)
		.where(
			and(
				eq(approvalDecisions.requestId, req.id),
				eq(approvalDecisions.step, req.currentStep),
			),
		);
	// Je Stufe entscheidet eine Person nur einmal (auch bei „alle“)
	if (before.some((d) => d.approverUserId === ctx.userId))
		return { ok: false, error: "already_decided" };
	// Stelle, für die die Zustimmung zählt: erste noch offene, die die
	// Person (oder die vertretene Person) erfüllt. Bei „alle“ zählt eine
	// schon erfüllte Stelle nicht noch einmal.
	const open = openRules(step, before);
	if (step.mode === "all" && !elig.rules.some((r) => open.includes(r)))
		return { ok: false, error: "already_decided" };
	const rule = elig.rules.find((r) => open.includes(r)) ?? elig.rules[0];

	await tx.insert(approvalDecisions).values({
		organizationId: ctx.orgId,
		requestId: req.id,
		step: req.currentStep,
		approverUserId: ctx.userId,
		rule: rule ?? null,
		decision: input.decision,
		note:
			[
				input.note?.trim(),
				elig.via === "delegation"
					? `(in Vertretung für ${elig.onBehalfOf})`
					: null,
			]
				.filter(Boolean)
				.join(" ") || null,
	});
	const decisionsOnStep = await tx
		.select({
			decision: approvalDecisions.decision,
			rule: approvalDecisions.rule,
			approverUserId: approvalDecisions.approverUserId,
		})
		.from(approvalDecisions)
		.where(
			and(
				eq(approvalDecisions.requestId, req.id),
				eq(approvalDecisions.step, req.currentStep),
			),
		);
	const outcome = advance(steps, req.currentStep, decisionsOnStep);

	if (outcome.status === "pending") {
		const nextStep = steps.find((s) => s.order === outcome.nextStep) ?? step;
		await tx
			.update(approvalRequests)
			.set({
				currentStep: outcome.nextStep,
				dueAt:
					outcome.nextStep !== req.currentStep
						? slaDueAt(nextStep, new Date())
						: req.dueAt,
			})
			.where(eq(approvalRequests.id, req.id));
		if (outcome.nextStep !== req.currentStep) {
			const nextEligible = eligibleApprovers(nextStep, candidates, {
				requesterUserId: req.requestedByUserId,
				entityOwnerUserId,
				delegations: dels,
			});
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: nextEligible.map((e) => e.userId),
				actorUserId: ctx.userId,
				kind: "approval_requested",
				title: `Freigabe angefragt (Stufe ${outcome.nextStep}): ${wf.name}`,
				link: `/heute/freigaben?request=${req.id}`,
			});
		}
	} else {
		await tx
			.update(approvalRequests)
			.set({ status: outcome.status, decidedAt: new Date() })
			.where(eq(approvalRequests.id, req.id));
	}
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: [req.requestedByUserId],
		actorUserId: ctx.userId,
		kind: "approval_decided",
		title: `${ctx.name}: ${input.decision === "approved" ? "freigegeben" : input.decision === "rejected" ? "abgelehnt" : "Änderungen angefragt"} — ${wf.name}`,
		body: input.note?.trim() || undefined,
		link: `/heute/freigaben?request=${req.id}`,
	});
	return {
		ok: true,
		status: outcome.status,
		requesterUserId: req.requestedByUserId,
		entityType: req.entityType,
		entityId: req.entityId,
		onBehalfOf: elig.via === "delegation" ? elig.onBehalfOf : undefined,
		trigger: triggerOf(wf),
	};
}

export async function withdraw(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	requestId: string,
): Promise<boolean> {
	const res = await tx
		.update(approvalRequests)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(
			and(
				eq(approvalRequests.id, requestId),
				eq(approvalRequests.organizationId, ctx.orgId),
				eq(approvalRequests.requestedByUserId, ctx.userId),
				eq(approvalRequests.status, "pending"),
			),
		)
		.returning({ id: approvalRequests.id });
	return res.length > 0;
}

export type PendingForUser = {
	id: string;
	kind: string;
	workflowName: string;
	entityType: EntityKind;
	entityId: string;
	requestedByUserId: string | null;
	requestedByName: string | null;
	requestedAt: Date;
	currentStep: number;
	dueAt: Date | null;
	overdue: boolean;
	eligible: boolean;
	mine: boolean;
	status: string;
	// Schnappschuss der Stufen und Entscheidungen (Anzeige des Ablaufs)
	steps: ApprovalStep[];
	decisions: {
		step: number;
		decision: "approved" | "rejected" | "changes_requested";
		rule: string | null;
		approverUserId: string | null;
	}[];
};

// Posteingang: wartet auf mich · von mir angefragt · überfällig.
export async function listRequestsForUser(
	tx: OrgTx,
	orgId: string,
	userId: string,
	opts: { includeDecided?: boolean } = {},
): Promise<PendingForUser[]> {
	const rows = await tx
		.select({
			req: approvalRequests,
			kind: approvalWorkflows.kind,
			workflowName: approvalWorkflows.name,
			steps: approvalWorkflows.steps,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			opts.includeDecided
				? eq(approvalRequests.organizationId, orgId)
				: and(
						eq(approvalRequests.organizationId, orgId),
						eq(approvalRequests.status, "pending"),
					),
		)
		.orderBy(desc(approvalRequests.requestedAt))
		.limit(200);
	const candidates = await loadCandidates(tx, orgId);
	const me = candidates.find((c) => c.userId === userId);
	const dels = await activeDelegations(tx, orgId);
	const requesterIds = [
		...new Set(
			rows
				.map((r) => r.req.requestedByUserId)
				.filter((x): x is string => Boolean(x)),
		),
	];
	const names = new Map(
		requesterIds.length === 0
			? []
			: (
					await tx
						.select({ id: user.id, name: user.name, email: user.email })
						.from(user)
						.where(inArray(user.id, requesterIds))
				).map((u) => [u.id, u.name || u.email] as const),
	);
	const owners = await entityOwnersOf(
		tx,
		orgId,
		rows
			.filter((r) => r.req.status === "pending")
			.map((r) => ({ entityType: r.req.entityType, entityId: r.req.entityId })),
	);
	const decisions =
		rows.length === 0
			? []
			: await tx
					.select({
						requestId: approvalDecisions.requestId,
						step: approvalDecisions.step,
						decision: approvalDecisions.decision,
						rule: approvalDecisions.rule,
						approverUserId: approvalDecisions.approverUserId,
					})
					.from(approvalDecisions)
					.where(
						and(
							eq(approvalDecisions.organizationId, orgId),
							inArray(
								approvalDecisions.requestId,
								rows.map((r) => r.req.id),
							),
						),
					)
					.orderBy(approvalDecisions.decidedAt);
	const now = new Date();
	return rows.map(({ req, kind, workflowName, steps: wfSteps }) => {
		const steps = requestSteps(req, wfSteps);
		const step = steps.find((s) => s.order === req.currentStep);
		const own = decisions
			.filter((d) => d.requestId === req.id)
			.map(({ requestId: _r, ...d }) => d);
		const eligible =
			req.status === "pending" && step && me
				? canDecideNow(
						step,
						me,
						{
							requesterUserId: req.requestedByUserId,
							entityOwnerUserId:
								owners.get(ownerKey(req.entityType, req.entityId)) ?? null,
							delegations: dels,
						},
						candidates,
						own.filter((d) => d.step === req.currentStep),
					)
				: false;
		return {
			status: req.status,
			steps,
			decisions: own,
			id: req.id,
			kind,
			workflowName,
			entityType: req.entityType,
			entityId: req.entityId,
			requestedByUserId: req.requestedByUserId,
			requestedByName: req.requestedByUserId
				? (names.get(req.requestedByUserId) ?? null)
				: null,
			requestedAt: req.requestedAt,
			currentStep: req.currentStep,
			dueAt: req.dueAt,
			overdue:
				req.status === "pending" && req.dueAt !== null && req.dueAt < now,
			eligible,
			mine: req.requestedByUserId === userId,
		};
	});
}

export async function latestRequestFor(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityId: string,
) {
	const [row] = await tx
		.select({
			req: approvalRequests,
			workflowName: approvalWorkflows.name,
			steps: approvalWorkflows.steps,
		})
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, entityType),
				eq(approvalRequests.entityId, entityId),
			),
		)
		.orderBy(desc(approvalRequests.requestedAt))
		.limit(1);
	if (!row) return null;
	const decisions = await tx
		.select()
		.from(approvalDecisions)
		.where(eq(approvalDecisions.requestId, row.req.id))
		.orderBy(approvalDecisions.decidedAt);
	return {
		...row.req,
		workflowName: row.workflowName,
		steps: requestSteps(row.req, row.steps),
		decisions,
	};
}

// Stand offener Anträge je Entität (Anzeige „wartet auf die
// Geschäftsleitung, 1 von 2“): Zustimmungen auf der aktuellen Stufe inkl.
// der mit dem Antrag gegebenen gegen die nötigen Stellen.
export async function approvalProgressFor(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityIds: readonly string[],
): Promise<Map<string, { done: number; total: number }>> {
	const out = new Map<string, { done: number; total: number }>();
	if (entityIds.length === 0) return out;
	const rows = await tx
		.select({ req: approvalRequests, wfSteps: approvalWorkflows.steps })
		.from(approvalRequests)
		.innerJoin(
			approvalWorkflows,
			eq(approvalWorkflows.id, approvalRequests.workflowId),
		)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, entityType),
				eq(approvalRequests.status, "pending"),
				inArray(approvalRequests.entityId, [...entityIds]),
			),
		);
	if (rows.length === 0) return out;
	const decisions = await tx
		.select({
			requestId: approvalDecisions.requestId,
			step: approvalDecisions.step,
			decision: approvalDecisions.decision,
		})
		.from(approvalDecisions)
		.where(
			inArray(
				approvalDecisions.requestId,
				rows.map((r) => r.req.id),
			),
		);
	for (const { req, wfSteps } of rows) {
		const step = requestSteps(req, wfSteps).find(
			(s) => s.order === req.currentStep,
		);
		if (!step) continue;
		const given = step.given?.length ?? 0;
		const rules =
			step.mode === "all"
				? (step.approvers?.length ?? 1)
				: (step.minApprovers ?? 1);
		const done = decisions.filter(
			(d) =>
				d.requestId === req.id &&
				d.step === req.currentStep &&
				d.decision === "approved",
		).length;
		out.set(req.entityId, { done: done + given, total: rules + given });
	}
	return out;
}
