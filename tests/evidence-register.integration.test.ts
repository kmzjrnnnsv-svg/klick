import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { evidence } from "@/db/schema";
import { pageEvidenceRegister } from "@/lib/compliance/queries-evidence-register";
import type { OrgTx } from "@/lib/db/with-org";
import { linkEvidenceToControl } from "@/lib/evidence/store";
import { implementationFor } from "@/lib/evidence-studio/implementation";
import { PAGE_SIZE } from "@/lib/paging";

// Integrationstest (DATABASE_URL_TEST): Nachweis-Register seitenweise.
// Filter, Suche und Zähler in SQL; ersetzte Fassungen und Dateien von
// Dokumentfassungen bleiben draußen; streng geheime Titel findet die Suche
// nur, wer streng Geheimes sehen darf.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Nachweis-Register (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const page = (f: Partial<Parameters<typeof pageEvidenceRegister>[2]>) =>
		inOrg((tx) =>
			pageEvidenceRegister(tx, orgId, {
				includeSuperseded: false,
				seesSecret: true,
				page: 1,
				...f,
			}),
		);

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Register', ${`register-${stamp}`}, now())
			returning id`;
		orgId = o?.id as string;
		await inOrg(async (tx) => {
			const rows = Array.from({ length: 120 }, (_, i) => ({
				organizationId: orgId,
				title: `Protokoll ${i}`,
				type: "attestation" as const,
			}));
			await tx.insert(evidence).values(rows);
			const [secret] = await tx
				.insert(evidence)
				.values({
					organizationId: orgId,
					title: "Schlüsselzeremonie Tresor",
					type: "attestation",
					classification: "secret",
				})
				.returning({ id: evidence.id });
			await tx.insert(evidence).values([
				{
					organizationId: orgId,
					title: "Datei einer Dokumentfassung",
					type: "document",
					source: "document",
				},
				{
					organizationId: orgId,
					title: "Ersetzte Fassung",
					type: "attestation",
					supersededAt: new Date(),
				},
			]);
			const impl = await implementationFor(tx, orgId, "CC-GOV-01");
			await linkEvidenceToControl(
				tx,
				orgId,
				impl?.id as string,
				secret?.id as string,
			);
		});
	});

	afterAll(async () => {
		await client`delete from organization where id = ${orgId}`;
		await client.end();
	});

	it("lädt eine Seite und zählt alle Treffer", async () => {
		const first = await page({});
		expect(first.total).toBe(121);
		expect(first.rows).toHaveLength(PAGE_SIZE);
		const last = await page({ page: 3 });
		expect(last.rows).toHaveLength(21);
		// über das Ende hinaus: letzte Seite
		expect((await page({ page: 99 })).page).toBe(3);
	});

	it("ersetzte Fassungen nur auf Wunsch, Dokumentdateien nie", async () => {
		expect((await page({ q: "Ersetzte" })).total).toBe(0);
		expect((await page({ q: "Ersetzte", includeSuperseded: true })).total).toBe(
			1,
		);
		expect((await page({ q: "Dokumentfassung" })).total).toBe(0);
	});

	it("filtert in SQL", async () => {
		expect((await page({ classification: "secret" })).total).toBe(1);
		expect((await page({ q: "protokoll 11" })).total).toBe(11);
		// Sonderzeichen sind kein Platzhalter
		expect((await page({ q: "%" })).total).toBe(0);
	});

	it("streng geheime Titel findet nur, wer sie sehen darf", async () => {
		expect((await page({ q: "Tresor" })).total).toBe(1);
		expect((await page({ q: "Tresor", seesSecret: false })).total).toBe(0);
		// über das Kürzel der Maßnahme bleibt der Eintrag auffindbar
		const byCode = await page({ q: "CC-GOV-01", seesSecret: false });
		expect(byCode.total).toBe(1);
		expect(byCode.rows[0]?.controlCodes).toEqual(["CC-GOV-01"]);
	});
});
