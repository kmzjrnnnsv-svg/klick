import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	comments,
	controlEvidence,
	controlImplementations,
	controls,
	evidence,
	evidenceSignatures,
	frameworks,
	orgFrameworks,
	orgSettings,
	products,
	requirementApplicability,
	requirements,
	tasks,
	watchers,
} from "@/db/schema";
import type {
	EntityKind,
	FunctionKey,
	ImplStatus,
	OrgRoleLegal,
} from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import { currentEvidence } from "@/lib/evidence/current";

import { mergeApplicability } from "./applicability";
import {
	type profileApplicability,
	profileApplicabilityDetail,
} from "./catalog-view";
import {
	type CoverageInput,
	type CoverageResult,
	deriveCoverage,
} from "./coverage";
import { productRolesFrom } from "./cra";
import { customApplicability, type OrgCatalog } from "./org-catalog";
import { loadOrgCatalog } from "./org-catalog-server";

// Org-gescopte Lesezugriffe für Controls, Abdeckung, Anforderungen, Aufgaben,
// Kommentare — immer innerhalb von readOrg/withOrg (RLS). Der Katalog selbst
// ist statisch (lib/compliance/catalog); aus der DB kommen nur Org-Zustände.

export type OrgProfileRow = {
	sector: "casp" | "bank" | "payment" | "emi" | "other";
	licenceStage: Parameters<typeof profileApplicability>[0]["licenceStage"];
	caspServices: Parameters<typeof profileApplicability>[0]["caspServices"];
	tlptDesignated: boolean;
	issuesTokens: "none" | "art" | "emt" | "other";
	applyBaseline: boolean;
	nis2Status:
		| "unchecked"
		| "not_affected"
		| "affected_pending"
		| "affected_registered";
	// CRA-Rollen aus dem Produktregister (undefined = kein Produkt erfasst)
	productRoles?: OrgRoleLegal[];
	// gewählte Variante je Rahmenwerk (BSI-Absicherung, PCI-SAQ)
	frameworkVariants?: Record<string, string>;
};

