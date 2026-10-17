import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { assets } from "@/db/schema";
import { isOrgMember, ownedIds } from "@/lib/db/owned";

// Integrationstest (DATABASE_URL_TEST): Verknüpfungen nehmen nur IDs der
// eigenen Org an (FK-Prüfungen umgehen RLS) und keine Doppelten; Zuweisungen
// nur an Mitglieder der Org (`member` hat kein RLS).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Verknüpfungen: eigene IDs, eigene Mitglieder (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 2 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org = { a: "", b: "" };
	const asset = { a: "", b: "" };
	let userId = "";

	beforeAll(async () => {
		for (const k of ["a", "b"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Owned ${k}`}, ${`owned-${k}-${stamp}`}, now()) returning id`;
			org[k] = o?.id;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org[k]}, true)`;
				const [x] = await tx`
					insert into assets (organization_id, name)
					values (${org[k]}, ${`Asset ${k}`}) returning id`;
				asset[k] = x?.id;
			});
		}
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('owned', ${`owned-${stamp}@example.test`}, true, now(), now()) returning id`;
		userId = u?.id;
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${org.a}, ${userId}, 'editor', now())`;
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${org.a}, ${org.b})`;
			await tx`delete from "user" where id = ${userId}`;
		});
		await client.end({ timeout: 5 });
	});

	const inOrg = <T>(orgId: string, fn: (tx: never) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx as never);
		});

	it("ownedIds filtert fremde und doppelte IDs, Reihenfolge bleibt", async () => {
		const got = await inOrg(org.a, (tx) =>
			ownedIds(tx, assets, org.a, [asset.b, asset.a, asset.a]),
		);
		expect(got).toEqual([asset.a]);
		expect(await inOrg(org.a, (tx) => ownedIds(tx, assets, org.a, []))).toEqual(
			[],
		);
	});

	it("isOrgMember prüft die Org explizit", async () => {
		expect(await inOrg(org.a, (tx) => isOrgMember(tx, org.a, userId))).toBe(
			true,
		);
		expect(await inOrg(org.b, (tx) => isOrgMember(tx, org.b, userId))).toBe(
			false,
		);
	});
});
