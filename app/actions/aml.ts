"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	amlMonitoringRules,
	amlRiskAnalyses,
	jurisdictions,
	roleAssignments,
	suspiciousReports,
	tasks,
} from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import { requestApproval } from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	listRelevantChanges,
	nextSuspiciousRef,
	overallAmlRisk,
	parseJurisdictionCsv,
	sarHoldUntil,
} from "@/lib/compliance/aml";
import { CORRIDOR_STEPS } from "@/lib/compliance/catalog/corridor-template";
import { JURISDICTIONS } from "@/lib/compliance/catalog/jurisdictions";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	amlRiskAnalysisSchema,
	corridorTemplateSchema,
	jurisdictionCsvSchema,
	jurisdictionSchema,
	monitoringRuleSchema,
	requestAmlApprovalSchema,
	suspiciousReportSchema,
	suspiciousTransitionSchema,
} from "@/lib/validation/casp";
import { type ActionResult, fromZod } from "@/lib/validation/common";

const PATH = "/aml";

// Geldwäschebeauftragte Person (oder Vertretung) als Standard-Empfänger.
async function functionHolder(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string | null> {
	const [row] = await tx
		.select({ userId: roleAssignments.userId })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, fn),
			),
		)
		.limit(1);
	return row?.userId ?? null;
}

// ── Risikoanalyse (§ 5 GwG / AMLR Art. 10) ─────────────────────────────────