export async function getOrgProfile(
	tx: OrgTx,
	orgId: string,
): Promise<{ profile: OrgProfileRow; frameworks: string[] } | null> {
	const [s] = await tx
		.select({
			sector: orgSettings.sector,
			licenceStage: orgSettings.licenceStage,
			caspServices: orgSettings.caspServices,
			tlptDesignated: orgSettings.tlptDesignated,
			issuesTokens: orgSettings.issuesTokens,
			applyBaseline: orgSettings.applyBaseline,
			nis2Status: orgSettings.nis2Status,
			entityProfile: orgSettings.entityProfile,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	if (!s) return null;
	const fws = await tx
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
	const prods = await tx
		.select({
			role: products.role,
			craInScope: products.craInScope,
			status: products.status,
		})
		.from(products)
		.where(eq(products.organizationId, orgId));
	const { entityProfile, ...rest } = s;
	return {
		profile: {
			...rest,
			productRoles: productRolesFrom(prods),
			frameworkVariants: entityProfile?.frameworkVariants ?? {},
		},
		frameworks: fws.map((f) => f.slug),
	};
}

// Anwendbarkeit aus der DB (abgeleitet + manuell) — true/false je framework:code.
export async function loadApplicability(
	tx: OrgTx,
	orgId: string,
): Promise<
	Map<string, { applicable: boolean; source: string; note: string | null }>
> {
	const rows = await tx
		.select({
			applicable: requirementApplicability.applicable,
			source: requirementApplicability.source,
			note: requirementApplicability.note,
			code: requirements.code,
			slug: frameworks.slug,
		})
		.from(requirementApplicability)
		.innerJoin(
			requirements,
			eq(requirements.id, requirementApplicability.requirementId),
		)
		.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
		.where(eq(requirementApplicability.organizationId, orgId));
	const map = new Map<
		string,
		{ applicable: boolean; source: string; note: string | null }
	>();
	for (const r of rows) {
		map.set(`${r.slug}:${r.code}`, {
			applicable: r.applicable,
			source: r.source,
			note: r.note,
		});
	}
	return map;
}

export async function loadImplStatus(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, ImplStatus>> {
	const rows = await tx
		.select({ code: controls.code, status: controlImplementations.status })
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(eq(controlImplementations.organizationId, orgId));
	return new Map(rows.map((r) => [r.code, r.status]));
}

export type OrgCoverage = {
	frameworks: string[];
	profile: OrgProfileRow;
	input: CoverageInput;
	result: CoverageResult;
	applicabilityDetail: Map<
		string,
		{ applicable: boolean; source: string; note: string | null }
	>;
	implStatus: Map<string, ImplStatus>;
	// Katalog der Org: Klick-Rahmenwerke + eigene (R4)
	catalog: OrgCatalog;
};

// Vollständige Abdeckungsrechnung einer Org — einmal je Request (React.cache
// in den Seiten), nie gespeichert. `asOf` rechnet zu einem Stichtag (Fristen,
// künftig gültige Anforderungen); manuelle Entscheidungen gelten immer.
export async function orgCoverage(
	tx: OrgTx,
	orgId: string,
	opts: { asOf?: Date } = {},
): Promise<OrgCoverage | null> {
	const p = await getOrgProfile(tx, orgId);
	if (!p) return null;
	const [stored, implStatus, catalog] = await Promise.all([
		loadApplicability(tx, orgId),
		loadImplStatus(tx, orgId),
		loadOrgCatalog(tx, orgId),
	]);
	// eigene Rahmenwerke zählen, sobald sie eingeschaltet sind (R4)
	const frameworks = [...p.frameworks, ...catalog.activeCustomSlugs];
	const applicabilityDetail = mergeApplicability(
		profileApplicabilityDetail({
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			frameworks: p.frameworks,
			tlptDesignated: p.profile.tlptDesignated,
			frameworkVariants: p.profile.frameworkVariants,
			issuesTokens: p.profile.issuesTokens,
			productRoles: p.profile.productRoles,
			asOf: opts.asOf,
		}),
		stored,
	);
	for (const [key, d] of customApplicability(catalog))
		applicabilityDetail.set(key, d);
	const applicability = new Map<string, boolean>();
	for (const [key, d] of applicabilityDetail)
		applicability.set(key, d.applicable);
	const input: CoverageInput = {
		frameworks,
		requirements: catalog.reqRefs,
		applicability,
		edges: catalog.edgeRefs,
		implStatus,
	};
	return {
		frameworks,
		profile: p.profile,
		input,
		result: deriveCoverage(input),
		applicabilityDetail,
		implStatus,
		catalog,
	};
}

export type ControlRow = {
	implementationId: string;
	controlId: string;
	code: string;
	title: string;
	domain: string;
	effort: string;
	kind: string;
	status: ImplStatus;
	source: string;
	ownerUserId: string | null;
	ownerFunction: FunctionKey | null;
	ownerName: string | null;
	assigneeUserId: string | null;
	assigneeName: string | null;
	nextReviewAt: string | null;
	updatedAt: Date;
	note: string | null;
};

export async function listControlRows(
	tx: OrgTx,
	orgId: string,
): Promise<ControlRow[]> {
	const rows = await tx
		.select({
			implementationId: controlImplementations.id,
			controlId: controls.id,
			code: controls.code,
			title: controls.title,
			domain: controls.domain,
			effort: controls.effort,
			kind: controls.kind,
			status: controlImplementations.status,
			source: controlImplementations.source,
			ownerUserId: controlImplementations.ownerUserId,
			ownerFunction: controlImplementations.ownerFunction,
			assigneeUserId: controlImplementations.assigneeUserId,
			nextReviewAt: controlImplementations.nextReviewAt,
			updatedAt: controlImplementations.updatedAt,
			note: controlImplementations.note,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(eq(controlImplementations.organizationId, orgId))
		.orderBy(asc(controls.sortOrder));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.ownerUserId, r.assigneeUserId]),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		assigneeName: r.assigneeUserId
			? (names.get(r.assigneeUserId) ?? null)
			: null,
	}));
}

export async function getControlRowByCode(
	tx: OrgTx,
	orgId: string,
	code: string,
): Promise<ControlRow | null> {
	const rows = await listControlRows(tx, orgId);
	return rows.find((r) => r.code === code) ?? null;
}

