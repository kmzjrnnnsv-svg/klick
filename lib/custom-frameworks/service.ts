import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import {
	type CustomFramework,
	type CustomFrameworkSection,
	type CustomRequirement,
	type CustomRequirementControl,
	customFrameworkSections,
	customFrameworks,
	customRequirementControls,
	customRequirements,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import {
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog/controls";
import type { OrgTx } from "@/lib/db/with-org";
import type {
	CustomFrameworkInput,
	RequirementInput,
} from "@/lib/validation/custom-frameworks";
import {
	type CsvRequirement,
	customSlug,
	isCustomSlug,
	MAX_CUSTOM_FRAMEWORKS,
	MAX_CUSTOM_REQUIREMENTS,
	naturalCompare,
	suggestKey,
	uniqueKey,
} from "./rules";

// Eigene Rahmenwerke (R4): einziger Schreibweg. Jede Funktion läuft in der
// Transaktion des Aufrufers (mutateOrg) und gibt die Audit-Einträge zurück.

export class CustomFrameworkError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

type Ctx = { orgId: string; userId: string };

export type FrameworkWithCounts = CustomFramework & {
	slug: string;
	requirements: number;
	mapped: number;
};

export async function listCustomFrameworks(
	tx: OrgTx,
	orgId: string,
): Promise<FrameworkWithCounts[]> {
	const rows = await tx
		.select()
		.from(customFrameworks)
		.where(eq(customFrameworks.organizationId, orgId))
		.orderBy(asc(customFrameworks.name));
	if (rows.length === 0) return [];
	const reqs = await tx
		.select({
			frameworkId: customRequirements.frameworkId,
			id: customRequirements.id,
		})
		.from(customRequirements)
		.where(eq(customRequirements.organizationId, orgId));
	const mappedIds = new Set(
		(
			await tx
				.selectDistinct({ id: customRequirementControls.requirementId })
				.from(customRequirementControls)
				.where(eq(customRequirementControls.organizationId, orgId))
		).map((r) => r.id),
	);
	return rows.map((f) => {
		const own = reqs.filter((r) => r.frameworkId === f.id);
		return {
			...f,
			slug: customSlug(f.key),
			requirements: own.length,
			mapped: own.filter((r) => mappedIds.has(r.id)).length,
		};
	});
}

export type CustomFrameworkFull = {
	framework: CustomFramework;
	sections: CustomFrameworkSection[];
	requirements: (CustomRequirement & {
		controls: Pick<
			CustomRequirementControl,
			"controlCode" | "coverage" | "note"
		>[];
	})[];
};

export async function loadCustomFrameworks(
	tx: OrgTx,
	orgId: string,
	filter: { ids?: string[]; statuses?: CustomFramework["status"][] } = {},
): Promise<CustomFrameworkFull[]> {
	const conds = [eq(customFrameworks.organizationId, orgId)];
	if (filter.ids) conds.push(inArray(customFrameworks.id, filter.ids));
	if (filter.statuses)
		conds.push(inArray(customFrameworks.status, filter.statuses));
	const fws = await tx
		.select()
		.from(customFrameworks)
		.where(and(...conds));
	if (fws.length === 0) return [];
	const ids = fws.map((f) => f.id);
	const [sections, reqs] = await Promise.all([
		tx
			.select()
			.from(customFrameworkSections)
			.where(
				and(
					eq(customFrameworkSections.organizationId, orgId),
					inArray(customFrameworkSections.frameworkId, ids),
				),
			),
		tx
			.select()
			.from(customRequirements)
			.where(
				and(
					eq(customRequirements.organizationId, orgId),
					inArray(customRequirements.frameworkId, ids),
				),
			),
	]);
	const edges =
		reqs.length === 0
			? []
			: await tx
					.select()
					.from(customRequirementControls)
					.where(eq(customRequirementControls.organizationId, orgId));
	const edgesByReq = new Map<string, CustomRequirementControl[]>();
	for (const e of edges) {
		const list = edgesByReq.get(e.requirementId) ?? [];
		list.push(e);
		edgesByReq.set(e.requirementId, list);
	}
	return fws.map((framework) => ({
		framework,
		sections: sections
			.filter((s) => s.frameworkId === framework.id)
			.sort(
				(a, b) => a.sortOrder - b.sortOrder || naturalCompare(a.code, b.code),
			),
		requirements: reqs
			.filter((r) => r.frameworkId === framework.id)
			.sort(
				(a, b) => a.sortOrder - b.sortOrder || naturalCompare(a.code, b.code),
			)
			.map((r) => ({
				...r,
				controls: (edgesByReq.get(r.id) ?? []).map((e) => ({
					controlCode: e.controlCode,
					coverage: e.coverage,
					note: e.note,
				})),
			})),
	}));
}

async function frameworkOf(
	tx: OrgTx,
	orgId: string,
	id: string,
): Promise<CustomFramework> {
	const [f] = await tx
		.select()
		.from(customFrameworks)
		.where(
			and(
				eq(customFrameworks.organizationId, orgId),
				eq(customFrameworks.id, id),
			),
		)
		.limit(1);
	if (!f) throw new CustomFrameworkError("not_found");
	return f;
}

function editable(f: CustomFramework) {
	if (f.status === "retired") throw new CustomFrameworkError("retired");
}

async function takenKeys(tx: OrgTx, orgId: string): Promise<Set<string>> {
	const rows = await tx
		.select({ key: customFrameworks.key })
		.from(customFrameworks)
		.where(eq(customFrameworks.organizationId, orgId));
	return new Set(rows.map((r) => r.key));
}

async function assertRoom(tx: OrgTx, orgId: string) {
	const [row] = await tx
		.select({ n: count() })
		.from(customFrameworks)
		.where(eq(customFrameworks.organizationId, orgId));
	if ((row?.n ?? 0) >= MAX_CUSTOM_FRAMEWORKS)
		throw new CustomFrameworkError("too_many_frameworks");
}

export async function createCustomFramework(
	tx: OrgTx,
	ctx: Ctx,
	input: Omit<CustomFrameworkInput, "origin"> & {
		origin: CustomFramework["origin"];
		copiedFrom?: string;
	},
): Promise<{ id: string; key: string; audit: AuditInput }> {
	await assertRoom(tx, ctx.orgId);
	const taken = await takenKeys(tx, ctx.orgId);
	const wanted = input.key ?? suggestKey(input.name);
	if (input.key && taken.has(input.key))
		throw new CustomFrameworkError("key_taken");
	const key = uniqueKey(wanted, taken);
	const [row] = await tx
		.insert(customFrameworks)
		.values({
			organizationId: ctx.orgId,
			key,
			name: input.name,
			version: input.version ?? null,
			issuer: input.issuer ?? null,
			origin: input.origin,
			description: input.description ?? null,
			sourceUrl: input.sourceUrl ?? null,
			exclusionAllowed: input.exclusionAllowed ?? false,
			exclusionLabel: input.exclusionLabel ?? null,
			copiedFrom: input.copiedFrom ?? null,
			createdBy: ctx.userId,
		})
		.returning({ id: customFrameworks.id });
	if (!row) throw new CustomFrameworkError("error");
	return {
		id: row.id,
		key,
		audit: {
			action: "custom_framework.created",
			target: `custom_framework:${row.id}`,
			after: { key, name: input.name, origin: input.origin },
		},
	};
}

// Ein Klick-Rahmenwerk als Ausgangspunkt kopieren (Abschnitte, Anforderungen,
// Zuordnungen); danach frei änderbar, spätere Katalog-Änderungen kommen nicht
// mit.
export async function copyCatalogFramework(
	tx: OrgTx,
	ctx: Ctx,
	input: { slug: string; name?: string; key?: string },
): Promise<{ id: string; key: string; audit: AuditInput[] }> {
	if (isCustomSlug(input.slug)) throw new CustomFrameworkError("not_found");
	const src = FRAMEWORK_BY_SLUG.get(input.slug);
	if (!src || src.requirements.length === 0)
		throw new CustomFrameworkError("not_found");
	if (src.requirements.length > MAX_CUSTOM_REQUIREMENTS)
		throw new CustomFrameworkError("too_many_requirements");
	const created = await createCustomFramework(tx, ctx, {
		name: input.name ?? `${src.name} (eigene Fassung)`,
		key: input.key,
		version: src.version,
		issuer: src.authority,
		origin: "copy",
		description: src.description,
		sourceUrl: src.sourceUrl,
		exclusionAllowed: Boolean(src.exclusion),
		exclusionLabel: src.exclusion?.label,
		copiedFrom: src.slug,
	});
	if (src.sections.length > 0)
		await tx.insert(customFrameworkSections).values(
			src.sections.map((s) => ({
				organizationId: ctx.orgId,
				frameworkId: created.id,
				code: s.code,
				title: s.title,
				sortOrder: s.sortOrder,
			})),
		);
	const reqRows = await tx
		.insert(customRequirements)
		.values(
			src.requirements.map((r) => ({
				organizationId: ctx.orgId,
				frameworkId: created.id,
				sectionCode: r.sectionCode,
				code: r.code,
				title: r.title,
				text: r.requirementText,
				domain: r.domain,
				guidance: r.guidance ?? null,
				auditQuestions: r.auditQuestions ?? [],
				evidenceHints: r.evidenceHints ?? [],
				sortOrder: r.sortOrder,
			})),
		)
		.returning({ id: customRequirements.id, code: customRequirements.code });
	const edges = reqRows.flatMap((r) =>
		(EDGES_BY_REQUIREMENT.get(`${src.slug}:${r.code}`) ?? []).map((e) => ({
			organizationId: ctx.orgId,
			requirementId: r.id,
			controlCode: e.control,
			coverage: e.coverage,
			note: e.note ?? null,
		})),
	);
	if (edges.length > 0)
		await tx.insert(customRequirementControls).values(edges);
	return {
		id: created.id,
		key: created.key,
		audit: [
			{
				...created.audit,
				after: {
					key: created.key,
					copiedFrom: src.slug,
					requirements: reqRows.length,
					edges: edges.length,
				},
			},
		],
	};
}

export async function updateCustomFramework(
	tx: OrgTx,
	ctx: Ctx,
	id: string,
	patch: Omit<CustomFrameworkInput, "key" | "origin">,
): Promise<AuditInput> {
	const before = await frameworkOf(tx, ctx.orgId, id);
	editable(before);
	const after = {
		name: patch.name,
		version: patch.version ?? null,
		issuer: patch.issuer ?? null,
		description: patch.description ?? null,
		sourceUrl: patch.sourceUrl ?? null,
		exclusionAllowed: patch.exclusionAllowed ?? false,
		exclusionLabel: patch.exclusionLabel ?? null,
	};
	await tx
		.update(customFrameworks)
		.set({ ...after, updatedAt: new Date() })
		.where(
			and(
				eq(customFrameworks.organizationId, ctx.orgId),
				eq(customFrameworks.id, id),
			),
		);
	// Ausschluss abgeschaltet → bestehende Ausschlüsse gelten nicht mehr
	if (before.exclusionAllowed && !after.exclusionAllowed)
		await tx
			.update(customRequirements)
			.set({ excluded: false, exclusionReason: null })
			.where(
				and(
					eq(customRequirements.organizationId, ctx.orgId),
					eq(customRequirements.frameworkId, id),
				),
			);
	return {
		action: "custom_framework.updated",
		target: `custom_framework:${id}`,
		before: {
			name: before.name,
			exclusionAllowed: before.exclusionAllowed,
		},
		after,
	};
}

export async function upsertSection(
	tx: OrgTx,
	ctx: Ctx,
	input: {
		frameworkId: string;
		code: string;
		title: string;
		sortOrder?: number;
	},
): Promise<AuditInput> {
	editable(await frameworkOf(tx, ctx.orgId, input.frameworkId));
	await tx
		.insert(customFrameworkSections)
		.values({
			organizationId: ctx.orgId,
			frameworkId: input.frameworkId,
			code: input.code,
			title: input.title,
			sortOrder: input.sortOrder ?? 0,
		})
		.onConflictDoUpdate({
			target: [
				customFrameworkSections.frameworkId,
				customFrameworkSections.code,
			],
			set: {
				title: input.title,
				...(input.sortOrder !== undefined
					? { sortOrder: input.sortOrder }
					: {}),
			},
		});
	return {
		action: "custom_framework.section_saved",
		target: `custom_framework:${input.frameworkId}`,
		after: { code: input.code, title: input.title },
	};
}

export async function deleteSection(
	tx: OrgTx,
	ctx: Ctx,
	frameworkId: string,
	code: string,
): Promise<AuditInput> {
	editable(await frameworkOf(tx, ctx.orgId, frameworkId));
	const [used] = await tx
		.select({ n: count() })
		.from(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, ctx.orgId),
				eq(customRequirements.frameworkId, frameworkId),
				eq(customRequirements.sectionCode, code),
			),
		);
	if ((used?.n ?? 0) > 0) throw new CustomFrameworkError("section_not_empty");
	await tx
		.delete(customFrameworkSections)
		.where(
			and(
				eq(customFrameworkSections.organizationId, ctx.orgId),
				eq(customFrameworkSections.frameworkId, frameworkId),
				eq(customFrameworkSections.code, code),
			),
		);
	return {
		action: "custom_framework.section_deleted",
		target: `custom_framework:${frameworkId}`,
		before: { code },
	};
}

