import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	comments,
	controlEvidence,
	controlImplementations,
	controls,
	evidence,
	frameworks,
	orgFrameworks,
	orgSettings,
	requirementApplicability,
	requirements,
	tasks,
	watchers,
} from "@/db/schema";
import type { EntityKind, ImplStatus } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import {
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
	profileApplicability,
} from "./catalog-view";
import {
	type CoverageInput,
	type CoverageResult,
	deriveCoverage,
} from "./coverage";

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
	return { profile: s, frameworks: fws.map((f) => f.slug) };
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
};

// Vollständige Abdeckungsrechnung einer Org — einmal je Request (React.cache
// in den Seiten), nie gespeichert.
export async function orgCoverage(
	tx: OrgTx,
	orgId: string,
): Promise<OrgCoverage | null> {
	const p = await getOrgProfile(tx, orgId);
	if (!p) return null;
	const [applicabilityDetail, implStatus] = await Promise.all([
		loadApplicability(tx, orgId),
		loadImplStatus(tx, orgId),
	]);
	// Ableitung aus dem Profil als Basis, DB-Zeilen (inkl. manuell) darüber.
	const applicability = profileApplicability({
		sector: p.profile.sector,
		licenceStage: p.profile.licenceStage,
		caspServices: p.profile.caspServices,
		frameworks: p.frameworks,
		tlptDesignated: p.profile.tlptDesignated,
		issuesTokens: p.profile.issuesTokens,
	});
	for (const [key, d] of applicabilityDetail)
		applicability.set(key, d.applicable);
	const input: CoverageInput = {
		frameworks: p.frameworks,
		requirements: CATALOG_REQ_REFS,
		applicability,
		edges: CATALOG_EDGES,
		implStatus,
	};
	return {
		frameworks: p.frameworks,
		profile: p.profile,
		input,
		result: deriveCoverage(input),
		applicabilityDetail,
		implStatus,
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
			),
		)
		.orderBy(desc(evidence.createdAt))
		.then((rows) => rows.map((r) => r.e));
}

export async function listEvidence(
	tx: OrgTx,
	orgId: string,
): Promise<EvidenceRow[]> {
	return tx
		.select()
		.from(evidence)
		.where(eq(evidence.organizationId, orgId))
		.orderBy(desc(evidence.createdAt));
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
	return rows;
}

// Nachweise mit verknüpften Control-Codes (Register /nachweise).
export async function listEvidenceWithControls(
	tx: OrgTx,
	orgId: string,
): Promise<
	(EvidenceRow & { controlCodes: string[]; createdByName: string | null })[]
> {
	const rows = await listEvidence(tx, orgId);
	if (rows.length === 0) return [];
	const links = await tx
		.select({ evidenceId: controlEvidence.evidenceId, code: controls.code })
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
