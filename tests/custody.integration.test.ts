import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { walletKeyHolders, wallets } from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { encryptJson } from "@/lib/crypto/org-dek";
import {
	getWallet,
	holderLocationAad,
	listWallets,
} from "@/lib/custody/queries";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Verwahrung. Der Aufbewahrungsort
// eines Schlüsselanteils steht nur verschlüsselt in der DB und kommt über
// getWallet entschlüsselt zurück; fremde Orgs sehen weder Wallets noch
// Inhaber:innen; je Org und Stichtag gibt es genau eine Abstimmung.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Verwahrung (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	let walletId = "";
	const location = "Bankschließfach 12, Frankfurt";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Custody ${name}`}, ${`custody-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		await inOrg(orgA, async (tx) => {
			const [w] = await tx
				.insert(wallets)
				.values({
					organizationId: orgA,
					code: "W-01",
					name: "Kunden Cold",
					quorumRequired: 2,
					quorumTotal: 3,
				})
				.returning({ id: wallets.id });
			walletId = w?.id as string;
			const id = crypto.randomUUID();
			await tx.insert(walletKeyHolders).values({
				id,
				organizationId: orgA,
				walletId,
				externalName: "Notar Schmidt",
				role: "backup",
				locationEnc: await encryptJson(
					tx,
					orgA,
					{ location },
					holderLocationAad(id),
				),
			});
		});
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${orgA}, ${orgB})`;
		});
		await client.end({ timeout: 5 });
	});

	it("Ort nur verschlüsselt gespeichert, über getWallet lesbar", async () => {
		const raw = await inOrg(orgA, (tx) =>
			tx.execute(sql`select location_enc from wallet_key_holders`),
		);
		expect(JSON.stringify(raw)).not.toContain("Bankschließfach");
		const detail = await inOrg(orgA, (tx) => getWallet(tx, orgA, walletId));
		expect(detail?.holders[0]?.location).toBe(location);
		const list = await inOrg(orgA, (tx) => listWallets(tx, orgA));
		// Quorum 2, aber kein aktiver Signer
		expect(list[0]?.issues).toContain("quorum_exceeds_signers");
	});

	it("fremde Org sieht nichts", async () => {
		const other = await inOrg(orgB, async (tx) => ({
			wallets: await tx.execute(sql`select id from wallets`),
			holders: await tx.execute(sql`select id from wallet_key_holders`),
			detail: await getWallet(tx, orgB, walletId),
		}));
		expect(other.wallets).toHaveLength(0);
		expect(other.holders).toHaveLength(0);
		expect(other.detail).toBeNull();
	});

	it("eine Abstimmung je Org und Stichtag", async () => {
		const insert = (orgId: string) =>
			inOrg(orgId, (tx) =>
				tx.execute(sql`insert into custody_reconciliations (organization_id, day, lines)
					values (${orgId}, '2026-10-21', '[]'::jsonb)`),
			);
		await insert(orgA);
		await expect(insert(orgA)).rejects.toThrow();
		// andere Org, gleicher Tag: erlaubt
		await insert(orgB);
	});
});
