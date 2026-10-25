"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { inviteMember } from "@/app/actions/team";
import {
	assessmentAnswers,
	orgSettings,
	providers,
	roleAssignments,
	sites,
} from "@/db/schema";
import type { EntityProfile } from "@/db/schema/platform";
import { safeAction } from "@/lib/actions/safe";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import { insertSelfAssessment } from "@/lib/assessments/create-service";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { requiredFunctions } from "@/lib/compliance/catalog/required-functions";
import {
	classifyCompany,
	prefillFromSetup,
} from "@/lib/compliance/company-profile";
import { syncOwnersAndNotify } from "@/lib/compliance/function-owners";
import {
	activeFrameworkSlugs,
	addOrgFrameworks,
	initializeOrg,
} from "@/lib/compliance/initialize-org";
import { getOrgProfile } from "@/lib/compliance/queries";
import {
	appetiteFromMethod,
	defaultRiskMethod,
} from "@/lib/compliance/risk-method";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import {
	markStepDone,
	SETUP_FLAG,
	type SetupStep,
	setupState,
} from "@/lib/setup/steps";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	activitySchema,
	companyProfileSchema,
	deleteSiteSchema,
	itDataSchema,
	setupAssignSchema,
	setupFrameworksSchema,
	setupGapSchema,
	setupStepSchema,
	siteSchema,
} from "@/lib/validation/setup";

// Geführte Einrichtung (D0–D5): jeder Schritt speichert sofort in die
// Register und ins Profil. Bis die Einrichtung abgeschlossen ist, genügt
// settings:update ohne Step-up (frisch angemeldet, Organisation leer);
// danach laufen Änderungen über Einstellungen mit Step-up.

const PATH = "/einrichtung";

async function loadSettings(tx: OrgTx, orgId: string) {
	const [s] = await tx
		.select({
			flags: orgSettings.setupFlags,
			entity: orgSettings.entityProfile,
			riskMethod: orgSettings.riskMethod,
			nis2Status: orgSettings.nis2Status,
			sector: orgSettings.sector,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return s ?? null;
}

async function markStep(
	tx: OrgTx,
	orgId: string,
	flags: Record<string, string>,
	step: SetupStep,
): Promise<AuditInput> {
	const next = markStepDone(flags, step, new Date());
	await tx
		.update(orgSettings)
		.set({ setupFlags: next })
		.where(eq(orgSettings.organizationId, orgId));
	return {
		action: "org.setup_step",
		target: `organization:${orgId}`,
		after: { step, done: next[SETUP_FLAG.done] },
	};
}

// Nach Abschluss der Einrichtung keine Abkürzung mehr an Step-up vorbei
async function requireSetup(perm: Parameters<typeof requireOrg>[0]) {
	const c = await requireOrg(perm);
	const open = await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		return { result: !setupState(s?.flags ?? {}).completed, audit: [] };
	});
	return { c, open };
}

// ── Schritt 1: Rollen & Rechte ────────────────────────────────────────────

async function setupAssignFunctionImpl(
	input: unknown,
): Promise<
	ActionResult<{ id: string; inviteUrl: string | null; mailed: boolean | null }>
> {
	// in der Einrichtung ohne Step-up, danach wie unter /organisation
	const { c, open } = await requireSetup({ role_assignment: ["update"] });
	if (!open) await requireStepUp();
	const parsed = setupAssignSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const holderId =
		d.mode === "me" ? c.userId : d.mode === "member" ? d.userId : null;
	if (d.deputyUserId && d.deputyUserId === holderId)
		return {
			ok: false,
			error: "invalid",
			fieldErrors: {
				deputyUserId: ["Die Vertretung muss eine andere Person sein."],
			},
		};
	let inviteUrl: string | null = null;
	let mailed: boolean | null = null;
	if (d.mode === "invite") {
		const inv = await inviteMember({
			email: d.email,
			role: d.role,
			sendMail: d.sendMail,
		});
		// schon eingeladen oder schon Mitglied („already …“ von Better Auth):
		// Funktion trotzdem vormerken
		if (inv.ok) {
			inviteUrl = inv.data.url;
			mailed = inv.data.mailed;
		} else if (!/already/i.test(inv.error))
			return { ok: false, error: inv.error };
	}
	const values = {
		userId: holderId,
		externalName: d.mode === "invite" || d.mode === "external" ? d.name : null,
		pendingEmail: d.mode === "invite" ? d.email.toLowerCase() : null,
		deputyUserId: d.deputyUserId ?? null,
	};
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const rows = await tx
			.select()
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, c.orgId),
					eq(roleAssignments.function, d.function),
				),
			);
		// geändert wird nur die gewählte Zeile; dieselbe Person nie doppelt
		const existing =
			rows.find((r) => r.id === d.id) ??
			(holderId ? rows.find((r) => r.userId === holderId) : undefined);
		if (d.id && !existing) return { result: null, audit: [] };
		if (existing) {
			await tx
				.update(roleAssignments)
				.set(values)
				.where(eq(roleAssignments.id, existing.id));
			await syncOwnersAndNotify(tx, c.orgId, c.userId);
			return {
				result: existing.id,
				audit: {
					action: "role_assignment.update",
					target: `role_assignment:${existing.id}`,
					before: {
						userId: existing.userId,
						externalName: existing.externalName,
						pendingEmail: existing.pendingEmail,
						deputyUserId: existing.deputyUserId,
					},
					after: { function: d.function, ...values, via: "setup" },
				},
			};
		}
		const [row] = await tx
			.insert(roleAssignments)
			.values({
				organizationId: c.orgId,
				function: d.function,
				appointedAt: new Date().toISOString().slice(0, 10),
				...values,
			})
			.returning({ id: roleAssignments.id });
		if (!row) throw new Error("insert failed");
		await syncOwnersAndNotify(tx, c.orgId, c.userId);
		return {
			result: row.id,
			audit: {
				action: "role_assignment.create",
				target: `role_assignment:${row.id}`,
				after: { function: d.function, ...values, via: "setup" },
			},
		};
	});
	if (!id) return { ok: false, error: "notFound" };
	revalidatePath(PATH, "layout");
	return { ok: true, data: { id, inviteUrl, mailed } };
}

