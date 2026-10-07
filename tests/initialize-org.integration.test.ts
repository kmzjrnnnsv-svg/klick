import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { BASELINE } from "@/lib/compliance/catalog/baseline";
import { initializeOrg } from "@/lib/compliance/initialize-org";

// Integrationstest (DATABASE_URL_TEST, migriert + geseedet): initializeOrg
// leitet Anwendbarkeit, Arbeitsvorrat und Baseline ab — idempotent.
// Läuft im RLS-Kontext der Org wie in der App (set_config, transaktionslokal).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("initializeOrg (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	let orgId = "";
	let userId = "";

	beforeAll(async () => {
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Init Test', ${`init-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Init Tester', ${`init-${Date.now()}@example.test`}, true, now(), now()) returning id`;
		userId = u?.id;
		const [{ n }] = await client`select count(*)::int as n from requirements`;
		expect(
			n,
			"Katalog muss geseedet sein (pnpm db:seed gegen DATABASE_URL_TEST)",
		).toBeGreaterThan(100);
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
			await tx`delete from "user" where id = ${userId}`;
		});
		await client.end({ timeout: 5 });
	});

	async function run(input: Partial<Parameters<typeof initializeOrg>[1]>) {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return initializeOrg(tx, {
				orgId,
				userId,
				frameworks: ["iso27001", "dora", "nis2"],
				sector: "casp",
				licenceStage: "0_vorbereitung",
				caspServices: ["transfer"],
				applyBaseline: false,
				...input,
			});
		});
	}

	async function count(table: string, where = "true") {
		const rows = await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			return tx.unsafe(
				`select count(*)::int as n from ${table} where ${where}`,
			);
		});
		return Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
	}

	it("CASP mit ISO+DORA+NIS2: Arbeitsvorrat entsteht, NIS2 Art. 20/21/23 lex specialis, TLPT N/A", async () => {
		const s = await run({});
		expect(s.requirements).toBe(190);
		expect(s.controlsCreated).toBeGreaterThan(80);
		expect(s.controls).toBe(s.controlsCreated);
		// lex specialis: 14 NIS2-Anforderungen (Art.20(1), 20(2), 21(1), 21(2)(a–j), 23) + TLPT
		expect(s.notApplicable).toBe(15);
		expect(await count("control_implementations")).toBe(s.controls);
		expect(
			await count("requirement_applicability", "source = 'lex_specialis'"),
		).toBe(14);
		expect(await count("requirement_applicability", "source = 'rule'")).toBe(1);
	});

	it("idempotent: zweiter Lauf legt nichts Neues an", async () => {
		const s = await run({});
		expect(s.controlsCreated).toBe(0);
		expect(await count("control_implementations")).toBe(s.controls);
	});

	it("manuelle Entscheidung überlebt die Re-Initialisierung", async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`
				insert into requirement_applicability (organization_id, requirement_id, applicable, source, note)
				select ${orgId}, r.id, false, 'manual', 'Test-Begründung'
				from requirements r join frameworks f on f.id = r.framework_id
				where f.slug = 'iso27001' and r.code = 'A.7.14'`;
		});
		await run({});
		expect(await count("requirement_applicability", "source = 'manual'")).toBe(
			1,
		);
	});

	it("TLPT-Benennung macht Art. 26 anwendbar", async () => {
		const s = await run({ tlptDesignated: true });
		expect(s.notApplicable).toBe(14);
		expect(await count("requirement_applicability", "source = 'rule'")).toBe(0);
	});

	it("Nicht-Finanz-Org ohne DORA: NIS2 voll anwendbar", async () => {
		const s = await run({ sector: "other", frameworks: ["iso27001", "nis2"] });
		expect(
			await count("requirement_applicability", "source = 'lex_specialis'"),
		).toBe(0);
		expect(s.requirements).toBe(118 + 21);
	});

	it("applyBaseline übernimmt Status, Dienstleister und Assets — nur einmal", async () => {
		const s1 = await run({ applyBaseline: true });
		expect(s1.baselineApplied).toBe(BASELINE.controls.length);
		expect(s1.providersCreated).toBe(BASELINE.providers.length);
		expect(s1.assetsCreated).toBe(BASELINE.assets.length);
		expect(
			await count("control_implementations", "status = 'implemented'"),
		).toBe(BASELINE.controls.filter((c) => c.status === "implemented").length);
		const s2 = await run({ applyBaseline: true });
		expect(s2.providersCreated).toBe(0);
		expect(s2.assetsCreated).toBe(0);
		// manuelle Statusänderung bleibt bei erneuter Baseline
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`update control_implementations set status = 'planned', source = 'manual'
				where organization_id = ${orgId} and control_id = (select id from controls where code = 'CC-LOG-01')`;
		});
		await run({ applyBaseline: true });
		const rows = await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			return tx`select ci.status from control_implementations ci join controls c on c.id = ci.control_id
				where ci.organization_id = ${orgId} and c.code = 'CC-LOG-01'`;
		});
		expect(rows[0]?.status).toBe("planned");
	});
});
