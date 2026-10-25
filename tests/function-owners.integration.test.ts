import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { risks, roleAssignments } from "@/db/schema";
import { syncFunctionOwners } from "@/lib/compliance/function-owners";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): „Verantwortlich“ als Funktion.
// Wird die Funktion neu besetzt, rechnet syncFunctionOwners die Person an
// allen Einträgen mit dieser Funktion neu; unbesetzt bleibt die bisherige
// Person; Einträge mit Person (ohne Funktion) und fremde Orgs bleiben.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Verantwortlich = Funktion (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org: Record<"A" | "B", string> = { A: "", B: "" };
	const users: string[] = [];

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const ownerOf = (orgId: string, code: string) =>
		inOrg(orgId, async (tx) => {
			const [r] = await tx
				.select({ owner: risks.ownerUserId })
				.from(risks)
				.where(eq(risks.code, code));
			return r?.owner ?? null;
		});

	beforeAll(async () => {
		for (const n of [1, 2]) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${`Owner ${n}`}, ${`owner-${n}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			users.push(u?.id as string);
		}
		for (const name of ["A", "B"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Owners ${name}`}, ${`owners-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			org[name] = o?.id as string;
			await inOrg(org[name], (tx) =>
				tx.insert(risks).values([
					{
						organizationId: org[name],
						code: "R-FN",
						title: "Funktion",
						ownerFunction: "isb_ciso",
					},
					{
						organizationId: org[name],
						code: "R-P",
						title: "Person",
						ownerUserId: users[0],
					},
				]),
			);
		}
	});

	afterAll(async () => {
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		for (const id of users) await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	it("Funktion besetzt: Person wird eingetragen, Person-Einträge bleiben", async () => {
		const gained = await inOrg(org.A, async (tx) => {
			await tx.insert(roleAssignments).values({
				organizationId: org.A,
				function: "isb_ciso",
				userId: users[0],
			});
			return syncFunctionOwners(tx, org.A);
		});
		expect(gained.get(users[0] as string)).toBe(1);
		expect(await ownerOf(org.A, "R-FN")).toBe(users[0]);
		expect(await ownerOf(org.A, "R-P")).toBe(users[0]);
		// fremde Org unberührt
		expect(await ownerOf(org.B, "R-FN")).toBeNull();
	});

	it("neu besetzt: die neue Person übernimmt", async () => {
		const gained = await inOrg(org.A, async (tx) => {
			await tx
				.update(roleAssignments)
				.set({ userId: users[1] })
				.where(eq(roleAssignments.organizationId, org.A));
			return syncFunctionOwners(tx, org.A);
		});
		expect(gained.get(users[1] as string)).toBe(1);
		expect(await ownerOf(org.A, "R-FN")).toBe(users[1]);
		// zweiter Lauf ändert nichts (idempotent)
		const again = await inOrg(org.A, (tx) => syncFunctionOwners(tx, org.A));
		expect(again.size).toBe(0);
	});

	it("unbesetzt: die bisherige Person bleibt", async () => {
		await inOrg(org.A, async (tx) => {
			await tx
				.delete(roleAssignments)
				.where(eq(roleAssignments.organizationId, org.A));
			await syncFunctionOwners(tx, org.A);
		});
		expect(await ownerOf(org.A, "R-FN")).toBe(users[1]);
	});
});
