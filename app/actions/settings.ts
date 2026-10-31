"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { type EntityProfile, evidence, orgSettings, risks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { auth } from "@/lib/auth/server";
import { AuthError } from "@/lib/auth/session-rules";
import type { OrgAuditSettings } from "@/lib/compliance/audit-follow-up";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	appetiteFromMethod,
	levelCount,
	rescaleRiskValues,
} from "@/lib/compliance/risk-method";
import {
	insertMembers,
	insertOrganization,
	internalMembersOf,
} from "@/lib/db/admin-orgs";
import { orgAccount, saveOrgAccount } from "@/lib/db/org-accounts";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { withDlpDefaults } from "@/lib/dlp/policy";
import { DEFAULT_PREFIXES } from "@/lib/documents/numbering";
import { TERMS_FLAG, termsAccepted } from "@/lib/legal/terms";
import { logger } from "@/lib/log";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { seedEmptyOrg } from "@/lib/org/seed";
import { wipeOrganization } from "@/lib/org/wipe";
import { dlpRelaxed } from "@/lib/security-changes/rules";
import {
	requestApplyChange,
	requirePermit,
} from "@/lib/security-changes/service";
import { auditRegimeSchema } from "@/lib/validation/audit-regimes";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { dlpPolicySchema, entityProfileSchema } from "@/lib/validation/org";
import { updateRiskMethodSchema } from "@/lib/validation/risk-method";
import { supplierMethodSchema } from "@/lib/validation/supplier-method";

async function stepUp(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		return { ok: true, ctx: await requireStepUp({ settings: ["update"] }) };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
}

async function updateRiskMethodImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = updateRiskMethodSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { method, allowSelfApproval } = parsed.data;
	const appetite = appetiteFromMethod(method);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				riskMethod: orgSettings.riskMethod,
				riskAppetite: orgSettings.riskAppetite,
				allowSelfApproval: orgSettings.allowSelfApproval,
				setupFlags: orgSettings.setupFlags,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		// Stufenzahl geändert (z. B. Vorlage BSI 200-3): Bewertungen
		// umrechnen und zur Prüfung fällig stellen
		const fromLevels = before?.riskMethod ? levelCount(before.riskMethod) : 5;
		const toLevels = levelCount(method);
		let rescaled = 0;
		if (fromLevels !== toLevels) {
			const today = new Date().toISOString().slice(0, 10);
			const rows = await tx
				.select({
					id: risks.id,
					likelihood: risks.likelihood,
					impact: risks.impact,
					residualLikelihood: risks.residualLikelihood,
					residualImpact: risks.residualImpact,
					impactDetail: risks.impactDetail,
					reviewAt: risks.reviewAt,
				})
				.from(risks)
				.where(eq(risks.organizationId, c.orgId));
			for (const r of rows) {
				const next = rescaleRiskValues(r, fromLevels, toLevels);
				await tx
					.update(risks)
					.set({
						likelihood: next.likelihood,
						impact: next.impact,
						residualLikelihood: next.residualLikelihood,
						residualImpact: next.residualImpact,
						impactDetail: next.impactDetail,
						reviewAt: r.reviewAt && r.reviewAt < today ? r.reviewAt : today,
					})
					.where(eq(risks.id, r.id));
			}
			rescaled = rows.length;
		}
		await tx
			.update(orgSettings)
			.set({
				riskMethod: method,
				riskAppetite: appetite,
				allowSelfApproval,
				setupFlags: {
					...(before?.setupFlags ?? {}),
					riskMethodConfirmedAt: new Date().toISOString(),
				},
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.risk_method",
				target: `organization:${c.orgId}`,
				before: before
					? {
							riskMethod: before.riskMethod,
							riskAppetite: before.riskAppetite,
							allowSelfApproval: before.allowSelfApproval,
						}
					: null,
				after: {
					riskMethod: method,
					riskAppetite: appetite,
					allowSelfApproval,
					...(rescaled > 0
						? {
								risksRescaled: {
									count: rescaled,
									from: fromLevels,
									to: toLevels,
								},
							}
						: {}),
				},
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/risiken", "layout");
	return { ok: true, data: undefined };
}

async function updateSupplierMethodImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = supplierMethodSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const method = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ supplierMethod: orgSettings.supplierMethod })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ supplierMethod: method })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.supplier_method",
				target: `organization:${c.orgId}`,
				before: before ?? null,
				after: { supplierMethod: method },
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/dienstleister", "layout");
	return { ok: true, data: undefined };
}

const numberingSchema = z.object({
	numbering: z.record(
		z.string(),
		z.object({
			prefix: z.string().regex(/^[A-Z]{1,5}$/, "1–5 Grossbuchstaben"),
			next: z.coerce.number().int().min(1).max(99999),
		}),
	),
});