async function setupRemoveAssignmentImpl(
	input: unknown,
): Promise<ActionResult> {
	const { c, open } = await requireSetup({ role_assignment: ["update"] });
	if (!open) await requireStepUp();
	const parsed = deleteSiteSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.delete(roleAssignments)
			.where(
				and(
					eq(roleAssignments.id, parsed.data.id),
					eq(roleAssignments.organizationId, c.orgId),
				),
			)
			.returning();
		if (!row) return { result: false, audit: [] };
		await syncOwnersAndNotify(tx, c.orgId, c.userId);
		return {
			result: true,
			audit: {
				action: "role_assignment.delete",
				target: `role_assignment:${row.id}`,
				before: { function: row.function, userId: row.userId, via: "setup" },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// ── Schritte abschließen / später fortsetzen ──────────────────────────────

async function completeSetupStepImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = setupStepSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		return {
			result: null,
			audit: await markStep(tx, c.orgId, s?.flags ?? {}, parsed.data.step),
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

async function deferSetupImpl(): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		const flags = {
			...(s?.flags ?? {}),
			[SETUP_FLAG.deferred]: new Date().toISOString(),
		};
		await tx
			.update(orgSettings)
			.set({ setupFlags: flags })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "org.setup_deferred",
				target: `organization:${c.orgId}`,
			},
		};
	});
	revalidatePath("/heute");
	return { ok: true, data: undefined };
}

// ── Schritt 2: Unternehmen & Größe ────────────────────────────────────────

async function saveCompanyProfileImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = companyProfileSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		if (!s) return { result: null, audit: [] };
		const entity: EntityProfile = { ...s.entity, ...d };
		const cls = classifyCompany(entity, s.sector);
		// NIS2-Status nur setzen, solange niemand ihn geprüft hat
		const nis2Status =
			s.nis2Status === "unchecked"
				? cls.nis2 === "essential" || cls.nis2 === "important"
					? ("affected_pending" as const)
					: cls.size
						? ("not_affected" as const)
						: s.nis2Status
				: s.nis2Status;
		await tx
			.update(orgSettings)
			.set({ entityProfile: entity, nis2Status })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: [
				{
					action: "org.entity_profile",
					target: `organization:${c.orgId}`,
					before: s.entity,
					after: { ...entity, classification: cls },
				},
				await markStep(tx, c.orgId, s.flags, "unternehmen"),
			],
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

// ── Schritt 3: Standorte ──────────────────────────────────────────────────

async function addSiteImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ asset: ["create"] });
	const parsed = siteSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.insert(sites)
			.values({
				organizationId: c.orgId,
				name: d.name,
				kind: d.kind,
				country: d.country?.toUpperCase() ?? null,
				city: d.city ?? null,
				employees: d.employees ?? null,
				critical: d.critical,
				ownerUserId: c.userId,
			})
			.returning({ id: sites.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "site.create",
				target: `site:${row.id}`,
				after: d,
			},
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: { id } };
}

