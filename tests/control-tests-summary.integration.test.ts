import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { controlTests } from "@/db/schema";
import { controlTestSummary } from "@/lib/compliance/queries-controls";
import type { OrgTx } from "@/lib/db/with-org";
import { implementationFor } from "@/lib/evidence-studio/implementation";

// Integrationstest (DATABASE_URL_TEST): Tests je Control im Register
// /controls. Je Umsetzung und Testart zählt nur das letzte Ergebnis; Tests
// ohne Ergebnis und Tests anderer Orgs zählen nie.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Tests je Control (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let otherId = "";
	let implA = "";
	let implB = "";

	const inOrg = <T>(org: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org}, true)`);
			return fn(tx);
		});
	const at = (days: number) => new Date(Date.now() - days * 86_400_000);

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Tests A', ${`ctests-a-${stamp}`}, now()) returning id`;
		const [p] = await client`
			insert into organization (name, slug, created_at)
			values ('Tests B', ${`ctests-b-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		otherId = p?.id as string;
		await inOrg(orgId, async (tx) => {
			implA = (await implementationFor(tx, orgId, "CC-GOV-01"))?.id as string;
			implB = (await implementationFor(tx, orgId, "CC-RSK-01"))?.id as string;
			const base = { organizationId: orgId };
			await tx.insert(controlTests).values([
				// A, Interview: früher bestanden, zuletzt fehlgeschlagen
				{
					...base,
					implementationId: implA,
					method: "interview",
					result: "pass",
					testedAt: at(40),
				},
				{
					...base,
					implementationId: implA,
					method: "interview",
					result: "fail",
					testedAt: at(5),
				},
				// A, Einsicht: bestanden
				{
					...base,
					implementationId: implA,
					method: "inspection",
					result: "pass",
					testedAt: at(3),
				},
				// B: geplant ohne Ergebnis zählt nicht, Nachvollzug teilweise
				{
					...base,
					implementationId: implB,
					method: "interview",
					plannedAt: "2026-12-01",
				},
				{
					...base,
					implementationId: implB,
					method: "reperformance",
					result: "partial",
					testedAt: at(1),
				},
			]);
		});
		await inOrg(otherId, async (tx) => {
			const impl = (await implementationFor(tx, otherId, "CC-GOV-01"))
				?.id as string;
			await tx.insert(controlTests).values({
				organizationId: otherId,
				implementationId: impl,
				method: "interview",
				result: "pass",
				testedAt: at(1),
			});
		});
	});

	afterAll(async () => {
		await client`delete from organization where id in (${orgId}, ${otherId})`;
		await client.end();
	});

	it("zählt je Testart nur das letzte Ergebnis", async () => {
		const map = await inOrg(orgId, (tx) => controlTestSummary(tx, orgId));
		expect(map.get(implA)).toEqual({ pass: 1, partial: 0, fail: 1 });
		expect(map.get(implB)).toEqual({ pass: 0, partial: 1, fail: 0 });
		expect(map.size).toBe(2);
	});

	it("sieht die Tests einer anderen Org nicht", async () => {
		const map = await inOrg(orgId, (tx) => controlTestSummary(tx, otherId));
		expect(map.size).toBe(0);
	});
});