// Namen für Owner/Assignee — die user-Tabelle ist global; nur IDs aus
// Org-Zeilen werden nachgeschlagen.
export async function userNames(
	tx: OrgTx,
	ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
	const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
	if (unique.length === 0) return new Map();
	const rows = await tx
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, unique));
	return new Map(rows.map((r) => [r.id, r.name || r.email]));
}

export type EvidenceRow = typeof evidence.$inferSelect;

export async function listEvidenceForImplementation(
	tx: OrgTx,
	orgId: string,
	implementationId: string,
): Promise<EvidenceRow[]> {
	return tx
		.select({ e: evidence })
		.from(controlEvidence)
		.innerJoin(evidence, eq(evidence.id, controlEvidence.evidenceId))
		.where(
			and(
				eq(controlEvidence.organizationId, orgId),
				eq(controlEvidence.implementationId, implementationId),
				currentEvidence(),
			),
		)
		.orderBy(desc(evidence.createdAt))
		.then((rows) => rows.map((r) => r.e));
}

// Register: nur aktuelle Fassungen, auf Wunsch auch ersetzte
export async function listEvidence(
	tx: OrgTx,
	orgId: string,
	opts: { includeSuperseded?: boolean } = {},
): Promise<EvidenceRow[]> {
	return tx
		.select()
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				opts.includeSuperseded ? undefined : currentEvidence(),
			),
		)
		.orderBy(desc(evidence.createdAt));
}

// Ein Nachweis mit Controls, Versionen und Zahl der Unterschriften
export async function evidenceDetail(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select()
		// evidence:any-version — Detailseite zeigt jede Fassung
		.from(evidence)
		.where(and(eq(evidence.id, id), eq(evidence.organizationId, orgId)))
		.limit(1);
	if (!row) return null;
	const [linked, newer, older, signatures, names] = await Promise.all([
		tx
			.select({ code: controls.code, title: controls.title })
			// evidence:any-version — Controls und Nachbarn dieser Fassung
			.from(controlEvidence)
			.innerJoin(
				controlImplementations,
				eq(controlImplementations.id, controlEvidence.implementationId),
			)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlEvidence.organizationId, orgId),
					eq(controlEvidence.evidenceId, id),
				),
			)
			.orderBy(asc(controls.code)),
		row.supersededById
			? tx
					.select({ id: evidence.id, title: evidence.title })
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							eq(evidence.id, row.supersededById),
						),
					)
					.limit(1)
			: Promise.resolve([]),
		row.supersedesId
			? tx
					.select({ id: evidence.id, title: evidence.title })
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							eq(evidence.id, row.supersedesId),
						),
					)
					.limit(1)
			: Promise.resolve([]),
		tx
			.select({ id: evidenceSignatures.id })
			.from(evidenceSignatures)
			.where(
				and(
					eq(evidenceSignatures.organizationId, orgId),
					eq(evidenceSignatures.evidenceId, id),
				),
			),
		userNames(tx, [row.createdByUserId, row.ownerUserId]),
	]);
	return {
		row,
		controls: linked,
		supersededBy: newer[0] ?? null,
		supersedes: older[0] ?? null,
		signatureCount: signatures.length,
		createdByName: row.createdByUserId
			? (names.get(row.createdByUserId) ?? null)
			: null,
		ownerName: row.ownerUserId ? (names.get(row.ownerUserId) ?? null) : null,
	};
}

// Zwei Fassungen eines Nachweises für den Vergleich (Datei, Einstufung,
// Rohling); null, wenn eine fehlt
export async function evidenceVersionSides(
	tx: OrgTx,
	orgId: string,
	beforeId: string,
	afterId: string,
) {
	const rows = await tx
		.select({
			id: evidence.id,
			fileName: evidence.fileName,
			sha256: evidence.sha256,
			mimeType: evidence.mimeType,
			source: evidence.source,
			storageKey: evidence.storageKey,
			classification: evidence.classification,
			templateKey: evidence.templateKey,
		})
		// evidence:any-version — Vergleich mit der ersetzten Fassung
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				inArray(evidence.id, [beforeId, afterId]),
			),
		);
	const before = rows.find((r) => r.id === beforeId);
	const after = rows.find((r) => r.id === afterId);
	return before && after ? { before, after } : null;
}