async function deleteSiteImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ asset: ["delete"] });
	const parsed = deleteSiteSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.delete(sites)
			.where(
				and(eq(sites.id, parsed.data.id), eq(sites.organizationId, c.orgId)),
			)
			.returning();
		if (!row) return { result: false, audit: [] };
		return {
			result: true,
			audit: {
				action: "site.delete",
				target: `site:${row.id}`,
				before: { name: row.name, kind: row.kind },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// ── Schritt 4: Tätigkeit & Lizenz ─────────────────────────────────────────

async function saveActivityImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = activitySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		const p = await getOrgProfile(tx, c.orgId);
		if (!s || !p) return { result: null, audit: [] };
		await tx
			.update(orgSettings)
			.set({
				sector: d.sector,
				licenceStage: d.licenceStage,
				caspServices: d.caspServices,
				issuesTokens: d.issuesTokens,
				entityProfile: { ...s.entity, digitalProducts: d.digitalProducts },
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		// Anwendbarkeit und Arbeitsvorrat folgen der Tätigkeit
		const init =
			p.frameworks.length > 0
				? await initializeOrg(tx, {
						orgId: c.orgId,
						userId: c.userId,
						frameworks: p.frameworks,
						sector: d.sector,
						licenceStage: d.licenceStage,
						caspServices: d.caspServices,
						applyBaseline: p.profile.applyBaseline,
						tlptDesignated: p.profile.tlptDesignated,
						issuesTokens: d.issuesTokens,
						productRoles: p.profile.productRoles,
					})
				: null;
		await ensureOrgWorkflows(tx, c.orgId, d.licenceStage);
		return {
			result: null,
			audit: [
				{
					action: "org.activity",
					target: `organization:${c.orgId}`,
					before: {
						sector: p.profile.sector,
						licenceStage: p.profile.licenceStage,
						caspServices: p.profile.caspServices,
						issuesTokens: p.profile.issuesTokens,
					},
					after: { ...d, init },
				},
				await markStep(tx, c.orgId, s.flags, "taetigkeit"),
			],
		};
	});
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

// ── Schritt 5: IT, Dienstleister & Daten ──────────────────────────────────

async function saveItDataImpl(
	input: unknown,
): Promise<ActionResult<{ providersCreated: number }>> {
	const c = await requireOrg({ settings: ["update"], provider: ["create"] });
	const parsed = itDataSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { providers: list, ...data } = parsed.data;
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		if (!s) return { result: 0, audit: [] };
		await tx
			.update(orgSettings)
			.set({ entityProfile: { ...s.entity, ...data } })
			.where(eq(orgSettings.organizationId, c.orgId));
		const existing = await tx
			.select({ name: providers.name })
			.from(providers)
			.where(eq(providers.organizationId, c.orgId));
		const known = new Set(existing.map((p) => p.name.trim().toLowerCase()));
		const audit: AuditInput[] = [
			{
				action: "org.it_data",
				target: `organization:${c.orgId}`,
				before: {
					itOperation: s.entity.itOperation ?? null,
					personalData: s.entity.personalData ?? [],
				},
				after: data,
			},
		];
		let n = 0;
		for (const p of list) {
			const key = p.name.trim().toLowerCase();
			if (known.has(key)) continue;
			known.add(key);
			const [row] = await tx
				.insert(providers)
				.values({
					organizationId: c.orgId,
					name: p.name,
					serviceDescription: p.service ?? null,
					category: p.category,
					criticality: p.critical ? "critical" : "standard",
					isIct: p.category === "it_service" || p.category === "cloud",
					ownerUserId: c.userId,
					status: "active",
				})
				.returning({ id: providers.id });
			if (!row) continue;
			n += 1;
			audit.push({
				action: "provider.create",
				target: `provider:${row.id}`,
				after: { name: p.name, category: p.category, via: "setup" },
			});
		}
		audit.push(await markStep(tx, c.orgId, s.flags, "it-daten"));
		return { result: n, audit };
	});
	revalidatePath(PATH, "layout");
	revalidatePath("/dienstleister");
	return { ok: true, data: { providersCreated: created } };
}

// ── Schritt 6: Rahmenwerke ────────────────────────────────────────────────