// Audits und Nacharbeitsfristen je Rahmenwerk; null = Katalogwerte
async function updateAuditRegimeImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = auditRegimeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { framework, setting } = parsed.data;
	if (!FRAMEWORK_BY_SLUG.has(framework)) return { ok: false, error: "invalid" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ auditRegimes: orgSettings.auditRegimes })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		const all = { ...((row?.auditRegimes ?? {}) as OrgAuditSettings) };
		const before = all[framework] ?? null;
		if (setting) all[framework] = setting;
		else delete all[framework];
		await tx
			.update(orgSettings)
			.set({ auditRegimes: all })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.audit_regime",
				target: `organization:${c.orgId}`,
				before: { framework, setting: before },
				after: { framework, setting },
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/kalender");
	revalidatePath("/audits", "layout");
	return { ok: true, data: undefined };
}

async function updateNumberingImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = numberingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const allowed = new Set(Object.keys(DEFAULT_PREFIXES));
	const numbering = Object.fromEntries(
		Object.entries(parsed.data.numbering).filter(([k]) => allowed.has(k)),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ documentNumbering: orgSettings.documentNumbering })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ documentNumbering: numbering })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.numbering",
				target: `organization:${c.orgId}`,
				before: before?.documentNumbering ?? null,
				after: numbering,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Stammdaten für Meldungen: LEI, Sitzland, Behörde, Bilanzsumme, Rechtsform,
// Registernummer — fließen in Informationsregister, Antrag, Lieferantenpaket.
async function updateEntityProfileImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = entityProfileSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const fields: EntityProfile = Object.fromEntries(
		Object.entries(parsed.data).filter(([, v]) => v !== undefined),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ entityProfile: orgSettings.entityProfile })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		// Nur die Stammdaten des Formulars ersetzen; Angaben aus der
		// Einrichtung (Größe, Daten, Varianten der Rahmenwerke) bleiben.
		const kept = Object.fromEntries(
			Object.entries(before?.entityProfile ?? {}).filter(
				([k]) => !(k in entityProfileSchema.shape),
			),
		);
		const next: EntityProfile = { ...kept, ...fields };
		await tx
			.update(orgSettings)
			.set({ entityProfile: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.entity_profile",
				target: `organization:${c.orgId}`,
				before: before?.entityProfile ?? null,
				after: next,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// DLP-Regeln (Upload-Inhaltsprüfung, Abfluss-Überwachung) — Owner, Step-up.
async function updateDlpPolicyImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = dlpPolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	// Vier-Augen (Härtung A4): lockern nur mit zweiter Person bzw. nach 24 h
	// Wartezeit; strenger wirkt sofort
	const [current] = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select({ dlpPolicy: orgSettings.dlpPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1),
	);
	const relaxed = dlpRelaxed(withDlpDefaults(current?.dlpPolicy), parsed.data);
	if (relaxed.length > 0)
		return requestApplyChange(c, {
			kind: "dlp_policy",
			targetKey: null,
			summary: "Datenabfluss-Regeln (DLP) lockern",
			payload: { value: parsed.data, relaxed },
			before: current?.dlpPolicy ?? null,
		});
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ dlpPolicy: orgSettings.dlpPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ dlpPolicy: parsed.data })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.dlp_policy",
				target: `organization:${c.orgId}`,
				before: before?.dlpPolicy ?? null,
				after: parsed.data,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Organisation löschen (Crypto-Shredding): Sitzungen der Mitglieder beenden,
// Nachweis-Dateien im Objektspeicher löschen, Organisation über Better Auth
// entfernen — die Kaskade löscht alle Org-Tabellen inklusive org_settings und
// damit den einzigen Ort des Mandantenschlüssels. Das Audit-Log der Org bleibt
// (append-only, ohne FK) als Spur; die Löschbestätigung geht per Mail an den
// Owner. Nur Owner, Step-up, Kurzname muss abgetippt werden.
const deleteOrgSchema = z.object({
	confirmSlug: z.string().trim().min(1).max(120),
	exportConfirmed: z.literal(true),
});