async function ensureSection(
	tx: OrgTx,
	orgId: string,
	frameworkId: string,
	code: string,
	title?: string,
) {
	await tx
		.insert(customFrameworkSections)
		.values({ organizationId: orgId, frameworkId, code, title: title ?? code })
		.onConflictDoNothing();
}

async function replaceControls(
	tx: OrgTx,
	orgId: string,
	requirementId: string,
	controls: { code: string; coverage: "full" | "partial"; note?: string }[],
) {
	for (const c of controls)
		if (!CONTROL_BY_CODE.has(c.code as `CC-${string}-${string}`))
			throw new CustomFrameworkError("control_unknown");
	await tx
		.delete(customRequirementControls)
		.where(
			and(
				eq(customRequirementControls.organizationId, orgId),
				eq(customRequirementControls.requirementId, requirementId),
			),
		);
	const unique = [...new Map(controls.map((c) => [c.code, c])).values()];
	if (unique.length > 0)
		await tx.insert(customRequirementControls).values(
			unique.map((c) => ({
				organizationId: orgId,
				requirementId,
				controlCode: c.code,
				coverage: c.coverage,
				note: c.note ?? null,
			})),
		);
}

async function requirementCount(tx: OrgTx, orgId: string, frameworkId: string) {
	const [row] = await tx
		.select({ n: count() })
		.from(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, orgId),
				eq(customRequirements.frameworkId, frameworkId),
			),
		);
	return row?.n ?? 0;
}

