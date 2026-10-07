import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
	assets,
	controlImplementations,
	controls,
	frameworks,
	orgFrameworks,
	providers,
	requirementApplicability,
	requirements,
} from "@/db/schema";
import type { CaspService, LicenceStage } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import { deriveApplicability } from "./applicability";
import { BASELINE, EDGES, splitRequirementKey } from "./catalog";
import { toProfile } from "./catalog-view";

// Initialisiert (oder aktualisiert) den Arbeitsvorrat einer Organisation aus
// ihrem Profil — idempotent, läuft innerhalb von withOrg/mutateOrg:
//   1. requirement_applicability: abgeleitete N/A-Entscheidungen (services,
//      stage, rule, lex_specialis). Manuelle Entscheidungen bleiben.
//   2. control_implementations: Vereinigung aller Controls mit ≥ 1 Kante zu
//      einer anwendbaren Anforderung der gewählten Rahmenwerke. Bestehende
//      Zeilen bleiben; mit applyBaseline übernehmen nicht-manuelle Zeilen den
//      Baseline-Status.
//   3. Baseline-Dienstleister und -Assets (nur applyBaseline, nur wenn fehlend).
// Rahmenwerk später hinzufügen oder Stufe wechseln → dieselbe Funktion.

export type InitializeOrgInput = {
	orgId: string;
	userId: string;
	frameworks: readonly string[];
	sector: "casp" | "bank" | "payment" | "emi" | "other";
	licenceStage: LicenceStage;
	caspServices: readonly CaspService[];
	applyBaseline: boolean;
	tlptDesignated?: boolean;
	issuesTokens?: "none" | "art" | "emt" | "other";
};

export type InitializeOrgSummary = {
	requirements: number;
	notApplicable: number;
	controls: number;
	controlsCreated: number;
	baselineApplied: number;
	providersCreated: number;
	assetsCreated: number;
};

