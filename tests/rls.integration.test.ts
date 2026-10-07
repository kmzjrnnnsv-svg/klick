import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstest gegen eine migrierte Datenbank (DATABASE_URL_TEST).
// Prüft, dass Row-Level-Security wirklich greift: fremde Zeilen sind
// unsichtbar, Schreiben in fremde Orgs scheitert, audit_log ist append-only.
// Die Rolle darf weder Superuser noch BYPASSRLS sein — sonst ist der Test
// wertlos und schlägt absichtlich fehl.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("RLS (Postgres)", () => {
	const sql = postgres(url ?? "postgres://invalid", { max: 1 });
	let orgA = "";
	let orgB = "";

	beforeAll(async () => {
		const [role] =
			await sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
		expect(role.rolsuper).toBe(false);
		expect(role.rolbypassrls).toBe(false);
		const rows = await sql`
			insert into organization (name, slug, created_at)
			values ('RLS A', ${`rls-a-${Date.now()}`}, now()), ('RLS B', ${`rls-b-${Date.now()}`}, now())
			returning id`;
		orgA = rows[0].id;
		orgB = rows[1].id;
	});

	afterAll(async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${orgA}, ${orgB})`;
		});
		await sql.end({ timeout: 5 });
	});

	it("jede Org-Tabelle ist in der DB mit RLS + FORCE + Policy ausgestattet", async () => {
		const rows = await sql<
			{
				relname: string;
				relrowsecurity: boolean;
				relforcerowsecurity: boolean;
				policies: number;
			}[]
		>`
			select c.relname, c.relrowsecurity, c.relforcerowsecurity,
			       (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r'
			  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
			  and c.relname not in ('member', 'invitation', 'sso_provider')`;
		expect(rows.length).toBeGreaterThan(70);
		const bad = rows.filter(
			(r) => !(r.relrowsecurity && r.relforcerowsecurity && r.policies > 0),
		);
		expect(bad.map((b) => b.relname)).toEqual([]);
	});

	it("ohne Kontext sind Org-Tabellen leer", async () => {
		const [{ n }] = await sql`select count(*)::int as n from risks`;
		expect(n).toBe(0);
	});

	it("Org A sieht nur eigene Zeilen, Org B sieht nichts, Fremd-Insert scheitert", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			await tx`insert into risks (organization_id, code, title) values (${orgA}, 'R-1', 'Test A')`;
			await tx`insert into tasks (organization_id, title) values (${orgA}, 'Aufgabe A')`;
			const [{ n }] = await tx`select count(*)::int as n from risks`;
			expect(n).toBe(1);
		});
		// Ein fehlgeschlagenes Statement bricht die Postgres-Transaktion ab;
		// postgres.js wirft den Fehler nach dem Callback erneut. Deshalb eigene Tx.
		await expect(
			sql.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${orgA}, true)`;
				await tx`insert into risks (organization_id, code, title) values (${orgB}, 'R-X', 'Fremd')`;
			}),
		).rejects.toThrow(/row-level security/);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgB}, true)`;
			const [{ n }] = await tx`select count(*)::int as n from risks`;
			expect(n).toBe(0);
			const updated = await tx`update risks set title = 'x' returning id`;
			expect(updated.length).toBe(0);
			const deleted = await tx`delete from tasks returning id`;
			expect(deleted.length).toBe(0);
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			const [{ n }] =
				await tx`select count(*)::int as n from risks where organization_id in (${orgA}, ${orgB})`;
			expect(n).toBe(1);
		});
	});

	it("org_settings (DEK) ist ebenfalls isoliert", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek) values (${orgA}, 'enc')`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgB}, true)`;
			const rows = await tx`select encrypted_dek from org_settings`;
			expect(rows.length).toBe(0);
		});
	});

	it("audit_log: Insert im Kontext erlaubt, Update/Delete unmöglich", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			await tx`insert into audit_log (id, organization_id, action, hash) values (gen_random_uuid(), ${orgA}, 'test', 'h')`;
			const upd =
				await tx`update audit_log set action = 'x' where organization_id = ${orgA} returning id`;
			expect(upd.length).toBe(0);
			const del =
				await tx`delete from audit_log where organization_id = ${orgA} returning id`;
			expect(del.length).toBe(0);
			const [{ n }] = await tx`select count(*)::int as n from audit_log`;
			expect(n).toBe(1);
		});
	});

	it("der Kontext ist transaktionslokal", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
		});
		const [{ v }] = await sql`select current_setting('app.org_id', true) as v`;
		expect(v === null || v === "").toBe(true);
	});
});
