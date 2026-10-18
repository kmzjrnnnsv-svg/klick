"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { member } from "@/db/auth-schema";
import {
	approvalRequests,
	approvalWorkflows,
	orgRoles,
	orgSettings,
} from "@/db/schema";
import type { ApprovalStep } from "@/db/schema/grc";
import { safeAction } from "@/lib/actions/safe";
import { checkWorkflowDraft, type DraftIssue } from "@/lib/approvals/designer";
import { PRESET_BY_KEY, resolvePresetSteps } from "@/lib/approvals/presets";
import {
	matchConditions,
	normalizeSteps,
	planRoute,
	type RouteWarning,
} from "@/lib/approvals/route";
import { eligibleApprovers, stepRules } from "@/lib/approvals/rules";
import {
	activeDelegations,
	ensureOrgWorkflows,
	loadCandidates,
} from "@/lib/approvals/service";
import { TRIGGER_BY_KEY, triggerOf } from "@/lib/approvals/triggers";
import type { AuditInput } from "@/lib/audit";
import {
	AuthError,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { sanitizePermissions } from "@/lib/auth/permission-catalog";
import { userNames } from "@/lib/compliance/queries";
import { mutateOrg, type OrgTx, readOrg } from "@/lib/db/with-org";
import { listOrgRoles } from "@/lib/org/roles";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	applyPresetSchema,
	deleteWorkflowSchema,
	dryRunSchema,
	workflowSchema,
	type workflowStepSchema,
} from "@/lib/validation/workflows";

// Freigabe-Designer (Einstellungen → Freigaben): nur Inhaber:innen, Speichern
// mit frischer Bestätigung, Audit settings.workflow mit before/after. Laufende
// Anträge behalten ihren Schnappschuss (approval_requests.steps).

const PATH = "/einstellungen";

async function stepUp() {
	try {
		return await requireStepUp({ settings: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required") return null;
		throw e;
	}
}

function toSteps(
	steps: readonly z.output<typeof workflowStepSchema>[],
): ApprovalStep[] {
	return normalizeSteps(
		steps.map((s, i) => ({
			order: i + 1,
			approverRule: s.approvers[0] ?? "",
			approvers: s.approvers,
			mode: s.mode,
			minApprovers: s.minApprovers,
			slaDays: s.slaDays,
			label: s.label,
			skipIf: s.skipIf,
			onlyIf: s.onlyIf,
		})),
	);
}

async function knownStellen(tx: OrgTx, orgId: string) {
	const [roles, members] = await Promise.all([
		listOrgRoles(tx, orgId),
		tx
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, orgId)),
	]);
	return {
		roles,
		known: {
			roleIds: new Set(roles.map((r) => r.id)),
			userIds: new Set(members.map((m) => m.userId)),
		},
	};
}

function issuesResult(issues: DraftIssue[]): ActionResult<never> {
	const fieldErrors: Record<string, string[]> = {};
	for (const i of issues)
		fieldErrors[i.path] = [...(fieldErrors[i.path] ?? []), i.code];
	return { ok: false, error: "invalid", fieldErrors };
}

function snapshot(w: typeof approvalWorkflows.$inferSelect) {
	return {
		name: w.name,
		enabled: w.enabled,
		conditions: w.conditions,
		priority: w.priority,
		steps: w.steps,
	};
}

