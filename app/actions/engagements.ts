"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	controlImplementations,
	controls,
	products,
	securityEngagements,
	securityFindings,
} from "@/db/schema";
import type { FindingSeverity } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { nextAssessmentCode } from "@/lib/assessments/state";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { encryptField } from "@/lib/crypto/fields";
import { fieldAad, loadOrgDek } from "@/lib/crypto/org-dek";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { ENGAGEMENT_STATUS_MACHINE } from "@/lib/entities/engagement";
import { canTransition } from "@/lib/entities/status-machine";
import {
	s3Configured,
	screenUpload,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
import { parseCvss, severityFromScore } from "@/lib/security/cvss";
import {
	engagementControls,
	engagementGate,
	engagementResult,
	METHODOLOGY_DEFAULT,
	RULES_OF_ENGAGEMENT_TEMPLATE,
	retestDueDate,
} from "@/lib/security/engagement-rules";
import { CATEGORY_CONTROL, slaDueAt } from "@/lib/security/finding-rules";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	createEngagementSchema,
	engagementFindingSchema,
	engagementStatusSchema,
	retestFindingSchema,
	updateEngagementSchema,
} from "@/lib/validation/engagements";

// Sicherheitsaufträge (S7): Pentest, Security-Check, CRA-Readiness. Klick
// führt keine aktiven Tests aus — es verwaltet Umfang, Regeln, schriftliche
// Beauftragung (Pflicht vor „beauftragt“), Befunde mit CVSS, Lieferung
// (Wirksamkeitstest → /testprogramm, nicht wirksam → Abweichung) und
// Nachtest. Jede Mutation: requireOrg → mutateOrg → Audit.

const PATH = "/sicherheit";

async function loadEngagement(tx: OrgTx, orgId: string, id: string) {
	const [e] = await tx
		.select()
		.from(securityEngagements)
		.where(
			and(
				eq(securityEngagements.id, id),
				eq(securityEngagements.organizationId, orgId),
			),
		)
		.limit(1);
	return e ?? null;
}

async function productRow(tx: OrgTx, orgId: string, id: string) {
	const [p] = await tx
		.select({ id: products.id, role: products.role })
		.from(products)
		.where(and(eq(products.id, id), eq(products.organizationId, orgId)))
		.limit(1);
	return p ?? null;
}

const SCOPE_EDITABLE = new Set(["planned", "authorized"]);

async function createEngagementImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ security: ["create"] });
	const parsed = createEngagementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		if (d.productId && !(await productRow(tx, c.orgId, d.productId)))
			return { result: null, audit: [] };
		const existing = await tx
			.select({ code: securityEngagements.code })
			.from(securityEngagements)
			.where(eq(securityEngagements.organizationId, c.orgId));
		const code = nextAssessmentCode(
			existing.map((x) => x.code),
			"SA",
			new Date(),
		);
		const [row] = await tx
			.insert(securityEngagements)
			.values({
				organizationId: c.orgId,
				code,
				kind: d.kind,
				title: d.title,
				productId: d.productId ?? null,
				methodology: METHODOLOGY_DEFAULT[d.kind],
				rulesOfEngagement:
					d.kind === "pentest" ? RULES_OF_ENGAGEMENT_TEMPLATE : null,
				ownerUserId: c.userId,
				createdByUserId: c.userId,
			})
			.returning({ id: securityEngagements.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "engagement.create",
				target: `security_engagement:${row.id}`,
				after: { code, kind: d.kind, title: d.title, productId: d.productId },
			},
		};
	});
	if (!id) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: { id } };
}

