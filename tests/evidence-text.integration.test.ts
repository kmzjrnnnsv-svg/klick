import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { evidence, evidenceTexts } from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import type { OrgTx } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";
import { storeEncryptedEvidence } from "@/lib/evidence/store";
import { evidenceTextsFor } from "@/lib/evidence/text";
import { runEvidenceTexts } from "@/lib/jobs/evidence-texts";

// Integrationstest (DATABASE_URL_TEST): Text hochgeladener Dateien für den
// Fassungsvergleich. Mit dem Upload gespeichert (verschlüsselt), für den
// Bestand nachgelesen vom Job evidence-texts (isolierter Parser), fremde
// Orgs sehen nichts, mit dem Nachweis verschwindet der Text.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Text hochgeladener Dateien (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgs: Record<"A" | "B", string> = { A: "", B: "" };
	const saved: Record<string, string | undefined> = {};
	const pdf = new Uint8Array(
		readFileSync(path.join(__dirname, "fixtures/pdf/libreoffice-v1.pdf")),
	);
	const ids = { withText: "", legacy: "", broken: "" };

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const store = (
		bytes: Uint8Array,
		name: string,
		mime: string,
		text?: string,
	) =>
		inOrg(
			orgs.A,
			async (tx) =>
				(
					await storeEncryptedEvidence(tx, {
						orgId: orgs.A,
						bytes,
						mime,
						safeName: name,
						title: name,
						type: "document",
						classification: "internal",
						createdByUserId: null,
						...(text !== undefined
							? { text: { status: "ok" as const, text, truncated: false } }
							: {}),
					})
				).id,
		);

	beforeAll(async () => {
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
				values (${`Texte ${name}`}, ${`texte-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			orgs[name] = org?.id;
		}
		ids.withText = await store(
			new TextEncoder().encode("Absatz eins\nAbsatz zwei"),
			"neu.txt",
			"text/plain",
			"Absatz eins\nAbsatz zwei",
		);
		ids.legacy = await store(pdf, "alt.pdf", "application/pdf");
		ids.broken = await store(
			new TextEncoder().encode("%PDF-1.4 kaputt"),
			"kaputt.pdf",
			"application/pdf",
		);
	});

	afterAll(async () => {
		for (const [k, v] of Object.entries(saved))
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		resetEnvCache();
		await client`delete from organization where id in (${orgs.A}, ${orgs.B})`;
		await client.end();
	});

	it("mit dem Upload gespeichert, verschlüsselt", async () => {
		const [row] = await inOrg(orgs.A, (tx) =>
			tx.select().from(evidenceTexts).where(eq(evidenceTexts.id, ids.withText)),
		);
		expect(row?.status).toBe("ok");
		expect(row?.chars).toBe(23);
		expect(row?.textEnc?.startsWith("enc1:")).toBe(true);
		expect(row?.textEnc).not.toContain("Absatz");
		const texts = await inOrg(orgs.A, (tx) =>
			evidenceTextsFor(tx, orgs.A, [ids.withText, ids.legacy]),
		);
		expect(texts.get(ids.withText)).toEqual({
			status: "ok",
			text: "Absatz eins\nAbsatz zwei",
			truncated: false,
		});
		expect(texts.get(ids.legacy)).toEqual({ status: "pending" });
	});

	it("Job liest den Bestand nach und vermerkt Fehler", async () => {
		const r = await runEvidenceTexts({ orgIds: [orgs.A] });
		expect(r).toEqual({ read: 1, failed: 1 });
		const texts = await inOrg(orgs.A, (tx) =>
			evidenceTextsFor(tx, orgs.A, [ids.legacy, ids.broken]),
		);
		const legacy = texts.get(ids.legacy);
		expect(legacy?.status).toBe("ok");
		expect(legacy?.status === "ok" && legacy.text).toMatch(
			/^Informationssicherheitsleitlinie\n/,
		);
		expect(texts.get(ids.broken)?.status).toBe("error");
		// zweiter Lauf: nichts mehr zu tun
		expect(await runEvidenceTexts({ orgIds: [orgs.A] })).toEqual({
			read: 0,
			failed: 0,
		});
	}, 60_000);

	it("fremde Org sieht nichts, Löschen nimmt den Text mit", async () => {
		const foreign = await inOrg(orgs.B, (tx) =>
			tx.select().from(evidenceTexts).where(eq(evidenceTexts.id, ids.withText)),
		);
		expect(foreign).toEqual([]);
		await inOrg(orgs.A, (tx) =>
			tx.delete(evidence).where(eq(evidence.id, ids.withText)),
		);
		const gone = await inOrg(orgs.A, (tx) =>
			tx.select().from(evidenceTexts).where(eq(evidenceTexts.id, ids.withText)),
		);
		expect(gone).toEqual([]);
	}, 60_000);
});
