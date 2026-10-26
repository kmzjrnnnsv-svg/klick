import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { controlImplementations, evidence, orgSettings } from "@/db/schema";
import {
	listEvidenceForImplementation,
	listEvidenceWithControls,
} from "@/lib/compliance/queries";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { supersedeEvidence } from "@/lib/evidence/current";
import { linkEvidenceToControl } from "@/lib/evidence/store";
import { generateKindEvidence } from "@/lib/evidence-studio/generate/service";
import { implementationFor } from "@/lib/evidence-studio/implementation";

// Integrationstest (DATABASE_URL_TEST): Nachweis-Fassungen. Die neue
// Fassung übernimmt Controls und Nachweisbogen, die alte zählt nicht mehr;
// ein Strang verzweigt sich nicht; wird die neue gelöscht, gilt die alte
// wieder.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Nachweis-Fassungen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let implId = "";
	const ids = { a: "", b: "", c: "" };

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const insertEvidence = (title: string, validUntil: string | null) =>
		inOrg(async (tx) => {
			const [row] = await tx
				.insert(evidence)
				.values({
					organizationId: orgId,
					title,
					type: "attestation",
					validUntil,
				})
				.returning({ id: evidence.id });
			return row?.id as string;
		});
	const rowOf = (id: string) =>
		inOrg(async (tx) => {
			const [r] = await tx.select().from(evidence).where(eq(evidence.id, id));
			return r ?? null;
		});

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Nachweis-Fassungen', ${`nachweis-fassungen-${stamp}`}, now())
			returning id`;
		orgId = o?.id as string;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
			});
		});
		const impl = await inOrg((tx) => implementationFor(tx, orgId, "CC-GOV-01"));
		implId = impl?.id as string;
		ids.a = await insertEvidence("Schulungsnachweis 2025", "2026-12-31");
		await inOrg(async (tx) => {
			await linkEvidenceToControl(tx, orgId, implId, ids.a);
			await tx
				.update(controlImplementations)
				.set({
					sheet: {
						items: { pos1: { mode: "evidence", evidenceIds: [ids.a] } },
					},
				})
				.where(eq(controlImplementations.id, implId));
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		await client.end();
	});

	it("neue Fassung übernimmt Controls und Nachweisbogen, alte zählt nicht mehr", async () => {
		ids.b = await insertEvidence("Schulungsnachweis 2026", "2027-12-31");
		const res = await inOrg((tx) => supersedeEvidence(tx, orgId, ids.a, ids.b));
		expect(res).toBe("ok");
		const a = await rowOf(ids.a);
		const b = await rowOf(ids.b);
		expect(a?.supersededAt).not.toBeNull();
		expect(a?.supersededById).toBe(ids.b);
		expect(b?.supersedesId).toBe(ids.a);

		const forImpl = await inOrg((tx) =>
			listEvidenceForImplementation(tx, orgId, implId),
		);
		expect(forImpl.map((e) => e.id)).toEqual([ids.b]);
		const current = await inOrg((tx) => listEvidenceWithControls(tx, orgId));
		expect(current.map((e) => e.id)).toEqual([ids.b]);
		expect(current[0]?.controlCodes).toEqual(["CC-GOV-01"]);
		const all = await inOrg((tx) =>
			listEvidenceWithControls(tx, orgId, { includeSuperseded: true }),
		);
		expect(all.map((e) => e.id).sort()).toEqual([ids.a, ids.b].sort());

		const [impl] = await inOrg((tx) =>
			tx
				.select({ sheet: controlImplementations.sheet })
				.from(controlImplementations)
				.where(eq(controlImplementations.id, implId)),
		);
		expect(impl?.sheet?.items?.pos1?.evidenceIds).toEqual([ids.b]);
	});

	it("kein Verzweigen: eine ersetzte Fassung bekommt keine zweite Nachfolgerin", async () => {
		ids.c = await insertEvidence("Abzweig", null);
		const res = await inOrg((tx) => supersedeEvidence(tx, orgId, ids.a, ids.c));
		expect(res).toBe("already_superseded");
		expect((await rowOf(ids.c))?.supersedesId).toBeNull();
	});

	it("neue Fassung gelöscht: die alte gilt wieder", async () => {
		await inOrg((tx) => tx.delete(evidence).where(eq(evidence.id, ids.b)));
		const a = await rowOf(ids.a);
		expect(a?.supersededAt).toBeNull();
		expect(a?.supersededById).toBeNull();
		const forImpl = await inOrg((tx) =>
			listEvidenceForImplementation(tx, orgId, implId),
		);
		expect(forImpl.map((e) => e.id)).toEqual([ids.a]);
	});

	it("erzeugter Nachweis: gleicher Inhalt wird wiederverwendet, abgelaufen neu erzeugt", async () => {
		const ctx = { orgId, userId: null };
		const first = await inOrg((tx) =>
			generateKindEvidence(tx, ctx, "NW-ABWEICHUNGEN"),
		);
		expect(first).toMatchObject({ ok: true });
		if (!first.ok) return;
		const again = await inOrg((tx) =>
			generateKindEvidence(tx, ctx, "NW-ABWEICHUNGEN"),
		);
		expect(again.ok && again.reused && again.id).toBe(first.id);
		// abgelaufen: neue Fassung trotz gleicher Prüfsumme
		await inOrg((tx) =>
			tx
				.update(evidence)
				.set({ validUntil: "2020-01-01" })
				.where(eq(evidence.id, first.id)),
		);
		const renewed = await inOrg((tx) =>
			generateKindEvidence(tx, ctx, "NW-ABWEICHUNGEN"),
		);
		expect(renewed.ok && !renewed.reused).toBe(true);
		if (!renewed.ok) return;
		expect(renewed.id).not.toBe(first.id);
		expect((await rowOf(first.id))?.supersededById).toBe(renewed.id);
		expect((await rowOf(renewed.id))?.validUntil).not.toBe("2020-01-01");
	});
});
