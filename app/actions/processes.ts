"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	controls,
	documentProcesses,
	processAssets,
	processControls,
	processes,
	processProviders,
	processRaci,
	processRisks,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	applicableProcesses,
	raciValid,
} from "@/lib/compliance/catalog/processes";
import { nextRiskCode } from "@/lib/compliance/risk";
import { mutateOrg } from "@/lib/db/with-org";
import { PROCESS_STATUS } from "@/lib/entities/process";
import { canTransition } from "@/lib/entities/status-machine";
import { listOrgFrameworks } from "@/lib/org/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	applyProcessSeedSchema,
	processSchema,
	setProcessLinksSchema,
	setProcessRaciSchema,
	setProcessStatusSchema,
} from "@/lib/validation/governance";

async function upsertProcessImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ process: ["create", "update"] });
	const parsed = processSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { processId, code: wantedCode, ...d } = parsed.data;
	const out = await mutateOrg<ActionResult<{ id: string; code: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const values = {
				name: d.name,
				description: d.description ?? null,
				category: d.category,
				criticality: d.criticality,
				ownerUserId: d.ownerUserId ?? null,
				deputyUserId: d.deputyUserId ?? null,
				assigneeUserId: d.assigneeUserId ?? null,
				rtoHours: d.rtoHours ?? null,
				rpoHours: d.rpoHours ?? null,
				mtpdHours: d.mtpdHours ?? null,
				impactNotes: d.impactNotes ?? null,
				inputs: d.inputs ?? null,
				outputs: d.outputs ?? null,
				parentProcessId: d.parentProcessId ?? null,
				reviewAt: d.reviewAt ?? null,
			};
			if (processId) {
				const [before] = await tx
					.select()
					.from(processes)
					.where(
						and(
							eq(processes.id, processId),
							eq(processes.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(processes)
					.set(values)
					.where(eq(processes.id, processId));
				return {
					result: { ok: true, data: { id: processId, code: before.code } },
					audit: {
						action: "process.update",
						target: `process:${processId}`,
						before: {
							name: before.name,
							criticality: before.criticality,
							rtoHours: before.rtoHours,
							rpoHours: before.rpoHours,
							ownerUserId: before.ownerUserId,
						},
						after: {
							name: d.name,
							criticality: d.criticality,
							rtoHours: d.rtoHours ?? null,
							rpoHours: d.rpoHours ?? null,
							ownerUserId: d.ownerUserId ?? null,
						},
					},
				};
			}
			const existing = await tx
				.select({ code: processes.code })
				.from(processes)
				.where(eq(processes.organizationId, c.orgId));
			const codes = existing.map((x) => x.code);
			const code = wantedCode ?? nextRiskCode(codes, "P").replace(/^P-0/, "P-");
			if (codes.includes(code))
				return { result: { ok: false, error: "codeTaken" }, audit: [] };
			const [row] = await tx
				.insert(processes)
				.values({
					organizationId: c.orgId,
					code,
					...values,
					ownerUserId: values.ownerUserId ?? c.userId,
				})
				.returning({ id: processes.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id, code } },
				audit: {
					action: "process.create",
					target: `process:${row.id}`,
					after: { code, name: d.name, criticality: d.criticality },
				},
			};
		},
	);
	revalidatePath("/prozesse", "layout");
	return out;
}

