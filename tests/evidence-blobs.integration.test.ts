import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { evidence, evidenceBlobs } from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import type { OrgTx } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";
import { isDbStorageKey } from "@/lib/evidence/aad";
import { dbEnvelope, decryptEvidenceObject } from "@/lib/evidence/read";
import { storeEncryptedEvidence } from "@/lib/evidence/store";

// Integrationstest (DATABASE_URL_TEST): Datei-Speicher ohne S3. Der Umschlag
// liegt verschlüsselt in evidence_blobs ("db:<id>"), lässt sich im
// Org-Kontext lesen und entschlüsseln, ist für fremde Orgs unsichtbar und
// verschwindet mit dem Nachweis.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Datei-Speicher in der Datenbank (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgs: Record<"A" | "B", string> = { A: "", B: "" };
	const saved: Record<string, string | undefined> = {};
	const bytes = new TextEncoder().encode("Protokoll der Wiederherstellung");
	let id = "";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		// ohne Objektspeicher; Pflichtwerte für env() im Test
		for (const k of [
			"S3_ENDPOINT",
			"S3_ACCESS_KEY_ID",
			"S3_SECRET_ACCESS_KEY",
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"BETTER_AUTH_URL",
			"VAULT_KEK_BASE64",
		])
			saved[k] = process.env[k];
		delete process.env.S3_ENDPOINT;
		delete process.env.S3_ACCESS_KEY_ID;
		delete process.env.S3_SECRET_ACCESS_KEY;
		process.env.DATABASE_URL ??= url;
		process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
		process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
		process.env.VAULT_KEK_BASE64 ??= Buffer.alloc(32).toString("base64");
		resetEnvCache();
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		for (const name of ["A", "B"] as const) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Blobs ${name}`}, ${`blobs-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			orgs[name] = org?.id;
		}
		const stored = await inOrg(orgs.A, (tx) =>
			storeEncryptedEvidence(tx, {
				orgId: orgs.A,
				bytes,
				mime: "text/plain",
				safeName: "protokoll.txt",
				title: "Wiederherstellung",
				type: "document",
				classification: "internal",
				createdByUserId: null,
			}),
		);
		id = stored.id;
	});

	afterAll(async () => {
		for (const [k, v] of Object.entries(saved))
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		resetEnvCache();
		await client`delete from organization where id in (${orgs.A}, ${orgs.B})`;
		await client.end();
	});

	it("legt den Umschlag in der Datenbank ab und entschlüsselt ihn", async () => {
		const out = await inOrg(orgs.A, async (tx) => {
			const [row] = await tx
				.select()
				.from(evidence)
				.where(eq(evidence.id, id))
				.limit(1);
			const [s] = await tx.execute<{
				encrypted_dek: string;
				key_version: number;
			}>(
				sql`select encrypted_dek, key_version from org_settings where organization_id = ${orgs.A}`,
			);
			return {
				row,
				dek: {
					wrapped: s?.encrypted_dek ?? "",
					keyVersion: s?.key_version ?? 1,
				},
				packed: await dbEnvelope(tx, orgs.A, id, row?.storageKey ?? null),
			};
		});
		expect(out.row?.storageKey).toBe(`db:${id}`);
		expect(isDbStorageKey(out.row?.storageKey ?? "")).toBe(true);
		expect(out.packed).toBeInstanceOf(Uint8Array);
		// Chiffretext, kein Klartext
		expect(Buffer.from(out.packed ?? []).includes(Buffer.from(bytes))).toBe(
			false,
		);
		const plain = await decryptEvidenceObject({
			evidenceId: id,
			storageKey: out.row?.storageKey ?? "",
			dek: out.dek,
			packed: out.packed,
		});
		expect(new TextDecoder().decode(plain)).toBe(
			"Protokoll der Wiederherstellung",
		);
	});

	it("ohne geladenen Umschlag liest decryptEvidenceObject keine db-Objekte", async () => {
		await expect(
			decryptEvidenceObject({
				evidenceId: id,
				storageKey: `db:${id}`,
				dek: { wrapped: "", keyVersion: 1 },
			}),
		).rejects.toThrow(/org context/);
	});

	it("fremde Orgs sehen den Umschlag nicht", async () => {
		const rows = await inOrg(orgs.B, (tx) =>
			tx
				.select({ id: evidenceBlobs.evidenceId })
				.from(evidenceBlobs)
				.where(eq(evidenceBlobs.evidenceId, id)),
		);
		expect(rows).toEqual([]);
		await expect(
			inOrg(orgs.B, (tx) => dbEnvelope(tx, orgs.B, id, `db:${id}`)),
		).rejects.toThrow(/missing/);
	});

	it("verschwindet mit dem Nachweis", async () => {
		await inOrg(orgs.A, (tx) =>
			tx
				.delete(evidence)
				.where(and(eq(evidence.id, id), eq(evidence.organizationId, orgs.A))),
		);
		const rows = await inOrg(orgs.A, (tx) =>
			tx
				.select({ id: evidenceBlobs.evidenceId })
				.from(evidenceBlobs)
				.where(eq(evidenceBlobs.evidenceId, id)),
		);
		expect(rows).toEqual([]);
	});
});
