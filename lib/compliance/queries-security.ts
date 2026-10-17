import { and, desc, eq, inArray } from "drizzle-orm";
import {
	accessTokens,
	nonconformities,
	products,
	securityFindings,
	securityScans,
	tasks,
} from "@/db/schema";
import type { FindingSeverity } from "@/db/schema/enums";
import { decryptJson, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import { SEVERITY_RANK } from "@/lib/security/finding-rules";
import { userNames } from "./queries";

// Org-gescopte Lesezugriffe für Security-Checks (S5) — immer in readOrg.
// Details (Beschreibung, Abhilfe, redigierter Ausschnitt) sind verschlüsselt
// und werden nur auf der Detailseite entschlüsselt.

export const OPEN_FINDING = ["open", "in_progress"] as const;
// Ein Schnellcheck, der so lange „läuft“, ist abgebrochen (Neustart o. ä.).
export const STALE_SCAN_MS = 15 * 60_000;

export async function listFindings(
	tx: OrgTx,
	orgId: string,
	opts: { productId?: string } = {},
) {
	const rows = await tx
		.select({
			id: securityFindings.id,
			title: securityFindings.title,
			ruleId: securityFindings.ruleId,
			severity: securityFindings.severity,
			category: securityFindings.category,
			status: securityFindings.status,
			tool: securityFindings.tool,
			target: securityFindings.target,
			location: securityFindings.location,
			cve: securityFindings.cve,
			packageName: securityFindings.packageName,
			dueAt: securityFindings.dueAt,
			firstSeenAt: securityFindings.firstSeenAt,
			lastSeenAt: securityFindings.lastSeenAt,
			acceptedUntil: securityFindings.acceptedUntil,
			controlCode: securityFindings.controlCode,
			productId: securityFindings.productId,
			productCode: products.code,
		})
		.from(securityFindings)
		.leftJoin(products, eq(products.id, securityFindings.productId))
		.where(
			and(
				eq(securityFindings.organizationId, orgId),
				opts.productId
					? eq(securityFindings.productId, opts.productId)
					: undefined,
			),
		)
		.orderBy(desc(securityFindings.lastSeenAt))
		.limit(2000);
	return rows.sort(
		(a, b) =>
			Number(OPEN_FINDING.includes(b.status as "open")) -
				Number(OPEN_FINDING.includes(a.status as "open")) ||
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
	);
}

export type FindingDetails = {
	description: string | null;
	remediation: string | null;
	evidence: string | null;
};

export async function getFindingDetail(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select()
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.id, id),
				eq(securityFindings.organizationId, orgId),
			),
		)
		.limit(1);
	if (!row) return null;
	const [details, scan, product, nc, task, names] = await Promise.all([
		decryptJson<FindingDetails>(
			tx,
			orgId,
			row.details,
			fieldAad("security_findings", row.id, "details"),
		),
		row.lastScanId
			? tx
					.select({
						id: securityScans.id,
						toolName: securityScans.toolName,
						startedAt: securityScans.startedAt,
						source: securityScans.source,
						evidenceId: securityScans.evidenceId,
					})
					.from(securityScans)
					.where(eq(securityScans.id, row.lastScanId))
					.limit(1)
			: Promise.resolve([]),
		row.productId
			? tx
					.select({ id: products.id, code: products.code, name: products.name })
					.from(products)
					.where(eq(products.id, row.productId))
					.limit(1)
			: Promise.resolve([]),
		row.nonconformityId
			? tx
					.select({ id: nonconformities.id, code: nonconformities.code })
					.from(nonconformities)
					.where(eq(nonconformities.id, row.nonconformityId))
					.limit(1)
			: Promise.resolve([]),
		row.taskId
			? tx
					.select({ id: tasks.id, title: tasks.title, status: tasks.status })
					.from(tasks)
					.where(eq(tasks.id, row.taskId))
					.limit(1)
			: Promise.resolve([]),
		userNames(tx, [row.ownerUserId]),
	]);
	return {
		finding: row,
		details,
		scan: scan[0] ?? null,
		product: product[0] ?? null,
		nonconformity: nc[0] ?? null,
		task: task[0] ?? null,
		names,
	};
}