// Umfang, Regeln, Tester, Zeitraum, Summary. Umfang, Ziele und Regeln sind
// ab Testbeginn fest (die Beauftragung bezieht sich darauf); Zeitraum,
// Tester, Summary und Nachtest-Frist bleiben bis zum Abschluss änderbar.
async function updateEngagementImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ security: ["update"] });
	const parsed = updateEngagementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { engagementId, ...d } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const e = await loadEngagement(tx, c.orgId, engagementId);
		if (!e || e.status === "closed" || e.status === "cancelled")
			return { result: { ok: false, error: "notFound" }, audit: [] };
		// Umfang gehört zur Beauftragung: nur bis Testbeginn änderbar
		const scopeKeys = [
			"scope",
			"targets",
			"outOfScope",
			"rulesOfEngagement",
			"productId",
		] as const;
		if (
			scopeKeys.some((k) => d[k] !== undefined) &&
			!SCOPE_EDITABLE.has(e.status)
		)
			return { result: { ok: false, error: "scope_locked" }, audit: [] };
		if (d.productId && !(await productRow(tx, c.orgId, d.productId)))
			return { result: { ok: false, error: "notFound" }, audit: [] };
		const set = Object.fromEntries(
			Object.entries({
				...d,
				testerEmail: d.testerEmail === "" ? null : d.testerEmail,
			}).filter(([, v]) => v !== undefined),
		) as Partial<typeof securityEngagements.$inferInsert>;
		if (Object.keys(set).length === 0)
			return { result: { ok: true, data: undefined }, audit: [] };
		await tx
			.update(securityEngagements)
			.set(set)
			.where(eq(securityEngagements.id, e.id));
		const before = Object.fromEntries(
			Object.keys(set).map((k) => [k, e[k as keyof typeof e]]),
		);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "engagement.update",
				target: `security_engagement:${e.id}`,
				before,
				after: set,
			},
		};
	});
	revalidatePath(`${PATH}/auftraege/${engagementId}`);
	return res;
}