async function deleteOrganizationActionImpl(
	input: unknown,
): Promise<ActionResult<{ deletedAt: string }>> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = deleteOrgSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const org = await getOrgSummary(c.orgId);
	if (!org) return { ok: false, error: "notFound" };
	if (parsed.data.confirmSlug !== org.slug)
		return {
			ok: false,
			error: "slugMismatch",
			fieldErrors: { confirmSlug: ["slugMismatch"] },
		};
	// Vier-Augen (Härtung A4): zweite Person bzw. 24 h Wartezeit, dann darf
	// die anfragende Person einmal löschen
	const permit = await requirePermit(c, {
		kind: "org_delete",
		targetKey: null,
		summary: `Organisation „${org.name}“ löschen`,
	});
	if (!permit.ok) return permit;

	// 1) Bestand erfassen + letzter Eintrag in der Org-Kette.
	const { fileCount } = await mutateOrg(toOrgCtx(c), async (tx) => {
		const rows = await tx
			.select({ key: evidence.storageKey })
			// evidence:any-version — Organisation löschen: alle Dateien
			.from(evidence)
			.where(eq(evidence.organizationId, c.orgId));
		return {
			result: { fileCount: rows.filter((r) => r.key).length },
			audit: {
				action: "org.delete_requested",
				target: `organization:${c.orgId}`,
				after: { slug: org.slug, files: rows.length },
			},
		};
	});

	// 2) Dateien, fremde Sitzungen, Organisation samt Kaskade, Tombstone.
	const { filesDeleted, sessionsRevoked, deletedAt } = await wipeOrganization({
		orgId: c.orgId,
		keepUserId: c.userId,
		headers: await headers(),
	});

	// 3) Plattform-Audit + Löschbestätigung.
	await auditPlatform(
		{ userId: c.userId, ip: c.ip, userAgent: c.userAgent },
		{
			action: "org.deleted",
			organizationId: c.orgId,
			target: `organization:${c.orgId}`,
			after: {
				slug: org.slug,
				name: org.name,
				filesDeleted,
				filesExpected: fileCount,
				sessionsRevoked,
				deletedAt,
			},
		},
	);
	const mail = transactionalEmail({
		subject: `Löschbestätigung: ${org.name}`,
		eyebrow: "Löschbestätigung",
		title: `Die Organisation „${org.name}“ wurde gelöscht`,
		body: `Zeitpunkt: ${deletedAt}\nKurzname: ${org.slug}\nGelöschte Nachweis-Dateien: ${filesDeleted}\nBeendete Sitzungen anderer Mitglieder: ${sessionsRevoked}\n\nDer Mandantenschlüssel wurde mit den Organisationsdaten vernichtet (Crypto-Shredding). Sicherungen enthalten die Daten noch höchstens bis zum Ende der Backup-Aufbewahrung (30 Tage); wird in dieser Zeit eine Sicherung eingespielt, wird die Löschung automatisch erneut ausgeführt. Das Audit-Log der Organisation bleibt als Nachweis der Löschung erhalten.\n\nAufbewahrungspflichten (z. B. GwG § 8, HGB § 257) liegen bei der Organisation — bitte bewahre den Export entsprechend auf.`,
	});
	await sendTransactionalMail({ to: c.email, ...mail }).catch(() => undefined);
	return { ok: true, data: { deletedAt } };
}

