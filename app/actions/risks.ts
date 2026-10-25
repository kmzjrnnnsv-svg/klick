"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	assets,
	controls,
	exceptions,
	lossEvents,
	orgSettings,
	processes,
	processRisks,
	providers,
	riskAssets,
	riskControls,
	risks,
} from "@/db/schema";
import type { FunctionKey } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval, requestApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	ownerColumns,
	resolveResponsible,
} from "@/lib/compliance/function-holders-service";
import { loadRiskSource } from "@/lib/compliance/queries-risk-sources";
import { assessRisk, nextRiskCode } from "@/lib/compliance/risk";
import { damageFrom } from "@/lib/compliance/risk-method";
import {
	acceptRisk,
	insertTreatment,
	notifyAboveAppetite,
	plusMonths,
} from "@/lib/compliance/risk-service";
import { RISK_SOURCE_KINDS } from "@/lib/compliance/risk-sources";
import { mutateOrg } from "@/lib/db/with-org";
import { RISK_STATUS } from "@/lib/entities/risk";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import { getOrgSettings, orgRiskMethod } from "@/lib/org/queries";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import {
	createExceptionSchema,
	createLossEventSchema,
	createRiskSchema,
	createTreatmentSchema,
	type GuidedRiskInput,
	guidedRiskSchema,
	setRiskStatusSchema,
	updateRiskSchema,
} from "@/lib/validation/registers";

async function riskSettingsFor(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
) {
	const s = await getOrgSettings(tx, orgId);
	return {
		method: await orgRiskMethod(tx, orgId, s),
		reviewDefaults: s?.reviewDefaults ?? null,
	};
}

async function createRiskImpl(
	input: unknown,
): Promise<
	ActionResult<{ id: string; code: string; approvalPending: boolean }>
> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	let out: { id: string; code: string; approvalPending: boolean };
	try {
		out = await mutateOrg(toOrgCtx(c), async (tx) => {
			const existing = await tx
				.select({ code: risks.code })
				.from(risks)
				.where(eq(risks.organizationId, c.orgId));
			const code = nextRiskCode(existing.map((r) => r.code));
			const settings = await riskSettingsFor(tx, c.orgId);
			const owner = await ownerColumns(tx, c.orgId, d.ownerUserId, c.userId);
			const [row] = await tx
				.insert(risks)
				.values({
					organizationId: c.orgId,
					code,
					title: d.title,
					description: d.description ?? null,
					category: d.category,
					likelihood: d.likelihood,
					impact: d.impact,
					...owner,
					reviewAt: plusMonths(settings.reviewDefaults?.risk ?? 3),
				})
				.returning({ id: risks.id });
			if (!row) throw new Error("insert failed");
			const a = assessRisk(
				{ id: row.id, likelihood: d.likelihood, impact: d.impact },
				settings.method,
			);
			// Freigabe-Designer: Aufnahme kann eine Freigabe verlangen
			const gate = await gateApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					trigger: "risk.create",
					entityType: "risk",
					entityId: row.id,
					entityOwnerUserId: owner.ownerUserId,
					title: `Risiko aufnehmen: ${code} · ${d.title}`,
					link: `/risiken/${row.id}`,
					facts: { riskCategory: d.category, score: a.effective.score },
				},
			);
			if (gate.status === "error")
				throw new GateBlocked(gate.error, gate.warnings);
			if (gate.status === "pending")
				await tx
					.update(risks)
					.set({ status: "proposed" })
					.where(eq(risks.id, row.id));
			if (a.aboveAppetite && gate.status !== "pending") {
				await notify(tx, {
					orgId: c.orgId,
					recipients: [owner.ownerUserId],
					actorUserId: null,
					kind: "risk_above_appetite",
					title: `${code} liegt über dem Risikoappetit (${a.effective.cls.label}, Wert ${a.effective.score})`,
					link: `/risiken/${row.id}`,
				});
			}
			return {
				result: {
					id: row.id,
					code,
					approvalPending: gate.status === "pending",
				},
				audit: {
					action: "risk.create",
					target: `risk:${row.id}`,
					after: {
						code,
						title: d.title,
						likelihood: d.likelihood,
						impact: d.impact,
						category: d.category,
						approvalPending: gate.status === "pending",
					},
				},
			};
		});
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
	revalidatePath("/risiken");
	return { ok: true, data: out };
}

