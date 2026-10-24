import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstest gegen die migrierte Datenbank wallet_test
// (WALLET_DATABASE_URL_TEST, Rolle ohne Superuser/BYPASSRLS): Org-Trennung,
// eigene Mitgliedschaften über app.user_id, Einladungen nur in der Org,
// audit_log nur anhängend, FORCE auf jeder RLS-Tabelle.

const url = process.env.WALLET_DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("RLS both.money (Postgres)", () => {
	const sql = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	let userA = "";
	let userB = "";

	const asPlatform = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
		sql.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			return fn(tx);
		}) as Promise<T>;

	beforeAll(async () => {
		const [role] =
			await sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
		expect(role?.rolsuper).toBe(false);
		expect(role?.rolbypassrls).toBe(false);
		const users = await sql`
			insert into "user" (name, email) values
			  ('A', ${`a-${stamp}@example.org`}), ('B', ${`b-${stamp}@example.org`})
			returning id`;
		userA = users[0]?.id;
		userB = users[1]?.id;
		await asPlatform(async (tx) => {
			const rows = await tx`
				insert into orgs (name, slug) values
				  ('RLS A', ${`rls-a-${stamp}`}), ('RLS B', ${`rls-b-${stamp}`})
				returning id`;
			orgA = rows[0]?.id;
			orgB = rows[1]?.id;
			for (const org of [orgA, orgB])
				await tx`insert into org_settings (organization_id, encrypted_dek) values (${org}, 'x')`;
			await tx`insert into members (organization_id, user_id, role) values
			  (${orgA}, ${userA}, 'owner'), (${orgB}, ${userB}, 'owner')`;
			await tx`insert into invitations (organization_id, email, role, expires_at)
			  values (${orgA}, ${`neu-${stamp}@example.org`}, 'viewer', now() + interval '1 day')`;
		});
	});

	afterAll(async () => {
		await asPlatform(async (tx) => {
			await tx`delete from orgs where id in (${orgA}, ${orgB})`;
		});
		await sql`delete from "user" where id in (${userA}, ${userB})`;
		await sql.end({ timeout: 5 });
	});

	it("jede Tabelle mit RLS trägt FORCE und eine Policy", async () => {
		const rows = await sql<
			{ relname: string; force: boolean; policies: number }[]
		>`
			select c.relname, c.relforcerowsecurity as force,
			       (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
			from pg_class c
			where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
			  and c.relrowsecurity`;
		expect(rows.map((r) => r.relname).sort()).toEqual([
			"audit_log",
			"invitations",
			"members",
			"notifications",
			"org_settings",
			"orgs",
		]);
		expect(rows.filter((r) => !r.force || r.policies === 0)).toEqual([]);
	});

	it("ohne Kontext ist alles leer", async () => {
		for (const t of ["orgs", "org_settings", "members", "invitations"]) {
			const [r] = await sql`select count(*)::int as n from ${sql(t)}`;
			expect([t, r?.n]).toEqual([t, 0]);
		}
	});

	it("Org A sieht nur sich, Schreiben in Org B scheitert", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			const o = await tx`select id from orgs`;
			expect(o.map((r) => r.id)).toEqual([orgA]);
			const m = await tx`select organization_id from members`;
			expect(m.map((r) => r.organization_id)).toEqual([orgA]);
			const i = await tx`select count(*)::int as n from invitations`;
			expect(i[0]?.n).toBe(1);
		});
		await expect(
			sql.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${orgA}, true)`;
				await tx`insert into members (organization_id, user_id, role) values (${orgB}, ${userA}, 'viewer')`;
			}),
		).rejects.toThrow(/row-level security/);
	});

	it("nur Person: eigene Mitgliedschaften und Orgs lesen, nichts schreiben", async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.user_id', ${userA}, true)`;
			const m = await tx`select organization_id, user_id from members`;
			expect(m).toEqual([{ organization_id: orgA, user_id: userA }]);
			const o = await tx`select id from orgs`;
			expect(o.map((r) => r.id)).toEqual([orgA]);
			const s = await tx`select count(*)::int as n from org_settings`;
			expect(s[0]?.n).toBe(0);
			const i = await tx`select count(*)::int as n from invitations`;
			expect(i[0]?.n).toBe(0);
		});
		await expect(
			sql.begin(async (tx) => {
				await tx`select set_config('app.user_id', ${userA}, true)`;
				await tx`insert into members (organization_id, user_id, role) values (${orgB}, ${userA}, 'owner')`;
			}),
		).rejects.toThrow(/row-level security/);
	});

	it("audit_log: anhängen ja, ändern und löschen nie — auch nicht als Plattform", async () => {
		const id = randomUUID();
		await sql.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			await tx`insert into audit_log (id, organization_id, action, hash) values (${id}, ${orgA}, 'test', 'h')`;
		});
		// Keine UPDATE-/DELETE-Policy: nichts trifft eine Zeile (Trigger als
		// zweite Sperre für Rollen ohne RLS, z. B. Superuser)
		const upd = await asPlatform(
			(tx) =>
				tx`update audit_log set action = 'x' where id = ${id} returning id`,
		);
		const del = await asPlatform(
			(tx) => tx`delete from audit_log where id = ${id} returning id`,
		);
		expect([upd.length, del.length]).toEqual([0, 0]);
		const [kept] = await asPlatform(
			(tx) => tx`select action from audit_log where id = ${id}`,
		);
		expect(kept?.action).toBe("test");
		const [trigger] = await sql`
			select count(*)::int as n from pg_trigger
			where tgrelid = 'audit_log'::regclass and tgname like 'audit_log_no_%'`;
		expect(trigger?.n).toBe(2);
		await expect(
			sql.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${orgB}, true)`;
				await tx`insert into audit_log (id, organization_id, action, hash) values (${randomUUID()}, ${orgA}, 'fremd', 'h')`;
			}),
		).rejects.toThrow(/row-level security/);
	});
});