export async function upsertAmlRiskAnalysis(
	input: unknown,
): Promise<ActionResult<{ id: string; version: string }>> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = amlRiskAnalysisSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const overall = overallAmlRisk(d.dimensions);
	const res = await mutateOrg<ActionResult<{ id: string; version: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (d.id) {
				const [before] = await tx
					.select()
					.from(amlRiskAnalyses)
					.where(
						and(
							eq(amlRiskAnalyses.id, d.id),
							eq(amlRiskAnalyses.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				if (before.status !== "draft")
					return { result: { ok: false, error: "notDraft" }, audit: [] };
				await tx
					.update(amlRiskAnalyses)
					.set({
						dimensions: d.dimensions,
						overallRisk: overall,
						summary: d.summary ?? before.summary,
						ownerUserId: d.ownerUserId ?? before.ownerUserId,
						nextReviewAt: d.nextReviewAt ?? before.nextReviewAt,
					})
					.where(eq(amlRiskAnalyses.id, d.id));
				return {
					result: { ok: true, data: { id: d.id, version: before.version } },
					audit: {
						action: "aml_risk_analysis.update",
						target: `aml_risk_analysis:${d.id}`,
						before: {
							overallRisk: before.overallRisk,
							dimensions: before.dimensions,
						},
						after: { overallRisk: overall, dimensions: d.dimensions },
					},
				};
			}
			const existing = await tx
				.select({ version: amlRiskAnalyses.version })
				.from(amlRiskAnalyses)
				.where(eq(amlRiskAnalyses.organizationId, c.orgId));
			const version =
				d.version && !existing.some((e) => e.version === d.version)
					? d.version
					: `v${existing.length + 1}`;
			const owner =
				d.ownerUserId ??
				(await functionHolder(tx, c.orgId, "aml_officer")) ??
				c.userId;
			const [row] = await tx
				.insert(amlRiskAnalyses)
				.values({
					organizationId: c.orgId,
					version,
					dimensions: d.dimensions,
					overallRisk: overall,
					summary: d.summary ?? null,
					ownerUserId: owner,
					nextReviewAt: d.nextReviewAt ?? null,
				})
				.returning({ id: amlRiskAnalyses.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id, version } },
				audit: {
					action: "aml_risk_analysis.create",
					target: `aml_risk_analysis:${row.id}`,
					after: { version, overallRisk: overall },
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

// Freigabe durch die Geschäftsleitung (Workflow aml_risk_analysis: GWB → GL).
export async function requestAmlRiskAnalysisApproval(
	input: unknown,
): Promise<ActionResult<{ status: string }>> {
	const c = await requireOrg({ aml: ["update"] });
	const parsed = requestAmlApprovalSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, selfApprovalReason } = parsed.data;
	const canApproveDirect = roleAllows(c.orgRole, { aml: ["approve"] });
	const res = await mutateOrg<ActionResult<{ status: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [row] = await tx
				.select()
				.from(amlRiskAnalyses)
				.where(
					and(
						eq(amlRiskAnalyses.id, id),
						eq(amlRiskAnalyses.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
			if (row.status !== "draft")
				return { result: { ok: false, error: "notDraft" }, audit: [] };
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "aml_risk_analysis",
					entityType: "aml_risk_analysis",
					entityId: row.id,
					entityOwnerUserId: row.ownerUserId,
					entityVersionRef: row.version,
					title: `AML-Risikoanalyse ${row.version}`,
					link: `${PATH}?tab=risikoanalyse`,
					selfApprovalReason,
				},
			);
			if (!r.ok) {
				if (r.error === "workflow_disabled" && canApproveDirect) {
					const next = new Date();
					next.setUTCFullYear(next.getUTCFullYear() + 1);
					await tx
						.update(amlRiskAnalyses)
						.set({ status: "superseded" })
						.where(
							and(
								eq(amlRiskAnalyses.organizationId, c.orgId),
								eq(amlRiskAnalyses.status, "approved"),
							),
						);
					await tx
						.update(amlRiskAnalyses)
						.set({
							status: "approved",
							approvedByUserId: c.userId,
							approvedAt: new Date(),
							nextReviewAt: next.toISOString().slice(0, 10),
						})
						.where(eq(amlRiskAnalyses.id, row.id));
					return {
						result: { ok: true, data: { status: "approved" } },
						audit: {
							action: "aml_risk_analysis.approved",
							target: `aml_risk_analysis:${row.id}`,
							after: { version: row.version, via: "direct" },
						},
					};
				}
				return { result: { ok: false, error: r.error }, audit: [] };
			}
			if (r.status === "pending") {
				await tx
					.update(amlRiskAnalyses)
					.set({ status: "in_review" })
					.where(eq(amlRiskAnalyses.id, row.id));
			}
			return {
				result: {
					ok: true,
					data: { status: r.status === "approved" ? "approved" : "pending" },
				},
				audit: {
					action: "aml_risk_analysis.approval_requested",
					target: `aml_risk_analysis:${row.id}`,
					after: { requestId: r.requestId, version: row.version },
				},
			};
		},
	);
	revalidatePath(PATH);
	revalidatePath("/heute");
	return res;
}

// ── Monitoring-Regelwerk ───────────────────────────────────────────────────

export async function upsertMonitoringRule(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = monitoringRuleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const values = {
				code: d.code,
				description: d.description,
				threshold: d.threshold ?? null,
				rationale: d.rationale ?? null,
				legalBasis: d.legalBasis ?? null,
				ownerUserId: d.ownerUserId ?? null,
				lastTunedAt: d.lastTunedAt ?? null,
				falsePositiveRate:
					d.falsePositiveRate === null || d.falsePositiveRate === undefined
						? null
						: String(d.falsePositiveRate),
				status: d.status,
			};
			if (id) {
				const [before] = await tx
					.select()
					.from(amlMonitoringRules)
					.where(
						and(
							eq(amlMonitoringRules.id, id),
							eq(amlMonitoringRules.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				await tx
					.update(amlMonitoringRules)
					.set(values)
					.where(eq(amlMonitoringRules.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "aml_monitoring_rule.update",
						target: `aml_monitoring_rule:${id}`,
						before: {
							threshold: before.threshold,
							status: before.status,
							description: before.description,
						},
						after: {
							threshold: values.threshold,
							status: values.status,
							description: values.description,
						},
					},
				};
			}
			const [row] = await tx
				.insert(amlMonitoringRules)
				.values({ organizationId: c.orgId, ...values })
				.onConflictDoNothing()
				.returning({ id: amlMonitoringRules.id });
			if (!row)
				return {
					result: {
						ok: false,
						error: "duplicate",
						fieldErrors: { code: ["duplicate"] },
					},
					audit: [],
				};
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "aml_monitoring_rule.create",
					target: `aml_monitoring_rule:${row.id}`,
					after: {
						code: d.code,
						threshold: values.threshold,
						status: d.status,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

// ── Verdachtsmeldungen (§ 43 GwG, goAML) und STOR (Art. 92 MiCAR) ─────────
// Kein PII-Feld: goAML/BaFin sind System of Record. Die Entscheidungsnotiz
// ist feldverschlüsselt (Org-DEK).

export async function upsertSuspiciousReport(
	input: unknown,
): Promise<ActionResult<{ id: string; internalRef: string }>> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = suspiciousReportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, decisionNote, ...d } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ id: string; internalRef: string }>
	>(toOrgCtx(c), async (tx) => {
		if (id) {
			const [before] = await tx
				.select()
				.from(suspiciousReports)
				.where(
					and(
						eq(suspiciousReports.id, id),
						eq(suspiciousReports.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const enc =
				decisionNote === undefined
					? before.decisionNote
					: decisionNote
						? await encryptJson(
								tx,
								c.orgId,
								decisionNote,
								fieldAad("suspicious_reports", id, "decision_note"),
							)
						: null;
			await tx
				.update(suspiciousReports)
				.set({
					category: d.category ?? before.category,
					decisionNote: enc,
					incidentId: d.incidentId ?? before.incidentId,
					ownerUserId: d.ownerUserId ?? before.ownerUserId,
				})
				.where(eq(suspiciousReports.id, id));
			return {
				result: { ok: true, data: { id, internalRef: before.internalRef } },
				audit: {
					action: "suspicious_report.update",
					target: `suspicious_report:${id}`,
					before: {
						category: before.category,
						ownerUserId: before.ownerUserId,
					},
					after: {
						category: d.category ?? before.category,
						ownerUserId: d.ownerUserId ?? before.ownerUserId,
					},
				},
			};
		}
		const existing = await tx
			.select({ ref: suspiciousReports.internalRef })
			.from(suspiciousReports)
			.where(eq(suspiciousReports.organizationId, c.orgId));
		const internalRef = nextSuspiciousRef(
			existing.map((e) => e.ref),
			d.kind,
		);
		const owner =
			d.ownerUserId ??
			(await functionHolder(
				tx,
				c.orgId,
				d.kind === "micar_stor" ? "compliance" : "aml_officer",
			)) ??
			c.userId;
		const [row] = await tx
			.insert(suspiciousReports)
			.values({
				organizationId: c.orgId,
				kind: d.kind,
				internalRef,
				detectedAt: d.detectedAt,
				category: d.category ?? null,
				incidentId: d.incidentId ?? null,
				ownerUserId: owner,
			})
			.returning({ id: suspiciousReports.id });
		if (!row) throw new Error("insert failed");
		if (decisionNote)
			await tx
				.update(suspiciousReports)
				.set({
					decisionNote: await encryptJson(
						tx,
						c.orgId,
						decisionNote,
						fieldAad("suspicious_reports", row.id, "decision_note"),
					),
				})
				.where(eq(suspiciousReports.id, row.id));
		await notify(tx, {
			orgId: c.orgId,
			recipients: [owner],
			actorUserId: c.userId,
			kind: "task_assigned",
			title: `${internalRef}: ${d.kind === "micar_stor" ? "STOR" : "Verdachtsfall"} zur Prüfung`,
			body: "Entscheidung über Meldung dokumentieren — Durchführungsverbot und Tipping-off beachten.",
			link: `${PATH}?tab=verdacht`,
		});
		return {
			result: { ok: true, data: { id: row.id, internalRef } },
			audit: {
				action: "suspicious_report.create",
				target: `suspicious_report:${row.id}`,
				after: { internalRef, kind: d.kind, category: d.category ?? null },
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

export async function transitionSuspiciousReport(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ aml: ["update"] });
	const parsed = suspiciousTransitionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, to, externalRef } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(suspiciousReports)
			.where(
				and(
					eq(suspiciousReports.id, id),
					eq(suspiciousReports.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const now = new Date();
		const patch: Partial<typeof suspiciousReports.$inferInsert> = {
			status: to,
		};
		if (to === "reported") {
			patch.decidedAt = row.decidedAt ?? now;
			patch.reportedAt = now;
			patch.externalRef = externalRef ?? row.externalRef;
			// § 46 GwG: Durchführungsverbot bis FIU-Freigabe oder drei Werktage
			if (row.kind === "gwg_sar") patch.holdUntil = sarHoldUntil(now);
		} else if (to === "dismissed") {
			patch.decidedAt = row.decidedAt ?? now;
			patch.holdUntil = null;
		} else {
			patch.decidedAt = null;
			patch.reportedAt = null;
			patch.holdUntil = null;
		}
		await tx
			.update(suspiciousReports)
			.set(patch)
			.where(eq(suspiciousReports.id, id));
		return {
			result: true,
			audit: {
				action: "suspicious_report.transition",
				target: `suspicious_report:${id}`,
				before: { status: row.status },
				after: { status: to, externalRef: patch.externalRef ?? null },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// ── Länder & Korridore ─────────────────────────────────────────────────────

type JurisdictionValues = Omit<
	typeof jurisdictions.$inferInsert,
	"id" | "organizationId" | "createdAt" | "updatedAt"
>;

// Upsert je ISO2; listenrelevante Änderungen (EU-Hochrisiko, FATF,
// Sanktionen) erzeugen eine Aufgabe an die Geldwäschebeauftragte Person.
async function upsertJurisdictionRow(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	v: JurisdictionValues,
): Promise<{ created: boolean; audit: AuditInput[] }> {
	const [before] = await tx
		.select()
		.from(jurisdictions)
		.where(
			and(
				eq(jurisdictions.organizationId, ctx.orgId),
				eq(jurisdictions.iso2, v.iso2),
			),
		)
		.limit(1);
	const [row] = await tx
		.insert(jurisdictions)
		.values({ organizationId: ctx.orgId, ...v })
		.onConflictDoUpdate({
			target: [jurisdictions.organizationId, jurisdictions.iso2],
			set: { ...v },
		})
		.returning({ id: jurisdictions.id });
	if (!row) throw new Error("upsert failed");
	const audits: AuditInput[] = [
		{
			action: before ? "jurisdiction.update" : "jurisdiction.create",
			target: `jurisdiction:${row.id}`,
			before: before
				? {
						euHighRisk: before.euHighRisk,
						fatfStatus: before.fatfStatus,
						euSanctions: before.euSanctions,
						usSanctions: before.usSanctions,
						orgStance: before.orgStance,
						corridorStatus: before.corridorStatus,
					}
				: undefined,
			after: {
				iso2: v.iso2,
				euHighRisk: v.euHighRisk,
				fatfStatus: v.fatfStatus,
				euSanctions: v.euSanctions,
				usSanctions: v.usSanctions,
				orgStance: v.orgStance,
				corridorStatus: v.corridorStatus,
			},
		},
	];
	const changes = listRelevantChanges(before ?? null, {
		euHighRisk: v.euHighRisk ?? false,
		fatfStatus: v.fatfStatus ?? "none",
		euSanctions: v.euSanctions ?? false,
		usSanctions: v.usSanctions ?? false,
	});
	if (changes.length > 0) {
		const gwb = await functionHolder(tx, ctx.orgId, "aml_officer");
		const due = new Date();
		due.setUTCDate(due.getUTCDate() + 14);
		await tx.insert(tasks).values({
			organizationId: ctx.orgId,
			title: `Länderrisiko ${v.name} (${v.iso2}) neu bewerten`,
			description: `Listenänderung: ${changes.join("; ")}. Länderpolitik, Kundenbestand und Monitoring-Regeln prüfen (§ 15 GwG, Sanktionsrecht).`,
			assigneeUserId: gwb,
			createdByUserId: ctx.userId,
			dueAt: due.toISOString().slice(0, 10),
			priority: "high",
			entityType: "jurisdiction",
			entityId: row.id,
			sourceKind: "review",
		});
		if (gwb)
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: [gwb],
				actorUserId: ctx.userId,
				kind: "task_assigned",
				title: `Länderrisiko ${v.iso2} neu bewerten`,
				body: changes.join("; "),
				link: `${PATH}?tab=laender`,
			});
	}
	return { created: !before, audit: audits };
}

export async function upsertJurisdiction(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = jurisdictionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id: _id, ...d } = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await upsertJurisdictionRow(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			{
				iso2: d.iso2,
				name: d.name,
				euHighRisk: d.euHighRisk,
				fatfStatus: d.fatfStatus,
				euSanctions: d.euSanctions,
				usSanctions: d.usSanctions,
				orgStance: d.orgStance,
				corridorStatus: d.corridorStatus,
				corridorNotes: d.corridorNotes ?? null,
				legalNotes: d.legalNotes ?? null,
				reviewedAt: d.reviewedAt ?? new Date().toISOString().slice(0, 10),
			},
		);
		return { result: null, audit: r.audit };
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export async function applyJurisdictionSeed(): Promise<
	ActionResult<{ created: number; updated: number }>
> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const data = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = new Set(
			(
				await tx
					.select({ iso2: jurisdictions.iso2 })
					.from(jurisdictions)
					.where(eq(jurisdictions.organizationId, c.orgId))
			).map((x) => x.iso2),
		);
		let created = 0;
		const audits: AuditInput[] = [];
		// Seed legt nur fehlende Länder an — bestehende Entscheidungen bleiben.
		for (const j of JURISDICTIONS) {
			if (existing.has(j.iso2)) continue;
			const r = await upsertJurisdictionRow(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				{
					iso2: j.iso2,
					name: j.name,
					euHighRisk: j.euHighRisk,
					fatfStatus: j.fatfStatus,
					euSanctions: j.euSanctions,
					usSanctions: j.usSanctions,
					orgStance: j.orgStance,
					corridorStatus: j.corridorStatus,
					corridorNotes: j.corridorNotes ?? null,
					legalNotes: j.legalNotes ?? null,
					reviewedAt: new Date().toISOString().slice(0, 10),
				},
			);
			created += r.created ? 1 : 0;
			audits.push(...r.audit);
		}
		return { result: { created, updated: 0 }, audit: audits };
	});
	revalidatePath(PATH);
	return { ok: true, data };
}

export async function importJurisdictionsCsv(
	input: unknown,
): Promise<ActionResult<{ imported: number; errors: string[] }>> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = jurisdictionCsvSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { rows, errors } = parseJurisdictionCsv(parsed.data.csv);
	if (rows.length === 0) return { ok: false, error: errors[0] ?? "leer" };
	const imported = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audits: AuditInput[] = [];
		for (const j of rows) {
			const r = await upsertJurisdictionRow(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				{
					iso2: j.iso2,
					name: j.name,
					euHighRisk: j.euHighRisk,
					fatfStatus: j.fatfStatus,
					euSanctions: j.euSanctions,
					usSanctions: j.usSanctions,
					orgStance: j.orgStance,
					corridorStatus: j.corridorStatus,
					legalNotes: j.legalNotes ?? null,
					reviewedAt: new Date().toISOString().slice(0, 10),
				},
			);
			audits.push(...r.audit);
		}
		audits.push({
			action: "jurisdiction.csv_import",
			target: `organization:${c.orgId}`,
			after: { rows: rows.length, errors: errors.length },
		});
		return { result: rows.length, audit: audits };
	});
	revalidatePath(PATH);
	return { ok: true, data: { imported, errors } };
}

// Korridor-Vorlage (8 Schritte) als Aufgaben für ein Zielland anlegen.
export async function applyCorridorTemplate(
	input: unknown,
): Promise<ActionResult<{ tasks: number }>> {
	const c = await requireOrg({ aml: ["create", "update"] });
	const parsed = corridorTemplateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { iso2, startDate } = parsed.data;
	const start = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date();
	const res = await mutateOrg<ActionResult<{ tasks: number }>>(
		toOrgCtx(c),
		async (tx) => {
			const [j] = await tx
				.select()
				.from(jurisdictions)
				.where(
					and(
						eq(jurisdictions.organizationId, c.orgId),
						eq(jurisdictions.iso2, iso2),
					),
				)
				.limit(1);
			if (!j) return { result: { ok: false, error: "notFound" }, audit: [] };
			const holders = new Map<RoleFunction, string | null>();
			let n = 0;
			for (const step of CORRIDOR_STEPS) {
				if (!holders.has(step.ownerFunction))
					holders.set(
						step.ownerFunction,
						await functionHolder(tx, c.orgId, step.ownerFunction),
					);
				const due = new Date(start);
				due.setUTCDate(due.getUTCDate() + step.offsetDays);
				await tx.insert(tasks).values({
					organizationId: c.orgId,
					title: `Korridor ${j.name}: ${step.order}. ${step.title}`,
					description: step.description,
					assigneeUserId: holders.get(step.ownerFunction) ?? c.userId,
					createdByUserId: c.userId,
					dueAt: due.toISOString().slice(0, 10),
					priority: "normal",
					entityType: "jurisdiction",
					entityId: j.id,
					sourceKind: "bundle",
				});
				n += 1;
			}
			if (j.corridorStatus === "none")
				await tx
					.update(jurisdictions)
					.set({ corridorStatus: "evaluating" })
					.where(eq(jurisdictions.id, j.id));
			return {
				result: { ok: true, data: { tasks: n } },
				audit: {
					action: "jurisdiction.corridor_template",
					target: `jurisdiction:${j.id}`,
					after: { iso2, tasks: n, start: start.toISOString().slice(0, 10) },
				},
			};
		},
	);
	revalidatePath(PATH);
	revalidatePath("/heute");
	return res;
}
