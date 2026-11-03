import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { documents } from "@/db/schema";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import type { OrgTx } from "@/lib/db/with-org";
import {
	saveBuilderAnswers,
	startBuilder,
	switchToCustomText,
} from "@/lib/documents/builder/server";

// Integrationstest (DATABASE_URL_TEST): Richtlinien-Baukasten am Dokument —
// starten, Antworten speichern (Text entsteht neu), nur im Entwurf, nur in
// der eigenen Organisation, eigener Text behält die Antworten.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Richtlinien-Baukasten (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgIds: string[] = [];
	let docId = "";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		for (const n of ["a", "b"]) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Baukasten ${n.toUpperCase()}`}, ${`builder-${n}-${stamp}`}, now())
				returning id`;
			orgIds.push(o?.id as string);
		}
		const tpl = TEMPLATE_BY_CODE.get("RL-ENDGERAETE");
		const [doc] = await inOrg(orgIds[0] as string, (tx) =>
			tx
				.insert(documents)
				.values({
					organizationId: orgIds[0] as string,
					docNumber: `RL-${stamp}`,
					title: "Endgeräte- und Mobilgeräterichtlinie",
					bodyMarkdown: tpl?.body ?? "",
					templateCode: "RL-ENDGERAETE",
				})
				.returning({ id: documents.id }),
		);
		docId = doc?.id as string;
	});

	afterAll(async () => {
		for (const id of orgIds)
			await client`delete from organization where id = ${id}`;
		await client.end();
	});

	const read = () =>
		inOrg(orgIds[0] as string, async (tx) => {
			const [row] = await tx
				.select({ body: documents.bodyMarkdown, builder: documents.builder })
				.from(documents)
				.where(eq(documents.id, docId));
			return row;
		});

	it("startet, speichert Antworten und schreibt den Text neu", async () => {
		const orgA = orgIds[0] as string;
		const started = await inOrg(orgA, (tx) => startBuilder(tx, orgA, docId));
		expect(started.ok).toBe(true);
		let row = await read();
		expect(row?.builder).toMatchObject({
			template: "RL-ENDGERAETE",
			mode: "builder",
			answers: {},
		});
		expect(row?.body).toContain("[Bildschirmsperre, z. B. 5 Minuten]");
		expect(row?.body).toContain("Baukasten A");

		const saved = await inOrg(orgA, (tx) =>
			saveBuilderAnswers(tx, orgA, docId, {
				sperre: 5,
				geraete: "firma",
				unbekannt: "x",
				mdm: "falsch",
			}),
		);
		expect(saved.ok).toBe(true);
		if (saved.ok)
			expect(saved.audit[0]?.after).toEqual({
				changed: ["geraete", "sperre"],
			});
		row = await read();
		expect(row?.builder?.answers).toEqual({ sperre: 5, geraete: "firma" });
		expect(row?.body).toContain("nach 5 Minuten ohne Eingabe");

		// null löscht eine Antwort; gleiche Antworten schreiben kein Audit
		const cleared = await inOrg(orgA, (tx) =>
			saveBuilderAnswers(tx, orgA, docId, { sperre: null }),
		);
		expect(cleared.ok && cleared.audit.length).toBe(1);
		const same = await inOrg(orgA, (tx) =>
			saveBuilderAnswers(tx, orgA, docId, { geraete: "firma" }),
		);
		expect(same.ok && same.audit.length).toBe(0);
		expect((await read())?.builder?.answers).toEqual({ geraete: "firma" });
	});

	it("fremde Organisation sieht das Dokument nicht", async () => {
		const orgB = orgIds[1] as string;
		const res = await inOrg(orgB, (tx) =>
			saveBuilderAnswers(tx, orgB, docId, { sperre: 10 }),
		);
		expect(res).toEqual({ ok: false, error: "notFound" });
	});

	it("eigener Text behält die Antworten und sperrt das Speichern", async () => {
		const orgA = orgIds[0] as string;
		const res = await inOrg(orgA, (tx) => switchToCustomText(tx, orgA, docId));
		expect(res.ok).toBe(true);
		expect((await read())?.builder).toMatchObject({
			mode: "custom",
			answers: { geraete: "firma" },
		});
		const save = await inOrg(orgA, (tx) =>
			saveBuilderAnswers(tx, orgA, docId, { sperre: 3 }),
		);
		expect(save).toEqual({ ok: false, error: "custom_mode" });
		// zurück zum Baukasten: Text entsteht neu aus den Antworten
		const back = await inOrg(orgA, (tx) => startBuilder(tx, orgA, docId));
		expect(back.ok).toBe(true);
		expect((await read())?.builder?.mode).toBe("builder");
	});

	it("nur im Entwurf", async () => {
		const orgA = orgIds[0] as string;
		await inOrg(orgA, (tx) =>
			tx
				.update(documents)
				.set({ status: "in_review" })
				.where(eq(documents.id, docId)),
		);
		const res = await inOrg(orgA, (tx) =>
			saveBuilderAnswers(tx, orgA, docId, { sperre: 3 }),
		);
		expect(res).toEqual({ ok: false, error: "locked" });
		const start = await inOrg(orgA, (tx) => startBuilder(tx, orgA, docId));
		expect(start).toEqual({ ok: false, error: "locked" });
	});
});