async function updateRiskImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = updateRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { riskId, controlCodes, assetIds, ...patch } = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(risks)
			.where(and(eq(risks.id, riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!before) return { result: false, audit: [] };
		const { ownerUserId: ownerRef, ...rest } = patch;
		const set: Partial<typeof risks.$inferInsert> = {};
		for (const [k, v] of Object.entries(rest))
			if (v !== undefined) (set as Record<string, unknown>)[k] = v;
		const owner = await resolveResponsible(
			tx,
			c.orgId,
			ownerRef,
			before.ownerUserId,
		);
		if (owner) Object.assign(set, owner);
		// Schadenshöhe von Hand geändert → Einzelwerte passen nicht mehr
		if (
			set.impact !== undefined &&
			set.impact !== before.impact &&
			before.impactDetail
		)
			set.impactDetail = null;
		if (Object.keys(set).length > 0)
			await tx.update(risks).set(set).where(eq(risks.id, riskId));
		if (controlCodes) {
			await tx.delete(riskControls).where(eq(riskControls.riskId, riskId));
			if (controlCodes.length > 0) {
				const ids = await tx
					.select({ id: controls.id })
					.from(controls)
					.where(inArrayCodes(controlCodes));
				if (ids.length > 0)
					await tx
						.insert(riskControls)
						.values(
							ids.map((x) => ({
								organizationId: c.orgId,
								riskId,
								controlId: x.id,
							})),
						)
						.onConflictDoNothing();
			}
		}
		if (assetIds) {
			await tx.delete(riskAssets).where(eq(riskAssets.riskId, riskId));
			if (assetIds.length > 0)
				await tx
					.insert(riskAssets)
					.values(
						assetIds.map((assetId) => ({
							organizationId: c.orgId,
							riskId,
							assetId,
						})),
					)
					.onConflictDoNothing();
		}
		const settings = await riskSettingsFor(tx, c.orgId);
		const merged = { ...before, ...set };
		const a = assessRisk(
			{
				id: riskId,
				likelihood: merged.likelihood,
				impact: merged.impact,
				residualLikelihood: merged.residualLikelihood,
				residualImpact: merged.residualImpact,
			},
			settings.method,
		);
		const wasAbove = assessRisk(
			{
				id: riskId,
				likelihood: before.likelihood,
				impact: before.impact,
				residualLikelihood: before.residualLikelihood,
				residualImpact: before.residualImpact,
			},
			settings.method,
		).aboveAppetite;
		if (a.aboveAppetite && !wasAbove) {
			await notify(tx, {
				orgId: c.orgId,
				recipients: [merged.ownerUserId],
				actorUserId: c.userId,
				kind: "risk_above_appetite",
				title: `${before.code} liegt über dem Risikoappetit (${a.effective.cls.label}, Wert ${a.effective.score})`,
				link: `/risiken/${riskId}`,
			});
		}
		return {
			result: true,
			audit: {
				action: "risk.update",
				target: `risk:${riskId}`,
				before: pick(before, Object.keys(set)),
				after: { ...set, controlCodes, assetIds },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/risiken", "layout");
	return { ok: true, data: undefined };
}

function inArrayCodes(codes: string[]) {
	return inArray(controls.code, codes);
}

function pick(obj: Record<string, unknown>, keys: string[]) {
	return Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));
}

async function setRiskStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = setRiskStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { riskId, status, note, selfApprovalReason } = parsed.data;
	// Akzeptieren ist ein eigenes Recht (eigene Rollen können es getrennt haben)
	if (status === "accepted" && !allows(c, { risk: ["accept"] }))
		return { ok: false, error: "forbidden" };
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(risks)
			.where(and(eq(risks.id, riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(RISK_STATUS, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};

		// Akzeptieren: gleiche Regeln wie im Assistenten (Stufen je
		// Risikoklasse, sonst Workflow über dem Appetit) — acceptRisk
		if (status === "accepted") {
			const settings = await riskSettingsFor(tx, c.orgId);
			const r = await acceptRisk(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				row,
				settings.method,
				{ selfApprovalReason },
			);
			if (r.status === "failed")
				return { result: { ok: false, error: r.error }, audit: [] };
			if (r.status === "pending")
				return {
					result: {
						ok: true,
						data: { status: row.status, approvalRequested: true },
					},
					audit: {
						action: "risk.acceptance_requested",
						target: `risk:${riskId}`,
						after: { requestId: r.requestId, note: note ?? null },
					},
				};
			if (note?.trim())
				await tx
					.update(risks)
					.set({
						description: `${row.description ?? ""}\n\n${note.trim()}`.trim(),
					})
					.where(eq(risks.id, riskId));
			return {
				result: {
					ok: true,
					data: { status: "accepted", approvalRequested: false },
				},
				audit: {
					action: r.selfApproved ? "approval.self_approved" : "risk.status",
					target: `risk:${riskId}`,
					before: { status: row.status },
					after: {
						status: "accepted",
						note: note ?? null,
						reason: selfApprovalReason ?? null,
						requestId: r.requestId ?? null,
					},
				},
			};
		}
		await tx
			.update(risks)
			.set({
				status,
				description: note?.trim()
					? `${row.description ?? ""}\n\n${note.trim()}`.trim()
					: row.description,
			})
			.where(eq(risks.id, riskId));
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "risk.status",
				target: `risk:${riskId}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath("/risiken", "layout");
	return res;
}

async function createTreatmentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = createTreatmentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [risk] = await tx
			.select({ code: risks.code, title: risks.title, status: risks.status })
			.from(risks)
			.where(and(eq(risks.id, d.riskId), eq(risks.organizationId, c.orgId)))
			.limit(1);
		if (!risk) throw new Error("notFound");
		const { treatmentId, taskId } = await insertTreatment(tx, c, {
			riskId: d.riskId,
			riskCode: risk.code,
			title: d.title,
			description: d.description ?? null,
			ownerUserId: d.ownerUserId ?? null,
			dueAt: d.dueAt ?? null,
			costEur: d.costEur ?? null,
		});
		if (risk.status === "open")
			await tx
				.update(risks)
				.set({ status: "in_treatment" })
				.where(eq(risks.id, d.riskId));
		return {
			result: treatmentId,
			audit: {
				action: "risk.treatment",
				target: `risk:${d.riskId}`,
				after: {
					title: d.title,
					dueAt: d.dueAt ?? null,
					costEur: d.costEur ?? null,
					taskId,
				},
			},
		};
	});
	revalidatePath("/risiken", "layout");
	return { ok: true, data: { id } };
}

// ── Risiko-Assistent ──────────────────────────────────────────────────────
type GuidedResult = {
	id: string;
	code: string;
	acceptance: "accepted" | "pending" | "failed" | null;
	acceptanceError?: string;
	// Aufnahme wartet auf Freigabe (Auslöser risk.create)
	intakePending?: boolean;
};

async function saveGuided(
	c: Awaited<ReturnType<typeof requireOrg>>,
	d: GuidedRiskInput,
): Promise<ActionResult<GuidedResult>> {
	const res = await mutateOrg<ActionResult<GuidedResult>>(
		toOrgCtx(c),
		async (tx) => {
			const settings = await riskSettingsFor(tx, c.orgId);
			const method = settings.method;
			// Nur Schadensarten der Methode zählen; impact rechnet der Server.
			const known = new Set(method.dimensions.map((x) => x.key));
			const impactDetail = Object.fromEntries(
				Object.entries(d.impactDetail).filter(([k]) => known.has(k)),
			);
			const impact = damageFrom(impactDetail, method);
			if (impact === null)
				return {
					result: fail("Eingaben prüfen", {
						impactDetail: ["Mindestens eine aktive Schadensart bewerten."],
					}),
					audit: [],
				};
			const residual =
				d.residualLikelihood != null && d.residualImpact != null
					? {
							residualLikelihood: d.residualLikelihood,
							residualImpact: d.residualImpact,
						}
					: { residualLikelihood: null, residualImpact: null };
			const a = assessRisk(
				{ id: "x", likelihood: d.likelihood, impact, ...residual },
				method,
			);
			if (
				d.treatment === "accept" &&
				a.effective.zone !== "acceptable" &&
				(d.treatmentNote ?? "").trim().length < 10
			)
				return {
					result: fail("Eingaben prüfen", {
						treatmentNote: ["Begründe die Akzeptanz (mindestens 10 Zeichen)."],
					}),
					audit: [],
				};

			// Verknüpfungen nur innerhalb der Org (RLS) und des Katalogs.
			const ctrlRows =
				d.controlCodes.length > 0
					? await tx
							.select({ id: controls.id, code: controls.code })
							.from(controls)
							.where(inArray(controls.code, d.controlCodes))
					: [];
			const assetRows =
				d.assetIds.length > 0
					? await tx
							.select({ id: assets.id })
							.from(assets)
							.where(
								and(
									eq(assets.organizationId, c.orgId),
									inArray(assets.id, d.assetIds),
								),
							)
					: [];
			const processRows =
				d.processIds.length > 0
					? await tx
							.select({ id: processes.id })
							.from(processes)
							.where(
								and(
									eq(processes.organizationId, c.orgId),
									inArray(processes.id, d.processIds),
								),
							)
					: [];
			let providerId: string | null = null;
			if (d.providerId) {
				const [p] = await tx
					.select({ id: providers.id })
					.from(providers)
					.where(
						and(
							eq(providers.id, d.providerId),
							eq(providers.organizationId, c.orgId),
						),
					)
					.limit(1);
				providerId = p?.id ?? null;
			}

			// Herkunft nur, wenn die Quelle zur Org gehört (RLS + Prüfung)
			const source =
				d.sourceEntityType && d.sourceEntityId
					? await loadRiskSource(
							tx,
							c.orgId,
							d.sourceEntityType,
							d.sourceEntityId,
						)
					: null;

			const fields = {
				title: d.title,
				category: d.category,
				scenarioCode: d.scenarioCode ?? null,
				impactDetail,
				impactDescription: d.impactDescription?.trim() || null,
				existingMeasures: d.existingMeasures?.trim() || null,
				protectionGoals: d.protectionGoals,
				likelihood: d.likelihood,
				impact,
				treatment: d.treatment,
				treatmentNote: d.treatmentNote?.trim() || null,
				...residual,
				residualNote: d.residualNote?.trim() || null,
				providerId,
				assessedAt: new Date(),
			};

			let id: string;
			let code: string;
			let ownerUserId: string | null;
			let ownerFunction: FunctionKey | null;
			let before: Record<string, unknown> | null = null;
			let wasAbove = false;
			let status: string;
			if (d.riskId) {
				const [row] = await tx
					.select()
					.from(risks)
					.where(and(eq(risks.id, d.riskId), eq(risks.organizationId, c.orgId)))
					.limit(1);
				if (!row)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				id = row.id;
				code = row.code;
				const owner = (await resolveResponsible(
					tx,
					c.orgId,
					d.ownerUserId,
					row.ownerUserId,
				)) ?? {
					ownerUserId: row.ownerUserId,
					ownerFunction: row.ownerFunction,
				};
				ownerUserId = owner.ownerUserId;
				ownerFunction = owner.ownerFunction;
				wasAbove = assessRisk(row, method).aboveAppetite;
				before = {
					likelihood: row.likelihood,
					impact: row.impact,
					impactDetail: row.impactDetail,
					residualLikelihood: row.residualLikelihood,
					residualImpact: row.residualImpact,
					treatment: row.treatment,
					status: row.status,
				};
				status = row.status;
				await tx
					.update(risks)
					.set({
						...fields,
						ownerUserId,
						ownerFunction,
						reviewAt:
							d.reviewAt ?? plusMonths(settings.reviewDefaults?.risk ?? 3),
					})
					.where(eq(risks.id, id));
				await tx.delete(riskControls).where(eq(riskControls.riskId, id));
				await tx.delete(riskAssets).where(eq(riskAssets.riskId, id));
				await tx.delete(processRisks).where(eq(processRisks.riskId, id));
			} else {
				const existing = await tx
					.select({ code: risks.code })
					.from(risks)
					.where(eq(risks.organizationId, c.orgId));
				code = nextRiskCode(existing.map((r) => r.code));
				const owner = await ownerColumns(tx, c.orgId, d.ownerUserId, c.userId);
				ownerUserId = owner.ownerUserId;
				ownerFunction = owner.ownerFunction;
				const [row] = await tx
					.insert(risks)
					.values({
						organizationId: c.orgId,
						code,
						...fields,
						sourceEntityType: source?.kind ?? null,
						sourceEntityId: source?.id ?? null,
						ownerUserId,
						ownerFunction,
						reviewAt:
							d.reviewAt ?? plusMonths(settings.reviewDefaults?.risk ?? 3),
					})
					.returning({ id: risks.id });
				if (!row) throw new Error("insert failed");
				id = row.id;
				status = "open";
				// Freigabe-Designer: Aufnahme kann eine Freigabe verlangen
				const gate = await gateApproval(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					{
						trigger: "risk.create",
						entityType: "risk",
						entityId: id,
						entityOwnerUserId: ownerUserId,
						title: `Risiko aufnehmen: ${code} · ${d.title}`,
						link: `/risiken/${id}`,
						facts: {
							riskCategory: d.category,
							score: assessRisk(
								{ id, likelihood: d.likelihood, impact },
								method,
							).effective.score,
						},
					},
				);
				if (gate.status === "error")
					throw new GateBlocked(gate.error, gate.warnings);
				if (gate.status === "pending") {
					await tx
						.update(risks)
						.set({ status: "proposed" })
						.where(eq(risks.id, id));
					status = "proposed";
				}
			}
			if (ctrlRows.length > 0)
				await tx
					.insert(riskControls)
					.values(
						ctrlRows.map((x) => ({
							organizationId: c.orgId,
							riskId: id,
							controlId: x.id,
						})),
					)
					.onConflictDoNothing();
			if (assetRows.length > 0)
				await tx
					.insert(riskAssets)
					.values(
						assetRows.map((x) => ({
							organizationId: c.orgId,
							riskId: id,
							assetId: x.id,
						})),
					)
					.onConflictDoNothing();
			if (processRows.length > 0)
				await tx
					.insert(processRisks)
					.values(
						processRows.map((x) => ({
							organizationId: c.orgId,
							processId: x.id,
							riskId: id,
						})),
					)
					.onConflictDoNothing();

			const taskIds: (string | null)[] = [];
			for (const m of d.measures) {
				const r = await insertTreatment(tx, c, {
					riskId: id,
					riskCode: code,
					title: m.title,
					ownerUserId: m.ownerUserId ?? ownerUserId,
					dueAt: m.dueAt ?? null,
					costEur: m.costEur ?? null,
				});
				taskIds.push(r.taskId);
			}
			if (d.measures.length > 0 && status === "open") {
				await tx
					.update(risks)
					.set({ status: "in_treatment" })
					.where(eq(risks.id, id));
				status = "in_treatment";
			}

			let acceptance: GuidedResult["acceptance"] = null;
			let acceptanceError: string | undefined;
			if (d.treatment === "accept" && status === "proposed") {
				// erst nach der Aufnahme-Freigabe akzeptierbar
				acceptanceError = "intake_pending";
			} else if (
				d.treatment === "accept" &&
				status !== "accepted" &&
				!allows(c, { risk: ["accept"] })
			) {
				acceptanceError = "forbidden";
			} else if (d.treatment === "accept" && status !== "accepted") {
				const r = await acceptRisk(
					tx,
					c,
					{
						id,
						code,
						title: d.title,
						ownerUserId,
						likelihood: d.likelihood,
						impact,
						...residual,
					},
					method,
					{ selfApprovalReason: d.selfApprovalReason },
				);
				acceptance = r.status;
				if (r.status === "accepted") status = "accepted";
				if (r.status === "failed") acceptanceError = r.error;
			}
			if (a.aboveAppetite && !wasAbove && status !== "accepted")
				await notifyAboveAppetite(
					tx,
					c,
					{ id, code, ownerUserId },
					{ score: a.effective.score, label: a.effective.cls.label },
					d.riskId ? c.userId : null,
				);

			const after = {
				code,
				title: d.title,
				scenarioCode: d.scenarioCode ?? null,
				likelihood: d.likelihood,
				impact,
				impactDetail,
				...residual,
				treatment: d.treatment,
				status,
				class: a.effective.cls.label,
				controls: ctrlRows.map((x) => x.code),
				measures: d.measures.length,
				acceptance,
				via: "wizard",
				...(source && !d.riskId
					? { source: `${source.kind}:${source.id}` }
					: {}),
			};
			return {
				result: {
					ok: true,
					data: {
						id,
						code,
						acceptance,
						acceptanceError,
						intakePending: status === "proposed",
					},
				},
				audit: {
					action: d.riskId ? "risk.reassess" : "risk.create",
					target: `risk:${id}`,
					before,
					after,
				},
			};
		},
	);
	revalidatePath("/risiken", "layout");
	return res;
}

// Risikovorschlag (B3) bewusst ablehnen — mit Begründung, auditiert;
// „wieder vorschlagen“ hebt das auf.
const proposalKey = z
	.string()
	.regex(
		new RegExp(
			`^(${RISK_SOURCE_KINDS.join("|")}):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
		),
	);
const dismissSchema = z.object({
	key: proposalKey,
	reason: z.string().trim().min(3).max(500),
});

async function dismissRiskProposalImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = dismissSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { key, reason } = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const entry = { reason, byUserId: c.userId, at: new Date().toISOString() };
		await tx
			.update(orgSettings)
			.set({
				riskProposalDismissals: sql`${orgSettings.riskProposalDismissals} || ${JSON.stringify({ [key]: entry })}::jsonb`,
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "risk.proposal_dismissed",
				target: key,
				after: { reason },
			},
		};
	});
	revalidatePath("/risiken");
	return { ok: true, data: undefined };
}