export async function saveRequirement(
	tx: OrgTx,
	ctx: Ctx,
	input: RequirementInput & { id?: string },
): Promise<{ id: string; audit: AuditInput }> {
	editable(await frameworkOf(tx, ctx.orgId, input.frameworkId));
	await ensureSection(tx, ctx.orgId, input.frameworkId, input.sectionCode);
	// Code eindeutig je Rahmenwerk (auch beim Umbenennen)
	const [clash] = await tx
		.select({ id: customRequirements.id })
		.from(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, ctx.orgId),
				eq(customRequirements.frameworkId, input.frameworkId),
				eq(customRequirements.code, input.code),
				...(input.id ? [ne(customRequirements.id, input.id)] : []),
			),
		)
		.limit(1);
	if (clash) throw new CustomFrameworkError("code_taken");
	const values = {
		sectionCode: input.sectionCode,
		code: input.code,
		title: input.title,
		text: input.text,
		domain: input.domain,
		guidance: input.guidance ?? null,
		auditQuestions: input.auditQuestions ?? [],
		evidenceHints: input.evidenceHints ?? [],
		updatedAt: new Date(),
	};
	let id = input.id;
	if (id) {
		const [row] = await tx
			.update(customRequirements)
			.set(values)
			.where(
				and(
					eq(customRequirements.organizationId, ctx.orgId),
					eq(customRequirements.frameworkId, input.frameworkId),
					eq(customRequirements.id, id),
				),
			)
			.returning({ id: customRequirements.id });
		if (!row) throw new CustomFrameworkError("not_found");
	} else {
		if (
			(await requirementCount(tx, ctx.orgId, input.frameworkId)) >=
			MAX_CUSTOM_REQUIREMENTS
		)
			throw new CustomFrameworkError("too_many_requirements");
		const [row] = await tx
			.insert(customRequirements)
			.values({
				...values,
				organizationId: ctx.orgId,
				frameworkId: input.frameworkId,
				sortOrder:
					(await requirementCount(tx, ctx.orgId, input.frameworkId)) * 10,
			})
			.returning({ id: customRequirements.id });
		if (!row) throw new CustomFrameworkError("error");
		id = row.id;
	}
	await replaceControls(
		tx,
		ctx.orgId,
		id,
		(input.controls ?? []).map((c) => ({
			code: c.code,
			coverage: c.coverage ?? "full",
			note: c.note,
		})),
	);
	return {
		id,
		audit: {
			action: input.id
				? "custom_framework.requirement_updated"
				: "custom_framework.requirement_created",
			target: `custom_framework:${input.frameworkId}`,
			after: {
				code: input.code,
				controls: (input.controls ?? []).map((c) => c.code),
			},
		},
	};
}