export type TaskRow = typeof tasks.$inferSelect & {
	assigneeName: string | null;
};

export async function listTasks(
	tx: OrgTx,
	orgId: string,
	filter: {
		assigneeUserId?: string;
		entityType?: EntityKind;
		entityId?: string;
		openOnly?: boolean;
	} = {},
): Promise<TaskRow[]> {
	const conds = [eq(tasks.organizationId, orgId)];
	if (filter.assigneeUserId)
		conds.push(eq(tasks.assigneeUserId, filter.assigneeUserId));
	if (filter.entityType) conds.push(eq(tasks.entityType, filter.entityType));
	if (filter.entityId) conds.push(eq(tasks.entityId, filter.entityId));
	if (filter.openOnly)
		conds.push(inArray(tasks.status, ["todo", "doing", "blocked"]));
	const rows = await tx
		.select()
		.from(tasks)
		.where(and(...conds))
		.orderBy(asc(tasks.dueAt), desc(tasks.priority), asc(tasks.createdAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.assigneeUserId),
	);
	return rows.map((r) => ({
		...r,
		assigneeName: r.assigneeUserId
			? (names.get(r.assigneeUserId) ?? null)
			: null,
	}));
}

export type CommentRow = typeof comments.$inferSelect & {
	authorName: string | null;
};

export async function listComments(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityId: string,
): Promise<CommentRow[]> {
	const rows = await tx
		.select()
		.from(comments)
		.where(
			and(
				eq(comments.organizationId, orgId),
				eq(comments.entityType, entityType),
				eq(comments.entityId, entityId),
			),
		)
		.orderBy(desc(comments.createdAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.authorUserId),
	);
	return rows.map((r) => ({
		...r,
		authorName: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
	}));
}

export async function listWatcherIds(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityId: string,
): Promise<string[]> {
	const rows = await tx
		.select({ userId: watchers.userId })
		.from(watchers)
		.where(
			and(
				eq(watchers.organizationId, orgId),
				eq(watchers.entityType, entityType),
				eq(watchers.entityId, entityId),
			),
		);
	return rows.map((r) => r.userId);
}

// Aktive Mitglieder (für Owner-/Assignee-Auswahl und Mentions) — über die
// Better-Auth-Tabellen, explizit auf die Org gefiltert.
export async function listMembersForPicker(
	tx: OrgTx,
	orgId: string,
): Promise<{ userId: string; name: string; email: string }[]> {
	const rows = await tx
		.select({ userId: user.id, name: user.name, email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(asc(user.name));
	// Ohne Namen (Magic-Link-Konto) die Adresse zeigen, sonst bleibt die
	// Auswahl leer — wie userNames().
	return rows.map((r) => ({ ...r, name: r.name.trim() || r.email }));
}

// Nachweise mit verknüpften Control-Codes (Register /nachweise).
export async function listEvidenceWithControls(
	tx: OrgTx,
	orgId: string,
	opts: { includeSuperseded?: boolean } = {},
): Promise<
	(EvidenceRow & { controlCodes: string[]; createdByName: string | null })[]
> {
	const rows = await listEvidence(tx, orgId, opts);
	if (rows.length === 0) return [];
	const links = await tx
		.select({ evidenceId: controlEvidence.evidenceId, code: controls.code })
		// evidence:any-version — Zuordnung zu den gelesenen Nachweisen
		.from(controlEvidence)
		.innerJoin(
			controlImplementations,
			eq(controlImplementations.id, controlEvidence.implementationId),
		)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(eq(controlEvidence.organizationId, orgId));
	const byEvidence = new Map<string, string[]>();
	for (const l of links) {
		const list = byEvidence.get(l.evidenceId) ?? [];
		list.push(l.code);
		byEvidence.set(l.evidenceId, list);
	}
	const names = await userNames(
		tx,
		rows.map((r) => r.createdByUserId),
	);
	return rows.map((r) => ({
		...r,
		controlCodes: (byEvidence.get(r.id) ?? []).sort(),
		createdByName: r.createdByUserId
			? (names.get(r.createdByUserId) ?? null)
			: null,
	}));
}
