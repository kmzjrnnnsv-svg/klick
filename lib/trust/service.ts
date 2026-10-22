import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { member, organization } from "@/db/auth-schema";
import {
	documents,
	documentVersions,
	providers,
	type TrustCenter,
	type TrustCenterSettings,
	trustCenters,
} from "@/db/schema";
import { normalizeRole } from "@/lib/auth/session-rules";
import { controlsForFrameworks } from "@/lib/compliance/catalog";
import { frameworkNameMap } from "@/lib/compliance/page-data";
import { orgCoverage } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { DEFAULT_NDA_TEXT } from "./rules";
import type { SnapshotDocumentInput, SnapshotInput } from "./snapshot";

// Trust Center — Lader und Hilfen für Actions und Routen (mit Org-Kontext).

export function defaultTrustSettings(orgName: string): TrustCenterSettings {
	return {
		title: `Sicherheit und Compliance bei ${orgName}`,
		intro:
			"Hier findest du, nach welchen Rahmenwerken wir arbeiten, welche Dienstleister Daten für uns verarbeiten und welche Unterlagen wir bereitstellen. Vertrauliche Unterlagen schalten wir nach einer kurzen Anfrage frei.",
		contactEmail: null,
		ndaText: DEFAULT_NDA_TEXT,
		indexable: false,
		showCoverage: false,
		showControls: true,
		showSubprocessors: true,
		frameworks: [],
		documents: [],
	};
}

export async function loadTrustCenter(
	tx: OrgTx,
	orgId: string,
): Promise<TrustCenter | null> {
	const [row] = await tx
		.select()
		.from(trustCenters)
		.where(eq(trustCenters.organizationId, orgId))
		.limit(1);
	return row ?? null;
}

export async function orgName(tx: OrgTx, orgId: string): Promise<string> {
	const [o] = await tx
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return o?.name ?? "";
}

// member hat kein RLS (ADR-009) — explizit auf die Org filtern.
export async function orgOwnerIds(tx: OrgTx, orgId: string): Promise<string[]> {
	const rows = await tx
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	return rows
		.filter((m) => normalizeRole(m.role) === "owner")
		.map((m) => m.userId);
}

// Unterauftragnehmer = aktive Dienstleister, die personenbezogene Daten
// verarbeiten oder eine ausgelagerte Funktion erbringen.
async function loadSubprocessors(tx: OrgTx, orgId: string) {
	return tx
		.select({
			name: providers.name,
			serviceType: providers.serviceType,
			country: providers.country,
			dataLocations: providers.dataLocations,
		})
		.from(providers)
		.where(
			and(
				eq(providers.organizationId, orgId),
				eq(providers.status, "active"),
				or(
					eq(providers.processesPersonalData, true),
					eq(providers.isOutsourcing, true),
				),
			),
		);
}

async function loadSnapshotDocuments(
	tx: OrgTx,
	orgId: string,
	ids: readonly string[],
): Promise<SnapshotDocumentInput[]> {
	if (ids.length === 0) return [];
	const [docs, versions] = await Promise.all([
		tx
			.select({
				documentId: documents.id,
				docNumber: documents.docNumber,
				title: documents.title,
				classification: documents.classification,
				status: documents.status,
			})
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, orgId),
					inArray(documents.id, [...ids]),
				),
			),
		tx
			.select({
				documentId: documentVersions.documentId,
				versionId: documentVersions.id,
				version: documentVersions.version,
				publishedAt: documentVersions.publishedAt,
				hasBody: sql<boolean>`coalesce(length(${documentVersions.bodyMarkdown}), 0) > 0`,
				hasFile: sql<boolean>`${documentVersions.fileEvidenceId} is not null`,
			})
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.organizationId, orgId),
					inArray(documentVersions.documentId, [...ids]),
					isNotNull(documentVersions.publishedAt),
				),
			)
			.orderBy(desc(documentVersions.publishedAt)),
	]);
	const latest = new Map<string, (typeof versions)[number]>();
	for (const v of versions)
		if (!latest.has(v.documentId)) latest.set(v.documentId, v);
	return docs.map((d) => {
		const v = latest.get(d.documentId);
		return {
			...d,
			latest: v
				? {
						versionId: v.versionId,
						version: v.version,
						publishedAt: v.publishedAt,
						hasBody: Boolean(v.hasBody),
						hasFile: Boolean(v.hasFile),
					}
				: null,
		};
	});
}

export async function loadSnapshotInput(
	tx: OrgTx,
	orgId: string,
	settings: TrustCenterSettings,
	now = new Date(),
): Promise<SnapshotInput> {
	const [name, cov, subprocessors, docs] = await Promise.all([
		orgName(tx, orgId),
		orgCoverage(tx, orgId),
		loadSubprocessors(tx, orgId),
		loadSnapshotDocuments(
			tx,
			orgId,
			settings.documents.map((d) => d.documentId),
		),
	]);
	const frameworks = cov?.frameworks ?? [];
	const coverage: Record<string, number | null> = {};
	for (const slug of frameworks)
		coverage[slug] = cov?.result.byFramework.get(slug)?.coveragePct ?? null;
	return {
		orgName: name,
		settings,
		activeFrameworks: frameworks,
		frameworkNames: frameworkNameMap(),
		coverage,
		controls: controlsForFrameworks(frameworks).map((c) => ({
			domain: c.domain,
			status: cov?.implStatus.get(c.code) ?? "not_started",
		})),
		providers: subprocessors,
		documents: docs,
		now,
	};
}

// Postgres-Fehler 23505 (Unique) — drizzle reicht ihn als cause weiter.
export function isUniqueViolation(e: unknown): boolean {
	const code = (x: unknown) =>
		typeof x === "object" && x !== null && "code" in x
			? (x as { code: unknown }).code
			: undefined;
	return (
		code(e) === "23505" ||
		code((e as { cause?: unknown } | null)?.cause) === "23505"
	);
}