// Neu beginnen (Admin-Portal Teil 8): alle Daten der Organisation weg und
// dieselbe Organisation leer neu angelegt — gleicher Name und Kurzname, die
// internen Mitglieder mit ihrer Rolle, Preisgruppe, Vertrag und Zustimmung
// zu den Nutzungsbedingungen bleiben. Gleiche Sicherungen wie Löschen:
// Step-up, Inhaber:in, Kurzname abtippen, Export bestätigt, Vier-Augen.
// Externe (Prüfer:innen, Berater:innen), SSO, IP-Liste, Integrationen,
// Trust Center und Rollen-Besetzungen fallen weg und werden neu eingerichtet.
async function resetOrganizationActionImpl(
	input: unknown,
): Promise<ActionResult<{ orgId: string }>> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = deleteOrgSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const org = await getOrgSummary(c.orgId);
	if (!org) return { ok: false, error: "notFound" };
	if (parsed.data.confirmSlug !== org.slug)
		return {
			ok: false,
			error: "slugMismatch",
			fieldErrors: { confirmSlug: ["slugMismatch"] },
		};
	const permit = await requirePermit(c, {
		kind: "org_reset",
		targetKey: null,
		summary: `Organisation „${org.name}“ neu beginnen`,
	});
	if (!permit.ok) return permit;

	// 1) Bestand merken, was bleibt; letzter Eintrag in der alten Kette.
	const members = (await internalMembersOf(c.orgId)).map((m) =>
		m.userId === c.userId ? { ...m, role: "owner" } : m,
	);
	const account = await orgAccount(c.orgId);
	const kept = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [s] = await tx
			.select({
				flags: orgSettings.setupFlags,
				group: orgSettings.priceGroupId,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		const flags = s?.flags ?? {};
		return {
			result: {
				priceGroupId: s?.group ?? null,
				terms: (termsAccepted(flags)
					? {
							[TERMS_FLAG.acceptedAt]: flags[TERMS_FLAG.acceptedAt] ?? "",
							[TERMS_FLAG.version]: flags[TERMS_FLAG.version] ?? "",
						}
					: {}) as Record<string, string>,
			},
			audit: {
				action: "org.reset_requested",
				target: `organization:${c.orgId}`,
				after: { slug: org.slug, members: members.length },
			},
		};
	});

	// 2) Alles weg (wie Löschen).
	const h = await headers();
	const wiped = await wipeOrganization({
		orgId: c.orgId,
		keepUserId: c.userId,
		headers: h,
	});

	// 3) Leer neu anlegen. Scheitert das, ist die Org gelöscht und die
	// Person landet im Onboarding — sie kann sie dort selbst neu anlegen.
	const newOrgId = await insertOrganization({ name: org.name, slug: org.slug });
	if (!newOrgId) {
		logger.error({ orgId: c.orgId }, "org reset: slug not free after wipe");
		return { ok: false, error: "reset_partial" };
	}
	try {
		await insertMembers(newOrgId, members);
		await mutateOrg(
			{ orgId: newOrgId, userId: c.userId, ip: c.ip, userAgent: c.userAgent },
			async (tx) => {
				const seeded = await seedEmptyOrg(tx, {
					orgId: newOrgId,
					userId: c.userId,
					priceGroupId: kept.priceGroupId,
					flags: kept.terms,
				});
				return {
					result: undefined,
					audit: {
						action: "org.reset_from",
						target: `organization:${newOrgId}`,
						after: {
							previousOrgId: c.orgId,
							members: members.length,
							...seeded,
						},
					},
				};
			},
		);
		if (account)
			await saveOrgAccount(
				{ userId: c.userId, ip: c.ip, userAgent: c.userAgent },
				newOrgId,
				{
					status: account.status,
					startedAt: account.startedAt,
					auditPassedAt: account.auditPassedAt,
					feeInvoicedFor: account.feeInvoicedFor,
					cancelledAt: account.cancelledAt,
					note: account.note,
				},
			);
		await auth.api.setActiveOrganization({
			body: { organizationId: newOrgId },
			headers: h,
		});
	} catch (err) {
		logger.error(
			{ err, orgId: c.orgId, newOrgId },
			"org reset: recreate failed",
		);
		return { ok: false, error: "reset_partial" };
	}

	await auditPlatform(
		{ userId: c.userId, ip: c.ip, userAgent: c.userAgent },
		{
			action: "org.reset",
			organizationId: newOrgId,
			target: `organization:${newOrgId}`,
			after: {
				previousOrgId: c.orgId,
				slug: org.slug,
				members: members.length,
				filesDeleted: wiped.filesDeleted,
				sessionsRevoked: wiped.sessionsRevoked,
				at: wiped.deletedAt,
			},
		},
	);
	const mail = transactionalEmail({
		subject: `Neu begonnen: ${org.name}`,
		eyebrow: "Organisation zurückgesetzt",
		title: `„${org.name}“ beginnt neu`,
		body: `Zeitpunkt: ${wiped.deletedAt}\nKurzname: ${org.slug}\nGelöschte Nachweis-Dateien: ${wiped.filesDeleted}\nMitglieder übernommen: ${members.length}\n\nAlle Inhalte, Nachweise und Dateien sind gelöscht, der alte Mandantenschlüssel ist vernichtet. Externe Zugänge, SSO, IP-Liste, Integrationen und Trust Center richtest du neu ein. Sicherungen enthalten die alten Daten noch höchstens bis zum Ende der Backup-Aufbewahrung.`,
	});
	await sendTransactionalMail({ to: c.email, ...mail }).catch(() => undefined);
	revalidatePath("/", "layout");
	return { ok: true, data: { orgId: newOrgId } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const resetOrganizationAction = safeAction(
	"resetOrganizationAction",
	resetOrganizationActionImpl,
);
export const updateRiskMethod = safeAction(
	"updateRiskMethod",
	updateRiskMethodImpl,
);
export const updateSupplierMethod = safeAction(
	"updateSupplierMethod",
	updateSupplierMethodImpl,
);
export const updateAuditRegime = safeAction(
	"updateAuditRegime",
	updateAuditRegimeImpl,
);
export const updateNumbering = safeAction(
	"updateNumbering",
	updateNumberingImpl,
);
export const updateEntityProfile = safeAction(
	"updateEntityProfile",
	updateEntityProfileImpl,
);
export const updateDlpPolicy = safeAction(
	"updateDlpPolicy",
	updateDlpPolicyImpl,
);
export const deleteOrganizationAction = safeAction(
	"deleteOrganizationAction",
	deleteOrganizationActionImpl,
);
