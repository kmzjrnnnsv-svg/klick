import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	addOrgFrameworks,
	initializeOrg,
} from "@/lib/compliance/initialize-org";
import { loadReadiness } from "@/lib/compliance/queries-readiness";

// Integrationstest (DATABASE_URL_TEST): Prüfungsreife lädt alle Quellen im
// RLS-Kontext und rechnet je Rahmenwerk — auch zu einem künftigen Stichtag.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("loadReadiness (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	let orgId = "";

	beforeAll(async () => {
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Readiness Test', ${`ready-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek, sector)
				values (${orgId}, 'test-dek', 'other')`;
		});
		await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			await addOrgFrameworks(tx, orgId, ["iso27001", "amlr"], null);
			await initializeOrg(tx, {
				orgId,
				userId: null,
				frameworks: ["iso27001", "amlr"],
				sector: "other",
				licenceStage: "0_vorbereitung",
				caspServices: [],
				applyBaseline: false,
			});
		});
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
		});
		await client.end({ timeout: 5 });
	});

	async function load(asOf: Date) {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return loadReadiness(tx, orgId, { asOf });
		});
	}

	it("frische Org: Score 0, Pflichtdokumente fehlen, Controls offen", async () => {
		const r = await load(new Date("2026-10-17T12:00:00Z"));
		const iso = r?.results.find((x) => x.framework === "iso27001");
		expect(iso?.score).toBe(0);
		expect(iso?.verdict).toBe("not_ready");
		expect(
			iso?.blockers.filter((b) => b.kind === "document_missing").length,
		).toBe(10);
		expect(
			iso?.blockers.some((b) => b.kind === "control_not_implemented"),
		).toBe(true);
	});

	it("AMLR heute nicht anwendbar, zum Stichtag 2027-07-10 schon (G1-Fix)", async () => {
		const today = await load(new Date("2026-10-17T12:00:00Z"));
		const later = await load(new Date("2027-07-11T12:00:00Z"));
		const a0 = today?.results.find((x) => x.framework === "amlr");
		const a1 = later?.results.find((x) => x.framework === "amlr");
		expect(a0?.applicable).toBe(0);
		expect(a0?.verdict).toBe("n_a");
		expect(a1?.applicable).toBeGreaterThan(0);
	});
});