// RACI ersetzen — genau ein A je Prozess (Regel aus dem Katalog).
async function setProcessRaciImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = setProcessRaciSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { processId, entries } = parsed.data;
	const check = raciValid(entries);
	if (!check.ok)
		return {
			ok: false,
			error:
				check.accountable === 0
					? "raci_no_accountable"
					: "raci_many_accountable",
		};
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [p] = await tx
			.select({ id: processes.id, code: processes.code })
			.from(processes)
			.where(
				and(eq(processes.id, processId), eq(processes.organizationId, c.orgId)),
			)
			.limit(1);
		if (!p) return { result: false, audit: [] };
		const before = await tx
			.select({
				userId: processRaci.userId,
				function: processRaci.function,
				raci: processRaci.raci,
			})
			.from(processRaci)
			.where(eq(processRaci.processId, processId));
		await tx.delete(processRaci).where(eq(processRaci.processId, processId));
		if (entries.length > 0) {
			await tx.insert(processRaci).values(
				entries.map((e) => ({
					organizationId: c.orgId,
					processId,
					userId: e.userId ?? null,
					function: e.function ?? null,
					raci: e.raci,
				})),
			);
		}
		return {
			result: true,
			audit: {
				action: "process.raci",
				target: `process:${processId}`,
				before: { raci: before },
				after: { raci: entries },
			},
		};
	});
	revalidatePath("/prozesse", "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

async function setProcessLinksImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = setProcessLinksSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const {
		processId,
		controlCodes,
		assetIds,
		providerIds,
		riskIds,
		documentIds,
	} = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [p] = await tx
			.select({ id: processes.id })
			.from(processes)
			.where(
				and(eq(processes.id, processId), eq(processes.organizationId, c.orgId)),
			)
			.limit(1);
		if (!p) return { result: false, audit: [] };
		if (controlCodes) {
			await tx
				.delete(processControls)
				.where(eq(processControls.processId, processId));
			if (controlCodes.length > 0) {
				const ids = await tx
					.select({ id: controls.id })
					.from(controls)
					.where(inArray(controls.code, controlCodes));
				if (ids.length > 0)
					await tx.insert(processControls).values(
						ids.map((x) => ({
							organizationId: c.orgId,
							processId,
							controlId: x.id,
						})),
					);
			}
		}
		if (assetIds) {
			await tx
				.delete(processAssets)
				.where(eq(processAssets.processId, processId));
			if (assetIds.length > 0)
				await tx.insert(processAssets).values(
					assetIds.map((assetId) => ({
						organizationId: c.orgId,
						processId,
						assetId,
					})),
				);
		}
		if (providerIds) {
			await tx
				.delete(processProviders)
				.where(eq(processProviders.processId, processId));
			if (providerIds.length > 0)
				await tx.insert(processProviders).values(
					providerIds.map((providerId) => ({
						organizationId: c.orgId,
						processId,
						providerId,
					})),
				);
		}
		if (riskIds) {
			await tx
				.delete(processRisks)
				.where(eq(processRisks.processId, processId));
			if (riskIds.length > 0)
				await tx.insert(processRisks).values(
					riskIds.map((riskId) => ({
						organizationId: c.orgId,
						processId,
						riskId,
					})),
				);
		}
		if (documentIds) {
			await tx
				.delete(documentProcesses)
				.where(eq(documentProcesses.processId, processId));
			if (documentIds.length > 0)
				await tx.insert(documentProcesses).values(
					documentIds.map((documentId) => ({
						organizationId: c.orgId,
						processId,
						documentId,
					})),
				);
		}
		return {
			result: true,
			audit: {
				action: "process.links",
				target: `process:${processId}`,
				after: {
					controlCodes: controlCodes ?? undefined,
					assets: assetIds?.length,
					providers: providerIds?.length,
					risks: riskIds?.length,
					documents: documentIds?.length,
				},
			},
		};
	});
	revalidatePath("/prozesse", "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

async function setProcessStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = setProcessStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { processId, status, note } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ id: processes.id, status: processes.status })
			.from(processes)
			.where(
				and(eq(processes.id, processId), eq(processes.organizationId, c.orgId)),
			)
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(PROCESS_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};
		await tx.update(processes).set({ status }).where(eq(processes.id, row.id));
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "process.status",
				target: `process:${row.id}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath("/prozesse", "layout");
	return res;
}

// Prozesslandkarte aus dem Katalog übernehmen (nur fehlende Codes), mit
// RACI-Funktionen und Control-Verknüpfungen.
async function applyProcessSeedImpl(
	input: unknown = {},
): Promise<ActionResult<{ created: string[] }>> {
	const c = await requireOrg({ process: ["create"] });
	const parsed = applyProcessSeedSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const only = parsed.data.codes ? new Set(parsed.data.codes) : null;
	const created = await mutateOrg<string[]>(toOrgCtx(c), async (tx) => {
		const fws = (await listOrgFrameworks(tx, c.orgId)).map((f) => f.slug);
		const existing = new Set(
			(
				await tx
					.select({ code: processes.code })
					.from(processes)
					.where(eq(processes.organizationId, c.orgId))
			).map((x) => x.code),
		);
		const seeds = applicableProcesses(fws).filter(
			(p) => !existing.has(p.code) && (!only || only.has(p.code)),
		);
		if (seeds.length === 0) return { result: [], audit: [] };
		const controlRows = await tx
			.select({ id: controls.id, code: controls.code })
			.from(controls)
			.where(
				inArray(controls.code, [...new Set(seeds.flatMap((s) => s.controls))]),
			);
		const controlId = new Map(controlRows.map((r) => [r.code, r.id]));
		const audits = [];
		const codes: string[] = [];
		for (const s of seeds) {
			const [row] = await tx
				.insert(processes)
				.values({
					organizationId: c.orgId,
					code: s.code,
					name: s.name,
					description: s.description,
					category: s.category,
					criticality: s.criticality,
					rtoHours: s.rtoHours ?? null,
					rpoHours: s.rpoHours ?? null,
					mtpdHours: s.mtpdHours ?? null,
					inputs: s.inputs ?? null,
					outputs: s.outputs ?? null,
					ownerUserId: c.userId,
					status: "draft",
				})
				.returning({ id: processes.id });
			if (!row) continue;
			if (s.raci.length > 0)
				await tx.insert(processRaci).values(
					s.raci.map((r) => ({
						organizationId: c.orgId,
						processId: row.id,
						function: r.function,
						raci: r.raci,
					})),
				);
			const ids = s.controls
				.map((code) => controlId.get(code))
				.filter((x): x is string => Boolean(x));
			if (ids.length > 0)
				await tx.insert(processControls).values(
					ids.map((id) => ({
						organizationId: c.orgId,
						processId: row.id,
						controlId: id,
					})),
				);
			codes.push(s.code);
			audits.push({
				action: "process.create",
				target: `process:${row.id}`,
				after: { code: s.code, name: s.name, source: "catalog" },
			});
		}
		return { result: codes, audit: audits };
	});
	revalidatePath("/prozesse", "layout");
	return { ok: true, data: { created } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertProcess = safeAction("upsertProcess", upsertProcessImpl);
export const setProcessRaci = safeAction("setProcessRaci", setProcessRaciImpl);
export const setProcessLinks = safeAction(
	"setProcessLinks",
	setProcessLinksImpl,
);
export const setProcessStatus = safeAction(
	"setProcessStatus",
	setProcessStatusImpl,
);
export const applyProcessSeed = safeAction(
	"applyProcessSeed",
	applyProcessSeedImpl,
);
