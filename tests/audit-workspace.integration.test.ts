import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { auditRequests, audits, comments } from "@/db/schema";
import { auditorLanding } from "@/lib/compliance/audit-workspace";
import {
	getAuditRequest,
	listAuditAssignments,
	requestCommentCounts,
} from "@/lib/compliance/queries-p3";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Audit-Arbeitsplatz (Teil 6) —
// Anfrage nur über das eigene Audit und die eigene Organisation, Zähler der
// Kommentare je Anfrage, Einstieg der Prüfer:innen aus ihren Audits.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Audit-Arbeitsplatz (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgIds: string[] = [];
	let auditorId = "";
	let auditA = "";
	let auditOther = "";
	let requestId = "";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Prüferin', ${`audit-ws-${stamp}@example.com`}, true, now(), now())
			returning id`;
		auditorId = u?.id as string;
		for (const n of ["a", "b"]) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Audit ${n}`}, ${`audit-ws-${n}-${stamp}`}, now()) returning id`;
			orgIds.push(o?.id as string);
		}
		const [orgA] = orgIds as [string, string];
		await inOrg(orgA, async (tx) => {
			const rows = await tx
				.insert(audits)
				.values([
					{
						organizationId: orgA,
						title: "ISO 27001 Überwachung",
						status: "in_progress",
						auditorMemberIds: [auditorId],
					},
					{
						organizationId: orgA,
						title: "Internes Audit",
						status: "planned",
					},
				])
				.returning({ id: audits.id });
			auditA = rows[0]?.id as string;
			auditOther = rows[1]?.id as string;
			const [r] = await tx
				.insert(auditRequests)
				.values({
					organizationId: orgA,
					auditId: auditA,
					title: "Backup-Protokoll",
					requestedByUserId: auditorId,
					dueAt: "2026-11-20",
				})
				.returning({ id: auditRequests.id });
			requestId = r?.id as string;
			await tx.insert(comments).values([
				{
					organizationId: orgA,
					entityType: "audit_request",
					entityId: requestId,
					authorUserId: auditorId,
					bodyMarkdown: "Bitte das Protokoll für Oktober.",
				},
				{
					organizationId: orgA,
					entityType: "audit_request",
					entityId: requestId,
					authorUserId: auditorId,
					bodyMarkdown: "Danke, kommt.",
				},
			]);
		});
	});

	afterAll(async () => {
		for (const id of orgIds)
			await client`delete from organization where id = ${id}`;
		await client`delete from "user" where id = ${auditorId}`;
		await client.end();
	});

	it("Anfrage nur über das eigene Audit und die eigene Organisation", async () => {
		const [orgA, orgB] = orgIds as [string, string];
		const own = await inOrg(orgA, (tx) =>
			getAuditRequest(tx, orgA, auditA, requestId),
		);
		expect(own?.title).toBe("Backup-Protokoll");
		expect(own?.auditTitle).toBe("ISO 27001 Überwachung");
		// falsches Audit in der Adresse
		expect(
			await inOrg(orgA, (tx) =>
				getAuditRequest(tx, orgA, auditOther, requestId),
			),
		).toBeNull();
		// fremde Organisation, auch mit deren Kennung im Filter (RLS)
		expect(
			await inOrg(orgB, (tx) => getAuditRequest(tx, orgB, auditA, requestId)),
		).toBeNull();
		expect(
			await inOrg(orgB, (tx) => getAuditRequest(tx, orgA, auditA, requestId)),
		).toBeNull();
	});

	it("zählt Kommentare je Anfrage nur in der eigenen Organisation", async () => {
		const [orgA, orgB] = orgIds as [string, string];
		const counts = await inOrg(orgA, (tx) =>
			requestCommentCounts(tx, orgA, [requestId]),
		);
		expect(counts.get(requestId)).toBe(2);
		const foreign = await inOrg(orgB, (tx) =>
			requestCommentCounts(tx, orgA, [requestId]),
		);
		expect(foreign.size).toBe(0);
		expect(
			(await inOrg(orgA, (tx) => requestCommentCounts(tx, orgA, []))).size,
		).toBe(0);
	});

	it("Einstieg der Prüferin: das eine laufende Audit", async () => {
		const [orgA, orgB] = orgIds as [string, string];
		const rows = await inOrg(orgA, (tx) => listAuditAssignments(tx, orgA));
		expect(rows).toHaveLength(2);
		expect(auditorLanding(rows, auditorId)).toBe(`/audits/${auditA}`);
		// in einer Org ohne eigene Audits: die Liste
		const none = await inOrg(orgB, (tx) => listAuditAssignments(tx, orgB));
		expect(auditorLanding(none, auditorId)).toBe("/audits");
	});
});