export async function initializeOrg(
	tx: OrgTx,
	input: InitializeOrgInput,
): Promise<InitializeOrgSummary> {
	const profile = toProfile({
		sector: input.sector,
		licenceStage: input.licenceStage,
		caspServices: input.caspServices,
		frameworks: input.frameworks,
		tlptDesignated: input.tlptDesignated,
		issuesTokens: input.issuesTokens,
	});

	// Anforderungen der gewählten Rahmenwerke (DB-IDs).
	const reqRows =
		input.frameworks.length === 0
			? []
			: await tx
					.select({
						id: requirements.id,
						code: requirements.code,
						framework: frameworks.slug,
						services: requirements.services,
						appliesFromStage: requirements.appliesFromStage,
						appliesToRoles: requirements.appliesToRoles,
						effectiveFrom: requirements.effectiveFrom,
						effectiveUntil: requirements.effectiveUntil,
						legalStatus: requirements.legalStatus,
					})
					.from(requirements)
					.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
					.where(inArray(frameworks.slug, [...input.frameworks]));

	// 1) Anwendbarkeit
	const applicableKeys = new Set<string>();
	let notApplicable = 0;
	const derivedNa: {
		requirementId: string;
		source: "services" | "lex_specialis" | "stage" | "rule";
		note: string | null;
	}[] = [];
	for (const r of reqRows) {
		const d = deriveApplicability(
			{
				framework: r.framework,
				code: r.code,
				services: r.services,
				appliesFromStage: r.appliesFromStage,
				appliesToRoles: r.appliesToRoles,
				effectiveFrom: r.effectiveFrom,
				effectiveUntil: r.effectiveUntil,
				legalStatus: r.legalStatus,
			},
			profile,
		);
		if (d.applicable) {
			applicableKeys.add(`${r.framework}:${r.code}`);
		} else {
			notApplicable += 1;
			derivedNa.push({
				requirementId: r.id,
				source: d.source === "default" ? "rule" : d.source,
				note: d.note ?? null,
			});
		}
	}
	// Abgeleitete (nicht-manuelle) Zeilen zurücksetzen und neu schreiben;
	// manuelle Entscheidungen bleiben unberührt.
	if (reqRows.length > 0) {
		await tx.delete(requirementApplicability).where(
			and(
				eq(requirementApplicability.organizationId, input.orgId),
				ne(requirementApplicability.source, "manual"),
				inArray(
					requirementApplicability.requirementId,
					reqRows.map((r) => r.id),
				),
			),
		);
	}
	if (derivedNa.length > 0) {
		await tx
			.insert(requirementApplicability)
			.values(
				derivedNa.map((d) => ({
					organizationId: input.orgId,
					requirementId: d.requirementId,
					applicable: false,
					source: d.source,
					note: d.note,
				})),
			)
			.onConflictDoNothing();
	}
	// Manuelle Entscheidungen überlagern die Ableitung.
	const manual = await tx
		.select({
			requirementId: requirementApplicability.requirementId,
			applicable: requirementApplicability.applicable,
		})
		.from(requirementApplicability)
		.where(
			and(
				eq(requirementApplicability.organizationId, input.orgId),
				eq(requirementApplicability.source, "manual"),
			),
		);
	const keyById = new Map(
		reqRows.map((r) => [r.id, `${r.framework}:${r.code}`]),
	);
	for (const m of manual) {
		const key = keyById.get(m.requirementId);
		if (!key) continue;
		if (m.applicable) applicableKeys.add(key);
		else applicableKeys.delete(key);
	}

	// 2) Controls mit ≥ 1 Kante zu einer anwendbaren Anforderung
	const neededCodes = new Set<string>();
	for (const e of EDGES) {
		if (applicableKeys.has(e.requirement)) neededCodes.add(e.control);
	}
	// Baseline-Controls gehören bei der Betreiber-Org immer dazu — auch wenn
	// (noch) kein gewähltes Rahmenwerk sie fordert.
	if (input.applyBaseline) {
		for (const b of BASELINE.controls) neededCodes.add(b.code);
	}
	const controlRows =
		neededCodes.size === 0
			? []
			: await tx
					.select({ id: controls.id, code: controls.code })
					.from(controls)
					.where(inArray(controls.code, [...neededCodes]));

	let controlsCreated = 0;
	if (controlRows.length > 0) {
		const inserted = await tx
			.insert(controlImplementations)
			.values(
				controlRows.map((c) => ({
					organizationId: input.orgId,
					controlId: c.id,
					status: "not_started" as const,
					source: "onboarding" as const,
					ownerUserId: input.userId,
				})),
			)
			.onConflictDoNothing()
			.returning({ id: controlImplementations.id });
		controlsCreated = inserted.length;
	}

	// Baseline-Status übernehmen (nur nicht-manuelle Zeilen).
	let baselineApplied = 0;
	if (input.applyBaseline) {
		const idByCode = new Map(controlRows.map((c) => [c.code, c.id]));
		for (const b of BASELINE.controls) {
			const cid = idByCode.get(b.code);
			if (!cid) continue;
			const res = await tx
				.update(controlImplementations)
				.set({
					status: b.status,
					note: b.note,
					source: "baseline",
					implementedAt: b.status === "implemented" ? new Date() : null,
				})
				.where(
					and(
						eq(controlImplementations.organizationId, input.orgId),
						eq(controlImplementations.controlId, cid),
						ne(controlImplementations.source, "manual"),
					),
				)
				.returning({ id: controlImplementations.id });
			baselineApplied += res.length;
		}
	}

	// 3) Baseline-Dienstleister und -Assets
	let providersCreated = 0;
	let assetsCreated = 0;
	if (input.applyBaseline) {
		const existingProviders = new Set(
			(
				await tx
					.select({ name: providers.name })
					.from(providers)
					.where(eq(providers.organizationId, input.orgId))
			).map((p) => p.name),
		);
		const providerIdByName = new Map<string, string>();
		for (const p of BASELINE.providers) {
			if (existingProviders.has(p.name)) continue;
			const [row] = await tx
				.insert(providers)
				.values({
					organizationId: input.orgId,
					name: p.name,
					partnerType: p.partnerType,
					isIct: true,
					isOutsourcing: p.partnerType === "outsourcing",
					isMaterial: p.isMaterial,
					serviceDescription: p.serviceDescription,
					serviceType: p.serviceType,
					criticality: p.criticality,
					country: p.country,
					dataLocations: p.dataLocations,
					processesPersonalData: p.processesPersonalData,
					ownerUserId: input.userId,
				})
				.returning({ id: providers.id, name: providers.name });
			if (row) {
				providerIdByName.set(row.name, row.id);
				providersCreated += 1;
			}
		}
		const existingAssets = new Set(
			(
				await tx
					.select({ name: assets.name })
					.from(assets)
					.where(eq(assets.organizationId, input.orgId))
			).map((a) => a.name),
		);
		if (providerIdByName.size < BASELINE.providers.length) {
			const all = await tx
				.select({ id: providers.id, name: providers.name })
				.from(providers)
				.where(eq(providers.organizationId, input.orgId));
			for (const p of all) providerIdByName.set(p.name, p.id);
		}
		for (const a of BASELINE.assets) {
			if (existingAssets.has(a.name)) continue;
			await tx.insert(assets).values({
				organizationId: input.orgId,
				name: a.name,
				type: a.type,
				classification: a.classification,
				description: a.description,
				providerId: a.provider
					? (providerIdByName.get(a.provider) ?? null)
					: null,
				ownerUserId: input.userId,
			});
			assetsCreated += 1;
		}
	}

	return {
		requirements: reqRows.length,
		notApplicable,
		controls: controlRows.length,
		controlsCreated,
		baselineApplied,
		providersCreated,
		assetsCreated,
	};
}

// Rahmenwerke einer Org (aktive Slugs) — für Re-Initialisierung.
export async function activeFrameworkSlugs(
	tx: OrgTx,
	orgId: string,
): Promise<string[]> {
	const rows = await tx
		.select({ slug: frameworks.slug })
		.from(orgFrameworks)
		.innerJoin(frameworks, eq(frameworks.id, orgFrameworks.frameworkId))
		.where(
			and(
				eq(orgFrameworks.organizationId, orgId),
				eq(orgFrameworks.status, "active"),
			),
		)
		.orderBy(frameworks.sortOrder);
	return rows.map((r) => r.slug);
}

// Rahmenwerke hinzufügen (org_frameworks) — Initialisierung ruft der Aufrufer.
export async function addOrgFrameworks(
	tx: OrgTx,
	orgId: string,
	slugs: readonly string[],
	ownerUserId: string,
): Promise<string[]> {
	if (slugs.length === 0) return [];
	const fws = await tx
		.select({ id: frameworks.id, slug: frameworks.slug })
		.from(frameworks)
		.where(inArray(frameworks.slug, [...slugs]));
	if (fws.length === 0) return [];
	await tx
		.insert(orgFrameworks)
		.values(
			fws.map((f) => ({
				organizationId: orgId,
				frameworkId: f.id,
				ownerUserId,
				status: "active" as const,
			})),
		)
		.onConflictDoUpdate({
			target: [orgFrameworks.organizationId, orgFrameworks.frameworkId],
			set: { status: "active", enabledAt: sql`now()` },
		});
	return fws.map((f) => f.slug);
}

export { splitRequirementKey };