async function restoreRiskProposalImpl(key: unknown): Promise<ActionResult> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = proposalKey.safeParse(key);
	if (!parsed.success) return { ok: false, error: "invalid" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await tx
			.update(orgSettings)
			.set({
				riskProposalDismissals: sql`${orgSettings.riskProposalDismissals} - ${parsed.data}::text`,
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: { action: "risk.proposal_restored", target: parsed.data },
		};
	});
	revalidatePath("/risiken");
	return { ok: true, data: undefined };
}

async function createRiskGuidedImpl(
	input: unknown,
): Promise<ActionResult<GuidedResult>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = guidedRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (parsed.data.riskId) return { ok: false, error: "notFound" };
	try {
		return await saveGuided(c, parsed.data);
	} catch (e) {
		// Aufnahme-Freigabe ohne mögliche Freigebende → nichts anlegen
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
}

async function reassessRiskImpl(
	input: unknown,
): Promise<ActionResult<GuidedResult>> {
	const c = await requireOrg({ risk: ["update"] });
	const parsed = guidedRiskSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (!parsed.data.riskId) return { ok: false, error: "notFound" };
	return saveGuided(c, parsed.data);
}

async function createExceptionImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createExceptionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			let controlId: string | null = null;
			if (d.controlCode) {
				const [ctl] = await tx
					.select({ id: controls.id })
					.from(controls)
					.where(eq(controls.code, d.controlCode))
					.limit(1);
				controlId = ctl?.id ?? null;
			}
			const [row] = await tx
				.insert(exceptions)
				.values({
					organizationId: c.orgId,
					title: d.title,
					controlId,
					documentId: d.documentId ?? null,
					justification: d.justification,
					compensatingControls: d.compensatingControls ?? null,
					riskId: d.riskId ?? null,
					ownerUserId: c.userId,
					validUntil: d.validUntil,
					status: "requested",
				})
				.returning({ id: exceptions.id });
			if (!row) throw new Error("insert failed");
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "exception",
					entityType: "exception",
					entityId: row.id,
					entityOwnerUserId: c.userId,
					title: d.title,
					link: "/risiken?tab=ausnahmen",
					selfApprovalReason: d.selfApprovalReason,
				},
			);
			let approvalRequestId: string | null = null;
			let status: "requested" | "approved" = "requested";
			if (r.ok) {
				approvalRequestId = r.requestId;
				if (r.status === "approved") status = "approved";
			} else if (r.error !== "workflow_disabled") {
				return { result: { ok: false, error: r.error }, audit: [] };
			} else {
				status = "approved"; // Workflow aus → Ausnahme gilt mit Eigner-Verantwortung
			}
			await tx
				.update(exceptions)
				.set({ approvalRequestId, status })
				.where(eq(exceptions.id, row.id));
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "exception.create",
					target: `exception:${row.id}`,
					after: {
						title: d.title,
						controlCode: d.controlCode ?? null,
						validUntil: d.validUntil,
						status,
					},
				},
			};
		},
	);
	revalidatePath("/risiken");
	return res;
}

