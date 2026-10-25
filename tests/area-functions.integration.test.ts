import { and, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { controlImplementations, controls, roleAssignments } from "@/db/schema";
import { initializeOrg } from "@/lib/compliance/initialize-org";

// Integrationstest (DATABASE_URL_TEST, migriert + geseedet): Bereich →
// Funktion aus der Einrichtung (org_settings.area_functions). Neue Controls
// bekommen die Funktion mit ihrer Person; ist sie unbesetzt, bleibt die
// einrichtende Person eingetragen; Bereiche ohne Zuordnung wie bisher.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Bereiche → Funktion (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	const users: string[] = [];

	beforeAll(async () => {
		for (const n of ["setup", "isb"]) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${n}, ${`area-${n}-${stamp}@example.test`}, true, now(), now())
				returning id`;
			users.push(u?.id as string);
		}
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Areas', ${`areas-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek, sector, area_functions)
				values (${orgId}, 'test-dek', 'other', ${JSON.stringify({ access: "isb_ciso", privacy: "dpo" })}::jsonb)`;
		});
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
			for (const id of users) await tx`delete from "user" where id = ${id}`;
		});
		await client.end({ timeout: 5 });
	});

	const owners = (prefix: string) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return tx
				.select({
					fn: controlImplementations.ownerFunction,
					user: controlImplementations.ownerUserId,
				})
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.organizationId, orgId),
						like(controls.code, `${prefix}%`),
					),
				);
		});

	it("neue Controls bekommen die Funktion des Bereichs", async () => {
		await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			await tx.insert(roleAssignments).values({
				organizationId: orgId,
				function: "isb_ciso",
				userId: users[1],
			});
			await initializeOrg(tx, {
				orgId,
				userId: users[0] as string,
				frameworks: ["iso27001", "dsgvo"],
				sector: "other",
				licenceStage: "0_vorbereitung",
				caspServices: [],
				applyBaseline: false,
			});
		});
		const access = await owners("CC-IAM-");
		expect(access.length).toBeGreaterThan(0);
		for (const r of access)
			expect(r).toEqual({ fn: "isb_ciso", user: users[1] });
		// DSB unbesetzt: Funktion gemerkt, Person bleibt die einrichtende
		const privacy = await owners("CC-PRV-");
		expect(privacy.length).toBeGreaterThan(0);
		for (const r of privacy) expect(r).toEqual({ fn: "dpo", user: users[0] });
		// ohne Zuordnung wie bisher
		const gov = await owners("CC-GOV-");
		expect(gov.length).toBeGreaterThan(0);
		for (const r of gov) expect(r).toEqual({ fn: null, user: users[0] });
	});
});