async function saveSetupFrameworksImpl(
	input: unknown,
): Promise<ActionResult<{ added: string[]; controlsCreated: number }>> {
	const { c, open } = await requireSetup({ settings: ["update"] });
	if (!open) return { ok: false, error: "setup_completed" };
	const parsed = setupFrameworksSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const slugs = parsed.data.frameworks.filter((s) => FRAMEWORK_BY_SLUG.has(s));
	if (slugs.length === 0) return { ok: false, error: "unknownFramework" };
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		const p = await getOrgProfile(tx, c.orgId);
		if (!s || !p) return { result: null, audit: [] };
		const added = await addOrgFrameworks(tx, c.orgId, slugs, c.userId);
		const all = await activeFrameworkSlugs(tx, c.orgId);
		const init = await initializeOrg(tx, {
			orgId: c.orgId,
			userId: c.userId,
			frameworks: all,
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			applyBaseline: p.profile.applyBaseline,
			tlptDesignated: p.profile.tlptDesignated,
			issuesTokens: p.profile.issuesTokens,
			productRoles: p.profile.productRoles,
		});
		// Risikomethodik: Vorlage um die Schadensarten der Rahmenwerke
		// ergänzen, solange die Org sie nicht selbst angepasst hat
		const untouched =
			!s.riskMethod ||
			JSON.stringify(s.riskMethod) === JSON.stringify(defaultRiskMethod([]));
		if (untouched) {
			const method = defaultRiskMethod(all);
			await tx
				.update(orgSettings)
				.set({ riskMethod: method, riskAppetite: appetiteFromMethod(method) })
				.where(eq(orgSettings.organizationId, c.orgId));
		}
		return {
			result: { added, controlsCreated: init.controlsCreated },
			audit: [
				{
					action: "org.frameworks_added",
					target: `organization:${c.orgId}`,
					before: { frameworks: p.frameworks },
					after: { frameworks: all, init, via: "setup" },
				},
				await markStep(tx, c.orgId, s.flags, "rahmenwerke"),
			],
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath("/", "layout");
	return { ok: true, data: out };
}

// ── Schritt 7: Gap-Analyse starten, vorbelegt aus der Einrichtung ─────────

async function startSetupGapAnalysisImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; prefilled: number }>> {
	const c = await requireOrg({ assessment: ["create"] });
	const parsed = setupGapSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const s = await loadSettings(tx, c.orgId);
		const p = await getOrgProfile(tx, c.orgId);
		if (!s || !p) return { result: null, audit: [] };
		const created = await insertSelfAssessment(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			{
				frameworks: parsed.data.frameworks,
				title: "Gap-Analyse aus der Einrichtung",
			},
		);
		if (!created) return { result: null, audit: [] };
		const [roles, siteRows, providerCount] = await Promise.all([
			tx
				.select({ function: roleAssignments.function })
				.from(roleAssignments)
				.where(eq(roleAssignments.organizationId, c.orgId)),
			tx
				.select({ kind: sites.kind })
				.from(sites)
				.where(eq(sites.organizationId, c.orgId)),
			tx
				.select({ n: sql<number>`count(*)::int` })
				.from(providers)
				.where(eq(providers.organizationId, c.orgId)),
		]);
		const required = requiredFunctions(p.frameworks, p.profile.licenceStage);
		const assigned = new Set(roles.map((r) => r.function));
		const prefill = prefillFromSetup(
			{
				functionsAssigned: required.filter((f) => assigned.has(f.function))
					.length,
				functionsRequired: required.length,
				sites: siteRows.length,
				ownDatacenter: siteRows.some((x) => x.kind === "datacenter"),
				itOperation: s.entity.itOperation,
				providers: providerCount[0]?.n ?? 0,
				profileComplete: Boolean(s.entity.employees && s.entity.country),
			},
			new Set(created.questionCodes),
		);
		if (prefill.size > 0)
			await tx.insert(assessmentAnswers).values(
				[...prefill].map(([code, v]) => ({
					organizationId: c.orgId,
					assessmentId: created.id,
					questionCode: code,
					answer: v.answer,
					comment: v.comment,
					answeredByUserId: c.userId,
				})),
			);
		return {
			result: { id: created.id, prefilled: prefill.size },
			audit: [
				created.audit,
				await markStep(tx, c.orgId, s.flags, "gap-analyse"),
			],
		};
	});
	if (!out) return { ok: false, error: "noQuestions" };
	revalidatePath("/", "layout");
	return { ok: true, data: out };
}

export const setupAssignFunction = safeAction(
	"setupAssignFunction",
	setupAssignFunctionImpl,
);
export const setupRemoveAssignment = safeAction(
	"setupRemoveAssignment",
	setupRemoveAssignmentImpl,
);
export const completeSetupStep = safeAction(
	"completeSetupStep",
	completeSetupStepImpl,
);
export const deferSetup = safeAction("deferSetup", deferSetupImpl);
export const saveCompanyProfile = safeAction(
	"saveCompanyProfile",
	saveCompanyProfileImpl,
);
export const addSite = safeAction("addSite", addSiteImpl);
export const deleteSite = safeAction("deleteSite", deleteSiteImpl);
export const saveActivity = safeAction("saveActivity", saveActivityImpl);
export const saveItData = safeAction("saveItData", saveItDataImpl);
export const saveSetupFrameworks = safeAction(
	"saveSetupFrameworks",
	saveSetupFrameworksImpl,
);
export const startSetupGapAnalysis = safeAction(
	"startSetupGapAnalysis",
	startSetupGapAnalysisImpl,
);