async function saveWorkflowImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await stepUp();
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = workflowSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			let before: typeof approvalWorkflows.$inferSelect | undefined;
			if (d.id) {
				[before] = await tx
					.select()
					.from(approvalWorkflows)
					.where(
						and(
							eq(approvalWorkflows.id, d.id),
							eq(approvalWorkflows.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
			}
			// Auslöser eines bestehenden Ablaufs ändert sich nie
			const trigger = before ? triggerOf(before) : d.trigger;
			const def = trigger ? TRIGGER_BY_KEY.get(trigger) : undefined;
			if (!trigger || !def)
				return { result: { ok: false, error: "unknown_trigger" }, audit: [] };
			const steps = toSteps(d.steps);
			const { known } = await knownStellen(tx, c.orgId);
			const issues = checkWorkflowDraft(
				{ trigger, conditions: d.conditions, steps },
				known,
			);
			if (issues.length > 0) return { result: issuesResult(issues), audit: [] };
			const custom = before ? before.custom : true;
			const values = {
				name: d.name,
				description: d.description || null,
				enabled: d.enabled,
				conditions: d.conditions,
				// nur Varianten haben eine Priorität; der Standard gilt zuletzt
				priority: custom ? d.priority : 0,
				steps,
			};
			let id = before?.id;
			let kind = before?.kind;
			if (before) {
				await tx
					.update(approvalWorkflows)
					.set({ ...values, trigger })
					.where(eq(approvalWorkflows.id, before.id));
			} else {
				kind = `custom_${randomUUID().slice(0, 8)}`;
				const [row] = await tx
					.insert(approvalWorkflows)
					.values({
						organizationId: c.orgId,
						entityType: def.entityType,
						kind,
						trigger,
						custom: true,
						...values,
					})
					.returning({ id: approvalWorkflows.id });
				if (!row) throw new Error("insert failed");
				id = row.id;
			}
			return {
				result: { ok: true, data: { id: id as string } },
				audit: {
					action: "settings.workflow",
					target: `approval_workflow:${kind}`,
					before: before ? snapshot(before) : undefined,
					after: { trigger, ...values },
				},
			};
		},
	);
	revalidatePath(PATH, "layout");
	return res;
}