export async function deleteRequirement(
	tx: OrgTx,
	ctx: Ctx,
	frameworkId: string,
	id: string,
): Promise<AuditInput> {
	editable(await frameworkOf(tx, ctx.orgId, frameworkId));
	const [row] = await tx
		.delete(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, ctx.orgId),
				eq(customRequirements.frameworkId, frameworkId),
				eq(customRequirements.id, id),
			),
		)
		.returning({ code: customRequirements.code });
	if (!row) throw new CustomFrameworkError("not_found");
	return {
		action: "custom_framework.requirement_deleted",
		target: `custom_framework:${frameworkId}`,
		before: { code: row.code },
	};
}

export async function setRequirementExclusion(
	tx: OrgTx,
	ctx: Ctx,
	requirementId: string,
	excluded: boolean,
	reason: string,
): Promise<AuditInput> {
	const [req] = await tx
		.select({
			id: customRequirements.id,
			code: customRequirements.code,
			frameworkId: customRequirements.frameworkId,
		})
		.from(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, ctx.orgId),
				eq(customRequirements.id, requirementId),
			),
		)
		.limit(1);
	if (!req) throw new CustomFrameworkError("not_found");
	const fw = await frameworkOf(tx, ctx.orgId, req.frameworkId);
	editable(fw);
	if (excluded && !fw.exclusionAllowed)
		throw new CustomFrameworkError("exclusion_not_allowed");
	if (excluded && reason.trim().length < 3)
		throw new CustomFrameworkError("reason_required");
	await tx
		.update(customRequirements)
		.set({
			excluded,
			exclusionReason: excluded ? reason.trim() : null,
			updatedAt: new Date(),
		})
		.where(eq(customRequirements.id, requirementId));
	return {
		action: excluded
			? "custom_framework.requirement_excluded"
			: "custom_framework.requirement_included",
		target: `custom_framework:${req.frameworkId}`,
		after: { code: req.code, reason: excluded ? reason.trim() : null },
	};
}

