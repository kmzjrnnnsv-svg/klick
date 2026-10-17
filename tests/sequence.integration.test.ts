import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { risks } from "@/db/schema";
import { nextRiskCode } from "@/lib/compliance/risk";
import { lockOrgSequence } from "@/lib/db/org-sequence";

// Integrationstest (DATABASE_URL_TEST): zwei gleichzeitige Anlagen bekommen
// verschiedene laufende Nummern (vorher: gleiche Nummer → Unique-Fehler).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("laufende Nummern unter Gleichzeitigkeit (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 4 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	let orgId = "";

	beforeAll(async () => {
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Seq Test', ${`seq-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
		});
		await client.end({ timeout: 5 });
	});

	const create = (title: string) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			await lockOrgSequence(tx, orgId);
			const existing = await tx
				.select({ code: risks.code })
				.from(risks)
				.where(eq(risks.organizationId, orgId));
			const code = nextRiskCode(existing.map((r) => r.code));
			// Zeitfenster, in dem ohne Sperre beide dieselbe Nummer sähen
			await tx.execute(sql`select pg_sleep(0.2)`);
			await tx.insert(risks).values({ organizationId: orgId, code, title });
			return code;
		});

	it("zwei parallele Anlagen → zwei Nummern, kein Fehler", async () => {
		const [a, b] = await Promise.all([create("A"), create("B")]);
		expect(a).not.toBe(b);
		expect(new Set([a, b]).size).toBe(2);
	});
});