async function createLossEventImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = createLossEventSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(lossEvents)
			.values({
				organizationId: c.orgId,
				occurredAt: d.occurredAt,
				detectedAt: d.detectedAt ?? null,
				amount: d.amount !== undefined ? String(d.amount) : null,
				recovery: d.recovery !== undefined ? String(d.recovery) : null,
				category: d.category,
				cause: d.cause ?? null,
				description: d.description ?? null,
				incidentId: d.incidentId ?? null,
				riskId: d.riskId ?? null,
				ownerUserId: c.userId,
			})
			.returning({ id: lossEvents.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "loss_event.create",
				target: `loss_event:${row.id}`,
				after: {
					category: d.category,
					amount: d.amount ?? null,
					occurredAt: d.occurredAt,
				},
			},
		};
	});
	revalidatePath("/risiken");
	return { ok: true, data: { id } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const dismissRiskProposal = safeAction(
	"dismissRiskProposal",
	dismissRiskProposalImpl,
);
export const restoreRiskProposal = safeAction(
	"restoreRiskProposal",
	restoreRiskProposalImpl,
);
export const createRiskGuided = safeAction(
	"createRiskGuided",
	createRiskGuidedImpl,
);
export const reassessRisk = safeAction("reassessRisk", reassessRiskImpl);
export const createRisk = safeAction("createRisk", createRiskImpl);
export const updateRisk = safeAction("updateRisk", updateRiskImpl);
export const setRiskStatus = safeAction("setRiskStatus", setRiskStatusImpl);
export const createTreatment = safeAction(
	"createTreatment",
	createTreatmentImpl,
);
export const createException = safeAction(
	"createException",
	createExceptionImpl,
);
export const createLossEvent = safeAction(
	"createLossEvent",
	createLossEventImpl,
);
