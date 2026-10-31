import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { excludeRequirements } from "@/lib/compliance/exclusion-service";

// Integrationstest (DATABASE_URL_TEST, migriert + geseedet): Ausschluss je
// Rahmenwerk schreibt nur, wo das Rahmenwerk ihn kennt; zweimal derselbe
// Ausschluss erzeugt keinen zweiten Eintrag; fremde Org sieht nichts.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const isoAnnex =
	FRAMEWORK_BY_SLUG.get("iso27001")?.requirements.find((r) =>
		r.code.startsWith("A."),
	)?.code ?? "";
const dora = FRAMEWORK_BY_SLUG.get("dora")?.requirements[0]?.code ?? "";

d("excludeRequirements (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const orgs: string[] = [];

	beforeAll(async () => {
		for (const name of ["Ausschluss A", "Ausschluss B"]) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${name}, ${`excl-${name.slice(-1)}-${Date.now()}`}, now())
				returning id`;
			orgs.push(org?.id);
		}
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			for (const id of orgs)
				await tx`delete from organization where id = ${id}`;
		});
		await client.end({ timeout: 5 });
	});

	function inOrg<T>(orgId: string, fn: (tx: never) => Promise<T>) {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx as never);
		});
	}

	async function rows(orgId: string) {
		return client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			return tx`
				select f.slug, r.code, ra.applicable, ra.source, ra.note
				from requirement_applicability ra
				join requirements r on r.id = ra.requirement_id
				join frameworks f on f.id = r.framework_id
				where ra.source = 'manual'`;
		});
	}

	it("schließt nur aus, wo das Rahmenwerk es kennt, und nur einmal", async () => {
		const [a, b] = orgs as [string, string];
		const audit = await inOrg(a, (tx) =>
			excludeRequirements(
				tx,
				a,
				[
					{ key: `iso27001:${isoAnnex}`, note: "Kein eigenes Rechenzentrum" },
					{ key: `dora:${dora}`, note: "darf nicht" },
				],
				"test",
			),
		);
		expect(audit.map((x) => x.target)).toEqual([
			`requirement:iso27001:${isoAnnex}`,
		]);
		const r = await rows(a);
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({
			slug: "iso27001",
			code: isoAnnex,
			applicable: false,
			note: "Kein eigenes Rechenzentrum",
		});
		// derselbe Ausschluss noch einmal: kein neuer Eintrag im Verlauf
		const again = await inOrg(a, (tx) =>
			excludeRequirements(
				tx,
				a,
				[{ key: `iso27001:${isoAnnex}`, note: "anders" }],
				"test",
			),
		);
		expect(again).toEqual([]);
		// fremde Org sieht nichts
		expect(await rows(b)).toHaveLength(0);
	});
});
