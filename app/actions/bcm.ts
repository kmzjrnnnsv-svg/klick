"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { bcmPlans, processes } from "@/db/schema";
import type { ProcessBia } from "@/db/schema/registers";
import { safeAction } from "@/lib/actions/safe";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeBia, suggestTargets } from "@/lib/bcm/bia";
import {
	normalizePlan,
	planIssues,
	releasable,
	reviewDate,
} from "@/lib/bcm/plan";
import { levelCount } from "@/lib/compliance/risk-method";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { orgRiskMethod } from "@/lib/org/queries";
import {
	releaseBcmPlanSchema,
	saveBcmPlanSchema,
	saveBiaSchema,
} from "@/lib/validation/bcm";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Notfallmanagement: Aktionen rund um BIA, Notfallpläne und Übungen.

type SaveBiaResult = ActionResult<{
	code: string;
	adopted: boolean;
	approvalPending: boolean;
}>;

// Geführte BIA speichern; mit adopt übernimmt der Prozess den Vorschlag
// (RTO, RPO, MTPD, auf Wunsch Kritikalität). Der Vorschlag wird hier neu
// gerechnet, nie aus der Eingabe übernommen.
async function saveProcessBiaImpl(input: unknown): Promise<SaveBiaResult> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = saveBiaSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	let out: SaveBiaResult;
	try {
		out = await mutateOrg<SaveBiaResult>(toOrgCtx(c), async (tx) => {
			const [before] = await tx
				.select({
					id: processes.id,
					code: processes.code,
					name: processes.name,
					status: processes.status,
					criticality: processes.criticality,
					ownerUserId: processes.ownerUserId,
					rtoHours: processes.rtoHours,
					rpoHours: processes.rpoHours,
					mtpdHours: processes.mtpdHours,
				})
				.from(processes)
				.where(
					and(
						eq(processes.id, d.processId),
						eq(processes.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const method = await orgRiskMethod(tx, c.orgId);
			const levels = levelCount(method);
			const clean = normalizeBia(
				{
					v: 1,
					steps: d.steps,
					threshold: d.threshold,
					impacts: d.impacts,
					dataLossHours: d.dataLossHours ?? null,
					notes: d.notes ?? null,
				},
				method.dimensions,
				levels,
			);
			if (clean.steps.length < 2)
				return { result: { ok: false, error: "invalid" }, audit: [] };
			const bia: ProcessBia = {
				...clean,
				assessedAt: new Date().toISOString(),
				assessedBy: c.userId,
			};
			const s = suggestTargets(bia, method.dimensions);
			const targets: {
				mtpdHours?: number | null;
				rtoHours?: number | null;
				rpoHours?: number | null;
				criticality?: typeof s.criticality;
			} = d.adopt
				? {
						mtpdHours: s.mtpdHours,
						rtoHours: s.rtoHours,
						// ohne Angabe zum Datenverlust bleibt das bisherige RPO
						...(s.rpoHours !== null ? { rpoHours: s.rpoHours } : {}),
						...(d.adoptCriticality ? { criticality: s.criticality } : {}),
					}
				: {};
			await tx
				.update(processes)
				.set({ bia, ...targets })
				.where(eq(processes.id, before.id));
			// Neue Zielzeiten an einem aktiven Prozess sind eine Änderung wie
			// im Formular (Freigabe-Designer, Auslöser process.change)
			let approvalPending = false;
			if (d.adopt && before.status === "active") {
				const gate = await gateApproval(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					{
						trigger: "process.change",
						entityType: "process",
						entityId: before.id,
						entityOwnerUserId: before.ownerUserId,
						title: `Prozess geändert: ${before.code} · ${before.name}`,
						link: `/prozesse/${before.code}`,
						facts: {
							criticality: targets.criticality ?? before.criticality,
						},
					},
				);
				if (gate.status === "error") throw new GateBlocked(gate.error);
				approvalPending = gate.status === "pending";
			}
			return {
				result: {
					ok: true,
					data: { code: before.code, adopted: d.adopt, approvalPending },
				},
				audit: {
					action: "process.bia_saved",
					target: `process:${before.id}`,
					before: {
						rtoHours: before.rtoHours,
						rpoHours: before.rpoHours,
						mtpdHours: before.mtpdHours,
						criticality: before.criticality,
					},
					after: {
						steps: bia.steps,
						threshold: bia.threshold,
						adopted: d.adopt,
						rtoHours: targets.rtoHours ?? before.rtoHours,
						rpoHours: targets.rpoHours ?? before.rpoHours,
						mtpdHours: targets.mtpdHours ?? before.mtpdHours,
						criticality: targets.criticality ?? before.criticality,
					},
				},
			};
		});
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
	revalidatePath("/prozesse", "layout");
	revalidatePath("/testprogramm");
	return out;
}

export const saveProcessBia = safeAction("saveProcessBia", saveProcessBiaImpl);

// ── Notfallplan je Prozess (N3) ────────────────────────────────────────────

async function processOf(tx: OrgTx, orgId: string, processId: string) {
	const [p] = await tx
		.select({
			id: processes.id,
			code: processes.code,
			rtoHours: processes.rtoHours,
		})
		.from(processes)
		.where(
			and(eq(processes.id, processId), eq(processes.organizationId, orgId)),
		)
		.limit(1);
	return p ?? null;
}

// Plan speichern; ein freigegebener Plan gilt danach wieder als Entwurf, bis
// er erneut freigegeben ist (die Fassung zählt erst mit der Freigabe hoch)
async function saveBcmPlanImpl(
	input: unknown,
): Promise<ActionResult<{ code: string }>> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = saveBcmPlanSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const content = normalizePlan(parsed.data.content);
	const res = await mutateOrg<ActionResult<{ code: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const p = await processOf(tx, c.orgId, parsed.data.processId);
			if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			const [before] = await tx
				.select({ id: bcmPlans.id, status: bcmPlans.status })
				.from(bcmPlans)
				.where(
					and(
						eq(bcmPlans.organizationId, c.orgId),
						eq(bcmPlans.processId, p.id),
					),
				)
				.limit(1);
			const now = new Date();
			let id = before?.id;
			if (before) {
				await tx
					.update(bcmPlans)
					.set({
						content,
						status: "draft",
						updatedBy: c.userId,
						updatedAt: now,
					})
					.where(eq(bcmPlans.id, before.id));
			} else {
				const [row] = await tx
					.insert(bcmPlans)
					.values({
						organizationId: c.orgId,
						processId: p.id,
						content,
						updatedBy: c.userId,
					})
					.returning({ id: bcmPlans.id });
				id = row?.id;
			}
			return {
				result: { ok: true, data: { code: p.code } },
				audit: {
					action: "bcm_plan.saved",
					target: `process:${p.id}`,
					before: before ? { status: before.status } : null,
					after: {
						planId: id ?? null,
						status: "draft",
						alert: content.alert.length,
						recovery: content.recovery.length,
						contacts: content.contacts.length,
					},
				},
			};
		},
	);
	revalidatePath("/prozesse", "layout");
	return res;
}

// Freigeben: nur ohne Lücken (Auslöser, Alarmierung, Wiederanlauf), Fassung
// hoch, Überprüfung in zwölf Monaten
async function releaseBcmPlanImpl(
	input: unknown,
): Promise<ActionResult<{ version: number }>> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = releaseBcmPlanSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult<{ version: number }>>(
		toOrgCtx(c),
		async (tx) => {
			const p = await processOf(tx, c.orgId, parsed.data.processId);
			if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			const [plan] = await tx
				.select()
				.from(bcmPlans)
				.where(
					and(
						eq(bcmPlans.organizationId, c.orgId),
						eq(bcmPlans.processId, p.id),
					),
				)
				.limit(1);
			if (!plan) return { result: { ok: false, error: "notFound" }, audit: [] };
			const now = new Date();
			const issues = planIssues(plan.content, p, null, now.toISOString());
			if (!releasable(issues))
				return { result: { ok: false, error: "plan_incomplete" }, audit: [] };
			if (plan.status === "released")
				return {
					result: { ok: true, data: { version: plan.version } },
					audit: [],
				};
			const version = plan.version + 1;
			await tx
				.update(bcmPlans)
				.set({
					status: "released",
					version,
					releasedAt: now,
					releasedBy: c.userId,
					reviewAt: reviewDate(now),
					updatedAt: now,
				})
				.where(eq(bcmPlans.id, plan.id));
			return {
				result: { ok: true, data: { version } },
				audit: {
					action: "bcm_plan.released",
					target: `process:${p.id}`,
					before: { status: plan.status, version: plan.version },
					after: { status: "released", version, reviewAt: reviewDate(now) },
				},
			};
		},
	);
	revalidatePath("/prozesse", "layout");
	return res;
}

export const saveBcmPlan = safeAction("saveBcmPlan", saveBcmPlanImpl);
export const releaseBcmPlan = safeAction("releaseBcmPlan", releaseBcmPlanImpl);
