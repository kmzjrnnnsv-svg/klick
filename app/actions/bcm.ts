"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { processes } from "@/db/schema";
import type { ProcessBia } from "@/db/schema/registers";
import { safeAction } from "@/lib/actions/safe";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeBia, suggestTargets } from "@/lib/bcm/bia";
import { levelCount } from "@/lib/compliance/risk-method";
import { mutateOrg } from "@/lib/db/with-org";
import { orgRiskMethod } from "@/lib/org/queries";
import { saveBiaSchema } from "@/lib/validation/bcm";
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
