import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import type { OrgTx } from "@/lib/db/with-org";
import { loadIsmsFacts } from "@/lib/isms-plan/facts";

// Integrationstest (DATABASE_URL_TEST): der Lader für den Stand im
// ISMS-Jahresplan zählt in SQL und sieht nur die eigene Org.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("ISMS-Jahresplan: Stand aus Klick (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let otherId = "";

	const inOrg = <T>(id: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${id}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Jahresplan', ${`jp-${stamp}`}, now()) returning id`;
		const [p] = await client`
			insert into organization (name, slug, created_at)
			values ('Andere', ${`jp-o-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		otherId = p?.id as string;
	});

	afterAll(async () => {
		await client`delete from organization where id in (${orgId}, ${otherId})`;
		await client.end();
	});

	it("leere Org: nichts erfasst", async () => {
		const f = await inOrg(orgId, (tx) =>
			loadIsmsFacts(tx, orgId, new Date("2026-11-05T10:00:00Z")),
		);
		expect(f.today).toBe("2026-11-05");
		expect(f.documents).toEqual({});
		expect(f.isbAppointed).toBe(false);
		expect(f.risks).toEqual({ total: 0, current: 0 });
		expect(f.audits.internal).toEqual({ lastDone: null, next: null });
		expect(f.managementReview).toEqual({ lastHeld: null, next: null });
	});

	it("zählt Dokumente, Risiken, BIA, Abweichungen und Termine", async () => {
		await inOrg(orgId, async (tx) => {
			await tx.execute(sql`
				insert into documents (organization_id, doc_number, title, template_code, next_review_at)
				values (${orgId}, ${`D-${stamp}`}, 'Leitlinie', 'RL-ISMS-LEITLINIE', '2027-01-01')`);
			await tx.execute(sql`
				insert into risks (organization_id, code, title, assessed_at)
				values (${orgId}, 'R-1', 'Aktuell', '2026-10-01'),
				       (${orgId}, 'R-2', 'Alt', '2024-01-01')`);
			await tx.execute(sql`
				insert into processes (organization_id, code, name, criticality, status, bia)
				values (${orgId}, 'P-1', 'Kritisch', 'critical', 'active',
				  ${JSON.stringify({ v: 1, steps: [4], threshold: 3, impacts: {}, assessedAt: "2026-09-01", assessedBy: null })}::jsonb),
				  (${orgId}, 'P-2', 'Ohne BIA', 'critical', 'active', null)`);
			await tx.execute(sql`
				insert into nonconformities (organization_id, code, title, due_at)
				values (${orgId}, 'A-1', 'Überfällig', '2026-01-01'),
				       (${orgId}, 'A-2', 'Offen', '2027-01-01')`);
			await tx.execute(sql`
				insert into management_reviews (organization_id, held_at, status)
				values (${orgId}, '2026-03-01', 'done'), (${orgId}, '2026-12-01', 'planned')`);
			await tx.execute(sql`
				insert into audits (organization_id, title, type, performed_at, status)
				values (${orgId}, 'Intern', 'internal', '2026-05-01', 'closed')`);
		});
		const f = await inOrg(orgId, (tx) =>
			loadIsmsFacts(tx, orgId, new Date("2026-11-05T10:00:00Z")),
		);
		expect(f.documents["RL-ISMS-LEITLINIE"]).toEqual([
			{ valid: false, nextReviewAt: "2027-01-01" },
		]);
		expect(f.risks).toEqual({ total: 2, current: 1 });
		expect(f.bia).toEqual({ critical: 2, current: 1 });
		expect(f.bcmPlans.critical).toBe(2);
		expect(f.nonconformities).toEqual({ open: 2, overdue: 1 });
		expect(f.managementReview).toEqual({
			lastHeld: "2026-03-01",
			next: "2026-12-01",
		});
		expect(f.audits.internal.lastDone).toBe("2026-05-01");
		expect(f.audits.external.lastDone).toBeNull();
	});

	it("sieht keine Daten anderer Orgs", async () => {
		const f = await inOrg(otherId, (tx) =>
			loadIsmsFacts(tx, otherId, new Date("2026-11-05T10:00:00Z")),
		);
		expect(f.risks.total).toBe(0);
		expect(f.documents).toEqual({});
		expect(f.nonconformities.open).toBe(0);
	});
});