// CSV übernehmen: gleicher Code aktualisiert, neue kommen dazu, nichts wird
// gelöscht. Abschnitte entstehen bei Bedarf.
export async function importRequirements(
	tx: OrgTx,
	ctx: Ctx,
	frameworkId: string,
	items: readonly CsvRequirement[],
): Promise<{ created: number; updated: number; audit: AuditInput }> {
	editable(await frameworkOf(tx, ctx.orgId, frameworkId));
	const existing = await tx
		.select({ id: customRequirements.id, code: customRequirements.code })
		.from(customRequirements)
		.where(
			and(
				eq(customRequirements.organizationId, ctx.orgId),
				eq(customRequirements.frameworkId, frameworkId),
			),
		);
	const idByCode = new Map(existing.map((r) => [r.code, r.id]));
	const fresh = items.filter((i) => !idByCode.has(i.code)).length;
	if (existing.length + fresh > MAX_CUSTOM_REQUIREMENTS)
		throw new CustomFrameworkError("too_many_requirements");
	const titles = new Map<string, string | undefined>();
	for (const i of items)
		if (!titles.has(i.sectionCode) || i.sectionTitle)
			titles.set(i.sectionCode, i.sectionTitle);
	for (const [code, title] of titles)
		await ensureSection(tx, ctx.orgId, frameworkId, code, title);
	let created = 0;
	let updated = 0;
	let order = existing.length * 10;
	for (const item of items) {
		const values = {
			sectionCode: item.sectionCode,
			title: item.title,
			text: item.text,
			domain: item.domain,
			updatedAt: new Date(),
		};
		let id = idByCode.get(item.code);
		if (id) {
			await tx
				.update(customRequirements)
				.set(values)
				.where(eq(customRequirements.id, id));
			updated++;
		} else {
			order += 10;
			const [row] = await tx
				.insert(customRequirements)
				.values({
					...values,
					organizationId: ctx.orgId,
					frameworkId,
					code: item.code,
					sortOrder: order,
				})
				.returning({ id: customRequirements.id });
			if (!row) continue;
			id = row.id;
			created++;
		}
		// Zuordnung nur überschreiben, wenn die Zeile eine nennt
		if (item.controls.length > 0)
			await replaceControls(tx, ctx.orgId, id, item.controls);
	}
	return {
		created,
		updated,
		audit: {
			action: "custom_framework.imported",
			target: `custom_framework:${frameworkId}`,
			after: { created, updated },
		},
	};
}