// Nur Varianten; mit Anträgen bleibt der Ablauf (Nachvollziehbarkeit) —
// dann ausschalten statt löschen.
async function deleteWorkflowImpl(input: unknown): Promise<ActionResult> {
	const c = await stepUp();
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = deleteWorkflowSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [w] = await tx
			.select()
			.from(approvalWorkflows)
			.where(
				and(
					eq(approvalWorkflows.id, parsed.data.id),
					eq(approvalWorkflows.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!w) return { result: { ok: false, error: "notFound" }, audit: [] };
		if (!w.custom)
			return { result: { ok: false, error: "notCustom" }, audit: [] };
		const [used] = await tx
			.select({ n: count() })
			.from(approvalRequests)
			.where(
				and(
					eq(approvalRequests.organizationId, c.orgId),
					eq(approvalRequests.workflowId, w.id),
				),
			);
		if ((used?.n ?? 0) > 0)
			return { result: { ok: false, error: "hasRequests" }, audit: [] };
		await tx.delete(approvalWorkflows).where(eq(approvalWorkflows.id, w.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "settings.workflow_delete",
				target: `approval_workflow:${w.kind}`,
				before: { trigger: w.trigger, ...snapshot(w) },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

// Vorlage anwenden: fehlende Rollen anlegen (ohne Mitglieder), dann Standard-
// Ablauf setzen bzw. Variante anlegen — eingeschaltet.
async function applyWorkflowPresetImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; createdRoles: string[] }>> {
	const c = await stepUp();
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = applyPresetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const preset = PRESET_BY_KEY.get(parsed.data.key);
	const def = preset ? TRIGGER_BY_KEY.get(preset.trigger) : undefined;
	if (!preset || !def) return { ok: false, error: "notFound" };
	const res = await mutateOrg<
		ActionResult<{ id: string; createdRoles: string[] }>
	>(toOrgCtx(c), async (tx) => {
		const [s] = await tx
			.select({ stage: orgSettings.licenceStage })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await ensureOrgWorkflows(tx, c.orgId, s?.stage ?? "0_vorbereitung");
		const roles = await listOrgRoles(tx, c.orgId);
		const roleIds: Record<string, string> = {};
		const createdRoles: string[] = [];
		const audit: AuditInput[] = [];
		for (const r of preset.roles) {
			const hit = roles.find(
				(x) => x.name.toLowerCase() === r.name.toLowerCase(),
			);
			if (hit) {
				roleIds[r.key] = hit.id;
				continue;
			}
			const permissions = sanitizePermissions(r.permissions);
			const [row] = await tx
				.insert(orgRoles)
				.values({
					organizationId: c.orgId,
					name: r.name,
					description: r.description,
					permissions,
					createdByUserId: c.userId,
				})
				.returning({ id: orgRoles.id });
			if (!row) throw new Error("insert failed");
			roleIds[r.key] = row.id;
			createdRoles.push(r.name);
			audit.push({
				action: "role.create",
				target: `org_role:${row.id}`,
				after: { name: r.name, permissions, via: `preset:${preset.key}` },
			});
		}
		const steps = normalizeSteps(resolvePresetSteps(preset, roleIds));
		let id: string;
		let kind: string;
		let before: ReturnType<typeof snapshot> | undefined;
		if (preset.variant) {
			kind = `custom_${randomUUID().slice(0, 8)}`;
			const [row] = await tx
				.insert(approvalWorkflows)
				.values({
					organizationId: c.orgId,
					entityType: def.entityType,
					kind,
					trigger: def.key,
					custom: true,
					name: preset.name,
					description: preset.description,
					conditions: preset.variant.conditions,
					priority: preset.variant.priority,
					steps,
					enabled: true,
				})
				.returning({ id: approvalWorkflows.id });
			if (!row) throw new Error("insert failed");
			id = row.id;
		} else {
			kind = def.kind;
			const [w] = await tx
				.select()
				.from(approvalWorkflows)
				.where(
					and(
						eq(approvalWorkflows.organizationId, c.orgId),
						eq(approvalWorkflows.kind, def.kind),
					),
				)
				.limit(1);
			if (!w) throw new Error("standard workflow missing");
			before = snapshot(w);
			await tx
				.update(approvalWorkflows)
				.set({ steps, enabled: true, description: preset.description })
				.where(eq(approvalWorkflows.id, w.id));
			id = w.id;
		}
		audit.push({
			action: "settings.workflow",
			target: `approval_workflow:${kind}`,
			before,
			after: { trigger: def.key, preset: preset.key, steps, enabled: true },
		});
		return { result: { ok: true, data: { id, createdRoles } }, audit };
	});
	revalidatePath(PATH, "layout");
	revalidatePath("/team");
	return res;
}

export type DryRunStep = {
	order: number;
	label: string | null;
	skipped: ApprovalStep["skipped"] | null;
	mode: "any" | "all";
	// mögliche Freigebende (Namen); bei „alle“ je Stelle
	approvers: string[];
	perRule: { rule: string; approvers: string[] }[];
};

// Probelauf: wer würde mit diesen Beispielwerten freigeben? Nur lesend.
async function dryRunWorkflowImpl(input: unknown): Promise<
	ActionResult<{
		applies: boolean;
		steps: DryRunStep[];
		warnings: RouteWarning[];
	}>
> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = dryRunSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const steps = toSteps(d.steps);
	return readOrg(toOrgCtx(c), async (tx) => {
		const candidates = await loadCandidates(tx, c.orgId);
		const ctx = {
			requesterUserId: d.requesterUserId,
			entityOwnerUserId: d.entityOwnerUserId || null,
			delegations: await activeDelegations(tx, c.orgId),
		};
		const route = planRoute(steps, {
			requester: candidates.find((x) => x.userId === d.requesterUserId) ?? null,
			facts: d.facts,
			candidates,
			ctx,
		});
		const names = await userNames(
			tx,
			candidates.map((x) => x.userId),
		);
		const nameOf = (ids: readonly { userId: string }[]) =>
			ids.map((x) => names.get(x.userId) ?? "—");
		return {
			ok: true,
			data: {
				applies: matchConditions(d.conditions, d.facts),
				warnings: route.warnings,
				steps: route.steps.map((s) => ({
					order: s.order,
					label: s.label ?? null,
					skipped: s.skipped ?? null,
					mode: s.mode === "all" ? "all" : "any",
					approvers: s.skipped
						? []
						: nameOf(eligibleApprovers(s, candidates, ctx)),
					perRule:
						s.mode === "all" && !s.skipped
							? stepRules(s).map((rule) => ({
									rule,
									approvers: nameOf(
										eligibleApprovers(
											{
												...s,
												approvers: [rule],
												approverRule: rule,
												mode: "any",
											},
											candidates,
											ctx,
										),
									),
								}))
							: [],
				})),
			},
		};
	});
}

export const saveWorkflow = safeAction("saveWorkflow", saveWorkflowImpl);
export const deleteWorkflow = safeAction("deleteWorkflow", deleteWorkflowImpl);
export const applyWorkflowPreset = safeAction(
	"applyWorkflowPreset",
	applyWorkflowPresetImpl,
);
export const dryRunWorkflow = safeAction("dryRunWorkflow", dryRunWorkflowImpl);
