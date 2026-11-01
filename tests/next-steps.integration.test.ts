import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { clearOrgDerived } from "@/lib/cache/org-derived";
import {
	countOpenTasks,
	implementedWithoutEvidenceCount,
} from "@/lib/compliance/queries-counts";
import { loadOrgStatus } from "@/lib/compliance/queries-next-steps";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Zahlen für „Als Nächstes“ und den
// Überblick laufen als count in SQL und wandern mit Änderungen der Org.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Als Nächstes (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Als Nächstes', ${`next-${stamp}`}, now())
			returning id`;
		orgId = o?.id as string;
		clearOrgDerived();
	});

	afterAll(async () => {
		await client`delete from organization where id = ${orgId}`;
		await client.end();
	});

	it("leere Org: Grundlagen offen, keine Fristen", async () => {
		const s = await inOrg((tx) => loadOrgStatus(tx, orgId));
		expect(s.next.overdueObligations).toBe(0);
		expect(s.next.overdueNonconformities).toBe(0);
		expect(s.next.hasDocuments).toBe(false);
		expect(s.next.hasProviders).toBe(false);
		expect(s.next.processLinked).toBe(false);
		expect(s.next.teamInvited).toBe(false);
		expect(s.next.appetiteConfirmed).toBe(false);
		expect(await inOrg((tx) => countOpenTasks(tx, orgId))).toBe(0);
		expect(
			await inOrg((tx) => implementedWithoutEvidenceCount(tx, orgId)),
		).toBe(0);
	});

	it("neuer Dienstleister ändert den Stand beim nächsten Aufruf", async () => {
		await inOrg(async (tx) => {
			await tx.execute(sql`insert into providers (organization_id, name)
				values (${orgId}, 'Hoster')`);
			// jede Änderung schreibt Audit, damit wandert der Kopf der Kette
			await audit(
				tx as never,
				{ userId: null },
				{ action: "provider.created", organizationId: orgId },
			);
		});
		const s = await inOrg((tx) => loadOrgStatus(tx, orgId));
		expect(s.next.hasProviders).toBe(true);
	});
});
