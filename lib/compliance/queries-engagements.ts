import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
	evidence,
	products,
	securityEngagements,
	securityFindings,
} from "@/db/schema";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import { SEVERITY_RANK } from "@/lib/security/finding-rules";
import { userNames } from "./queries";

// Sicherheitsaufträge (S7): Liste, Detail, Berichtsdaten.

export async function listEngagements(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			e: securityEngagements,
			productCode: products.code,
			productName: products.name,
		})
		.from(securityEngagements)
		.leftJoin(products, eq(products.id, securityEngagements.productId))
		.where(eq(securityEngagements.organizationId, orgId))
		.orderBy(desc(securityEngagements.createdAt));
	const counts = await tx
		.select({
			engagementId: securityFindings.engagementId,
			total: sql<number>`count(*)::int`,
			open: sql<number>`count(*) filter (where ${securityFindings.status} in ('open','in_progress'))::int`,
			critical: sql<number>`count(*) filter (where ${securityFindings.status} in ('open','in_progress') and ${securityFindings.severity} = 'critical')::int`,
			high: sql<number>`count(*) filter (where ${securityFindings.status} in ('open','in_progress') and ${securityFindings.severity} = 'high')::int`,
		})
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.organizationId, orgId),
				sql`${securityFindings.engagementId} is not null`,
			),
		)
		.groupBy(securityFindings.engagementId);
	const byId = new Map(counts.map((c) => [c.engagementId, c]));
	return rows.map((r) => ({
		...r.e,
		productCode: r.productCode,
		productName: r.productName,
		findings: byId.get(r.e.id) ?? { total: 0, open: 0, critical: 0, high: 0 },
	}));
}

export async function getEngagementDetail(
	tx: OrgTx,
	orgId: string,
	id: string,
) {
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
	if (!e) return null;
	const [product, findings, files] = await Promise.all([
		e.productId
			? tx
					.select({
						id: products.id,
						code: products.code,
						name: products.name,
						role: products.role,
					})
					.from(products)
					.where(eq(products.id, e.productId))
					.limit(1)
					.then((r) => r[0] ?? null)
			: Promise.resolve(null),
		tx
			.select({
				id: securityFindings.id,
				title: securityFindings.title,
				severity: securityFindings.severity,
				status: securityFindings.status,
				category: securityFindings.category,
				tool: securityFindings.tool,
				cvss: securityFindings.cvss,
				cvssVector: securityFindings.cvssVector,
				cwe: securityFindings.cwe,
				cve: securityFindings.cve,
				target: securityFindings.target,
				location: securityFindings.location,
				dueAt: securityFindings.dueAt,
				retestStatus: securityFindings.retestStatus,
				retestedAt: securityFindings.retestedAt,
				retestNote: securityFindings.retestNote,
				firstSeenAt: securityFindings.firstSeenAt,
			})
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.organizationId, orgId),
					eq(securityFindings.engagementId, id),
				),
			),
		[e.authorizationEvidenceId, e.reportEvidenceId].some(Boolean)
			? tx
					.select({
						id: evidence.id,
						title: evidence.title,
						fileName: evidence.fileName,
						sha256: evidence.sha256,
						createdAt: evidence.createdAt,
					})
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							inArray(
								evidence.id,
								[e.authorizationEvidenceId, e.reportEvidenceId].filter(
									(x): x is string => Boolean(x),
								),
							),
						),
					)
			: Promise.resolve([]),
	]);
	findings.sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			a.firstSeenAt.getTime() - b.firstSeenAt.getTime(),
	);
	const names = await userNames(tx, [
		e.ownerUserId,
		e.authorizedByUserId,
		e.createdByUserId,
	]);
	const file = (fid: string | null) =>
		fid ? (files.find((f) => f.id === fid) ?? null) : null;
	return {
		engagement: e,
		product,
		findings,
		authorization: file(e.authorizationEvidenceId),
		report: file(e.reportEvidenceId),
		names,
	};
}

// Bericht: Befunde mit entschlüsselter Beschreibung, Reproduktion, Abhilfe.
export async function loadEngagementReport(
	tx: OrgTx,
	orgId: string,
	id: string,
) {
	const d = await getEngagementDetail(tx, orgId, id);
	if (!d) return null;
	const ids = d.findings.map((f) => f.id);
	const stored =
		ids.length === 0
			? []
			: await tx
					.select({
						id: securityFindings.id,
						details: securityFindings.details,
					})
					.from(securityFindings)
					.where(inArray(securityFindings.id, ids));
	const byId = new Map(stored.map((r) => [r.id, r.details]));
	const details = await decryptMany<{
		description?: string | null;
		evidence?: string | null;
		remediation?: string | null;
	}>(
		tx,
		orgId,
		d.findings.map((f) => ({
			stored: byId.get(f.id) ?? null,
			aad: fieldAad("security_findings", f.id, "details"),
		})),
	);
	return {
		...d,
		findings: d.findings.map((f, i) => ({
			...f,
			description: details[i]?.description ?? null,
			steps: details[i]?.evidence ?? null,
			remediation: details[i]?.remediation ?? null,
		})),
	};
}
