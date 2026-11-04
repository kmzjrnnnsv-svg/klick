import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { controlTests, processes } from "@/db/schema";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import type { OrgTx } from "@/lib/db/with-org";
import { implementationFor } from "@/lib/evidence-studio/implementation";

// Integrationstest (DATABASE_URL_TEST): Ergebnis zu einem geplanten Test füllt
// die geplante Zeile (Prozess bleibt, die Übung schließt die Lücke im
// Testprogramm); zweimal oder aus einer anderen Org geht nicht.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Geplanter Test wird durchgeführt (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let otherId = "";
	let impl = "";
	let otherImpl = "";
	let processId = "";
	let plannedId = "";

	const inOrg = <T>(org: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('BCM A', ${`bcm-a-${stamp}`}, now()) returning id`;
		const [p] = await client`
			insert into organization (name, slug, created_at)
			values ('BCM B', ${`bcm-b-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		otherId = p?.id as string;
		await inOrg(orgId, async (tx) => {
			impl = (await implementationFor(tx, orgId, "CC-BCM-05"))?.id as string;
			const [proc] = await tx
				.insert(processes)
				.values({
					organizationId: orgId,
					code: "P-01",
					name: "Zahlungsverkehr",
					criticality: "critical",
				})
				.returning({ id: processes.id });
			processId = proc?.id as string;
			const [planned] = await tx
				.insert(controlTests)
				.values({
					organizationId: orgId,
					implementationId: impl,
					method: "bcm_exercise",
					plannedAt: "2026-06-01",
					processId,
				})
				.returning({ id: controlTests.id });
			plannedId = planned?.id as string;
		});
		await inOrg(otherId, async (tx) => {
			otherImpl = (await implementationFor(tx, otherId, "CC-BCM-05"))
				?.id as string;
		});
	});

	afterAll(async () => {
		await client`delete from organization where id in (${orgId}, ${otherId})`;
		await client.end();
	});

	it("andere Org kann die geplante Zeile nicht durchführen", async () => {
		await expect(
			inOrg(otherId, (tx) =>
				insertControlTest(
					tx,
					{ orgId: otherId, userId: null },
					{
						implementationId: otherImpl,
						method: "bcm_exercise",
						result: "pass",
						plannedTestId: plannedId,
					},
				),
			),
		).rejects.toThrow("notFound");
	});

	it("füllt die geplante Zeile, Prozess bleibt", async () => {
		const res = await inOrg(orgId, (tx) =>
			insertControlTest(
				tx,
				{ orgId, userId: null },
				{
					implementationId: impl,
					method: "bcm_exercise",
					result: "pass",
					notes: "Planspiel Ausfall Rechenzentrum",
					plannedTestId: plannedId,
				},
			),
		);
		expect(res.id).toBe(plannedId);
		const rows = await inOrg(orgId, (tx) =>
			tx
				.select()
				.from(controlTests)
				.where(eq(controlTests.implementationId, impl)),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.processId).toBe(processId);
		expect(rows[0]?.result).toBe("pass");
		expect(rows[0]?.testedAt).not.toBeNull();
		expect(rows[0]?.plannedAt).toBe("2026-06-01");
	});

	it("ein zweites Ergebnis zur selben Planung geht nicht", async () => {
		await expect(
			inOrg(orgId, (tx) =>
				insertControlTest(
					tx,
					{ orgId, userId: null },
					{
						implementationId: impl,
						method: "bcm_exercise",
						result: "fail",
						plannedTestId: plannedId,
					},
				),
			),
		).rejects.toThrow("notFound");
	});
});