// Beauftragung (unterschrieben) oder Bericht hochladen: Pipeline wie überall,
// vertraulich, Herkunft „engagement“.
async function uploadEngagementFileImpl(
	formData: FormData,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ security: ["update"], evidence: ["create"] });
	if (!s3Configured()) return { ok: false, error: "storageNotConfigured" };
	const engagementId = String(formData.get("engagementId") ?? "");
	const role = String(formData.get("role") ?? "");
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (
		!/^[0-9a-f-]{36}$/i.test(engagementId) ||
		(role !== "authorization" && role !== "report")
	)
		return { ok: false, error: "notFound" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: "confidential",
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const e = await loadEngagement(tx, c.orgId, engagementId);
		if (!e || e.status === "closed" || e.status === "cancelled")
			return { result: null, audit: [] };
		const stored = await storeEncryptedEvidence(tx, {
			orgId: c.orgId,
			bytes,
			safeName: v.safeName,
			mime: v.mime,
			title:
				`${e.code} ${role === "authorization" ? "Beauftragung" : "Bericht"}: ${file.name}`.slice(
					0,
					200,
				),
			description: e.title,
			type: role === "authorization" ? "document" : "attestation",
			classification: v.classification,
			createdByUserId: c.userId,
			source: "engagement",
			dlp: v.dlp,
		});
		const column =
			role === "authorization" ? "authorizationEvidenceId" : "reportEvidenceId";
		await tx
			.update(securityEngagements)
			.set({ [column]: stored.id })
			.where(eq(securityEngagements.id, e.id));
		return {
			result: stored.id,
			audit: {
				action: "engagement.file",
				target: `security_engagement:${e.id}`,
				before: { [column]: e[column] },
				after: {
					[column]: stored.id,
					fileName: v.safeName,
					classification: v.classification,
					dlp: { action: v.dlp.action, findings: v.dlp.findings },
				},
			},
		};
	});
	if (!id) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/auftraege/${engagementId}`);
	return { ok: true, data: { id } };
}

async function setEngagementStatusImpl(
	input: unknown,
): Promise<ActionResult<{ result: string | null }>> {
	const c = await requireOrg({ security: ["update"] });
	const parsed = engagementStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ result: string | null }>>(
		toOrgCtx(c),
		async (tx) => {
			const e = await loadEngagement(tx, c.orgId, d.engagementId);
			if (!e) return { result: { ok: false, error: "notFound" }, audit: [] };
			const ok = canTransition(ENGAGEMENT_STATUS_MACHINE, e.status, d.status, {
				hasNote: Boolean(d.note && d.note.length >= 3),
			});
			if (!ok.ok)
				return {
					result: { ok: false, error: `transition_${ok.reason}` },
					audit: [],
				};
			const findings = await tx
				.select({
					id: securityFindings.id,
					severity: securityFindings.severity,
					status: securityFindings.status,
					retestStatus: securityFindings.retestStatus,
				})
				.from(securityFindings)
				.where(
					and(
						eq(securityFindings.organizationId, c.orgId),
						eq(securityFindings.engagementId, e.id),
					),
				);
			const gate = engagementGate(d.status, e, findings);
			if (gate)
				return { result: { ok: false, error: `gate_${gate}` }, audit: [] };
			const now = new Date();
			const set: Partial<typeof securityEngagements.$inferInsert> = {
				status: d.status,
				statusNote: d.note ?? null,
			};
			const audits: AuditInput[] = [];
			if (d.status === "authorized") {
				set.authorizedByUserId = c.userId;
				set.authorizedAt = now;
			}
			if (d.status === "closed") set.closedAt = now;
			if (d.status === "delivered") {
				const result = engagementResult(findings);
				set.deliveredAt = now;
				set.result = result;
				set.retestDueAt = e.retestDueAt ?? retestDueDate(findings, now);
				// Wirksamkeitstest je geprüftem Control → /testprogramm;
				// nicht wirksam → Abweichung (insertControlTest)
				const role = e.productId
					? ((await productRow(tx, c.orgId, e.productId))?.role ?? null)
					: null;
				const plan = engagementControls(e.kind, role);
				const testIds: string[] = [];
				if (plan) {
					const impls = await tx
						.select({ id: controlImplementations.id })
						.from(controlImplementations)
						.innerJoin(
							controls,
							eq(controls.id, controlImplementations.controlId),
						)
						.where(
							and(
								eq(controlImplementations.organizationId, c.orgId),
								inArray(controls.code, plan.codes),
							),
						);
					const open = findings.filter(
						(f) => f.status === "open" || f.status === "in_progress",
					);
					for (const impl of impls) {
						const t = await insertControlTest(tx, c, {
							implementationId: impl.id,
							method: plan.method,
							scope: `${e.code} ${e.title}`.slice(0, 300),
							testedAt: now,
							testerUserId: null,
							result,
							notes: `${e.testerOrg ?? e.testerName ?? "Tester"}: ${findings.length} Befunde, davon offen ${open.length} (kritisch ${open.filter((f) => f.severity === "critical").length}, hoch ${open.filter((f) => f.severity === "high").length}).`,
							nextTestAt: new Date(now.getTime() + 365 * 86_400_000)
								.toISOString()
								.slice(0, 10),
							evidenceId: e.reportEvidenceId,
						});
						testIds.push(t.id);
						audits.push(...t.audits);
					}
				}
				set.controlTestIds = testIds;
				if (findings.length > 0)
					await tx
						.update(securityFindings)
						.set({ retestStatus: "pending" })
						.where(
							and(
								eq(securityFindings.engagementId, e.id),
								inArray(securityFindings.status, ["open", "in_progress"]),
								isNull(securityFindings.retestStatus),
							),
						);
				await notify(tx, {
					orgId: c.orgId,
					recipients: [e.ownerUserId],
					actorUserId: c.userId,
					kind: "review_due",
					title: `Bericht geliefert: ${e.code} ${e.title}`,
					body: `Ergebnis: ${result === "pass" ? "wirksam" : result === "partial" ? "teilweise" : "nicht wirksam"}.`,
					link: `${PATH}/auftraege/${e.id}?tab=bericht`,
				});
			}
			await tx
				.update(securityEngagements)
				.set(set)
				.where(eq(securityEngagements.id, e.id));
			audits.push({
				action: "engagement.status",
				target: `security_engagement:${e.id}`,
				before: { status: e.status },
				after: {
					status: d.status,
					note: d.note ?? null,
					result: set.result ?? undefined,
					controlTests: set.controlTestIds?.length ?? undefined,
				},
			});
			return {
				result: { ok: true, data: { result: set.result ?? null } },
				audit: audits,
			};
		},
	);
	revalidatePath(`${PATH}/auftraege/${d.engagementId}`);
	revalidatePath(PATH);
	return res;
}

// Befund aus dem Auftrag erfassen: Schwere aus CVSS 3.1 (berechnet) oder
// 4.0 (Wert aus dem Bericht) oder direkt; Beschreibung, Reproduktion und
// Abhilfe verschlüsselt.
async function addEngagementFindingImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ security: ["create"] });
	const parsed = engagementFindingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	let severity: FindingSeverity | undefined = d.severity;
	let cvss: number | null = null;
	let vector: string | null = null;
	if (d.cvssVector) {
		const p = parseCvss(d.cvssVector);
		if (!p.ok) return { ok: false, error: p.error };
		vector = p.vector;
		cvss = p.version === "3.1" ? p.score : (d.cvssScore ?? null);
		if (cvss === null) return { ok: false, error: "cvss_score_required" };
		severity = severityFromScore(cvss);
	}
	if (!severity) return { ok: false, error: "severity_required" };
	const sev = severity;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const e = await loadEngagement(tx, c.orgId, d.engagementId);
			if (
				!e ||
				e.status === "planned" ||
				e.status === "closed" ||
				e.status === "cancelled"
			)
				return { result: { ok: false, error: "engagement_state" }, audit: [] };
			const id = crypto.randomUUID();
			const now = new Date();
			const { dek, keyVersion } = await loadOrgDek(tx, c.orgId);
			await tx.insert(securityFindings).values({
				id,
				organizationId: c.orgId,
				fingerprint: `manual:${e.id}:${id}`,
				tool: "manual",
				ruleId: d.cwe ?? "manual",
				title: d.title,
				severity: sev,
				category: d.category,
				target: d.target ?? e.targets[0] ?? null,
				location: d.location ?? null,
				cwe: d.cwe ?? null,
				cvss,
				cvssVector: vector,
				details: await encryptField(
					{
						description: d.description,
						evidence: d.steps ?? null,
						remediation: d.remediation ?? null,
					},
					dek,
					{ keyVersion, aad: fieldAad("security_findings", id, "details") },
				),
				status: "open",
				firstSeenAt: now,
				lastSeenAt: now,
				dueAt: slaDueAt(sev, now),
				controlCode: CATEGORY_CONTROL[d.category],
				productId: e.productId,
				engagementId: e.id,
				retestStatus:
					e.status === "delivered" || e.status === "retest" ? "pending" : null,
				ownerUserId: e.ownerUserId ?? c.userId,
			});
			if (sev === "critical")
				await notify(tx, {
					orgId: c.orgId,
					recipients: [e.ownerUserId],
					actorUserId: c.userId,
					kind: "security_alert",
					title: `Kritischer Befund im Auftrag ${e.code}: ${d.title}`,
					body: "Sofort bewerten — Abhilfe oder Workaround vor dem Bericht.",
					link: `${PATH}/befunde/${id}`,
				});
			return {
				result: { ok: true, data: { id } },
				audit: {
					action: "security.finding_created",
					target: `security_finding:${id}`,
					after: {
						engagement: e.code,
						title: d.title,
						severity: sev,
						cvss,
						cvssVector: vector,
						category: d.category,
					},
				},
			};
		},
	);
	revalidatePath(`${PATH}/auftraege/${d.engagementId}`);
	return res;
}

// Nachtest je Befund: bestanden → behoben; nicht bestanden → bleibt/wird
// wieder offen, Notiz was fehlt.
async function retestFindingImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ security: ["update"] });
	const parsed = retestFindingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const [f] = await tx
			.select()
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.id, d.findingId),
					eq(securityFindings.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!f?.engagementId) return { result: null, audit: [] };
		const now = new Date();
		const passed = d.result === "passed";
		const status = passed
			? "resolved"
			: f.status === "resolved"
				? "open"
				: f.status;
		await tx
			.update(securityFindings)
			.set({
				retestStatus: d.result,
				retestedAt: now,
				retestNote: d.note ?? null,
				status,
				resolvedAt: passed ? now : null,
				...(f.status === "resolved" && !passed
					? { reopenCount: f.reopenCount + 1 }
					: {}),
			})
			.where(eq(securityFindings.id, f.id));
		return {
			result: f.engagementId,
			audit: {
				action: "security.finding_retest",
				target: `security_finding:${f.id}`,
				before: { status: f.status, retestStatus: f.retestStatus },
				after: { status, retestStatus: d.result, note: d.note ?? null },
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/auftraege/${out}`);
	revalidatePath(`${PATH}/befunde/${d.findingId}`);
	return { ok: true, data: undefined };
}

export const createEngagement = safeAction(
	"createEngagement",
	createEngagementImpl,
);
export const updateEngagement = safeAction(
	"updateEngagement",
	updateEngagementImpl,
);
export const uploadEngagementFile = safeAction(
	"uploadEngagementFile",
	uploadEngagementFileImpl,
);
export const setEngagementStatus = safeAction(
	"setEngagementStatus",
	setEngagementStatusImpl,
);
export const addEngagementFinding = safeAction(
	"addEngagementFinding",
	addEngagementFindingImpl,
);
export const retestFinding = safeAction("retestFinding", retestFindingImpl);