export async function setFrameworkStatus(
	tx: OrgTx,
	ctx: Ctx,
	id: string,
	status: "active" | "retired",
): Promise<{ framework: CustomFramework; audit: AuditInput }> {
	const before = await frameworkOf(tx, ctx.orgId, id);
	if (before.status === status) throw new CustomFrameworkError("unchanged");
	const now = new Date();
	const [row] = await tx
		.update(customFrameworks)
		.set(
			status === "active"
				? {
						status,
						activatedAt: now,
						activatedBy: ctx.userId,
						retiredAt: null,
						updatedAt: now,
					}
				: { status, retiredAt: now, updatedAt: now },
		)
		.where(
			and(
				eq(customFrameworks.organizationId, ctx.orgId),
				eq(customFrameworks.id, id),
			),
		)
		.returning();
	if (!row) throw new CustomFrameworkError("not_found");
	return {
		framework: row,
		audit: {
			action:
				status === "active"
					? "custom_framework.activated"
					: "custom_framework.retired",
			target: `custom_framework:${id}`,
			before: { status: before.status },
			after: { status },
		},
	};
}

// Löschen nur als Entwurf oder zurückgezogen (aktive zählen in der Prüfung)
export async function deleteCustomFramework(
	tx: OrgTx,
	ctx: Ctx,
	id: string,
): Promise<AuditInput> {
	const f = await frameworkOf(tx, ctx.orgId, id);
	if (f.status === "active") throw new CustomFrameworkError("active");
	await tx
		.delete(customFrameworks)
		.where(
			and(
				eq(customFrameworks.organizationId, ctx.orgId),
				eq(customFrameworks.id, id),
			),
		);
	return {
		action: "custom_framework.deleted",
		target: `custom_framework:${id}`,
		before: { key: f.key, name: f.name, status: f.status },
	};
}

// Codes der Maßnahmen, die ein Rahmenwerk zuordnet (für den Arbeitsvorrat)
export async function mappedControlCodes(
	tx: OrgTx,
	orgId: string,
	frameworkId: string,
): Promise<string[]> {
	const rows = await tx
		.selectDistinct({ code: customRequirementControls.controlCode })
		.from(customRequirementControls)
		.innerJoin(
			customRequirements,
			eq(customRequirements.id, customRequirementControls.requirementId),
		)
		.where(
			and(
				eq(customRequirementControls.organizationId, orgId),
				eq(customRequirements.frameworkId, frameworkId),
			),
		);
	return rows.map((r) => r.code);
}