export async function listScans(tx: OrgTx, orgId: string, limit = 100) {
	const rows = await tx
		.select({
			id: securityScans.id,
			tool: securityScans.tool,
			source: securityScans.source,
			toolName: securityScans.toolName,
			target: securityScans.target,
			status: securityScans.status,
			error: securityScans.error,
			counts: securityScans.counts,
			fullScan: securityScans.fullScan,
			startedAt: securityScans.startedAt,
			finishedAt: securityScans.finishedAt,
			evidenceId: securityScans.evidenceId,
			productCode: products.code,
			tokenId: securityScans.tokenId,
		})
		.from(securityScans)
		.leftJoin(products, eq(products.id, securityScans.productId))
		.where(eq(securityScans.organizationId, orgId))
		.orderBy(desc(securityScans.startedAt))
		.limit(limit);
	const now = Date.now();
	return rows.map((r) => ({
		...r,
		stale:
			r.status === "running" && now - r.startedAt.getTime() > STALE_SCAN_MS,
	}));
}

// Kennzahlen für Übersicht, /heute und Bericht — abgeleitet, nie gespeichert.
export function findingStats(
	rows: readonly {
		severity: FindingSeverity;
		status: string;
		category: string;
		dueAt: Date | null;
	}[],
	now = new Date(),
) {
	const open = rows.filter((r) => OPEN_FINDING.includes(r.status as "open"));
	const bySeverity: Record<FindingSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};
	for (const r of open) bySeverity[r.severity] += 1;
	return {
		open: open.length,
		bySeverity,
		overdue: open.filter((r) => r.dueAt && r.dueAt < now).length,
		secrets: open.filter((r) => r.category === "secret").length,
		accepted: rows.filter((r) => r.status === "accepted").length,
		resolved: rows.filter((r) => r.status === "resolved").length,
		// Ampel: rot bei kritisch/Secret/überfällig hoch, gelb bei hoch, sonst grün
		light:
			bySeverity.critical > 0 || open.some((r) => r.category === "secret")
				? ("red" as const)
				: bySeverity.high > 0
					? ("yellow" as const)
					: ("green" as const),
	};
}

// Offene Befunde als Eingang der Prüfungsreife (Abzüge, Blocker).
export async function openFindingsForReadiness(tx: OrgTx, orgId: string) {
	return tx
		.select({
			id: securityFindings.id,
			title: securityFindings.title,
			severity: securityFindings.severity,
			controlCode: securityFindings.controlCode,
			dueAt: securityFindings.dueAt,
		})
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.organizationId, orgId),
				inArray(securityFindings.status, [...OPEN_FINDING]),
			),
		)
		.then((rows) =>
			rows.map((r) => ({
				...r,
				dueAt: r.dueAt ? r.dueAt.toISOString().slice(0, 10) : null,
			})),
		);
}

export async function listAccessTokens(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			id: accessTokens.id,
			name: accessTokens.name,
			prefix: accessTokens.prefix,
			scopes: accessTokens.scopes,
			subjectType: accessTokens.subjectType,
			subjectId: accessTokens.subjectId,
			expiresAt: accessTokens.expiresAt,
			lastUsedAt: accessTokens.lastUsedAt,
			revokedAt: accessTokens.revokedAt,
			createdAt: accessTokens.createdAt,
			createdByUserId: accessTokens.createdByUserId,
		})
		.from(accessTokens)
		.where(
			and(
				eq(accessTokens.organizationId, orgId),
				eq(accessTokens.kind, "ingest"),
			),
		)
		.orderBy(desc(accessTokens.createdAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.createdByUserId),
	);
	return rows.map((r) => ({
		...r,
		createdByName: r.createdByUserId
			? (names.get(r.createdByUserId) ?? null)
			: null,
	}));
}
