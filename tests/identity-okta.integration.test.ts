import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import { identitySources, orgSettings } from "@/db/schema";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { connectOktaSource, oktaTokenOf } from "@/lib/identity/service";

// Integrationstest (DATABASE_URL_TEST): Okta (Teil D I4). Das Token liegt nur
// verschlüsselt in secret_enc (Rückweg über den Org-Schlüssel), nie im Audit;
// eine Okta-Adresse gehört nur einer Org, eine andere erst nach dem Trennen.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const IAM = ["CC-IAM-02", "CC-IAM-03", "CC-IAM-04", "CC-IAM-05"];

d("Okta (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const domain = `k${stamp.toString(36)}.okta.com`;
	const TOKEN = "00okta-test-token-abcdefghijklmnopqrstu1234";
	const org = { a: "", b: "" };
	let owner = "";
	const ownerEmail = `olga-okta-${stamp}@firma.example`;

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Olga', ${ownerEmail}, true, now(), now()) returning id`;
		owner = u?.id as string;
		for (const key of ["a", "b"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`O ${key}`}, ${`o-${key}-${stamp}`}, now()) returning id`;
			org[key] = o?.id as string;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org[key]}, ${owner}, 'owner', now())`;
			const wrapped = await wrapDek(await generateDek());
			await inOrg(org[key], async (tx) => {
				await tx.insert(orgSettings).values({
					organizationId: org[key],
					encryptedDek: wrapped.wrapped,
					keyVersion: wrapped.keyVersion,
					licenceStage: "1_agent",
				});
				await ensureControlImplementations(tx, org[key], owner, IAM);
			});
		}
	});

	afterAll(async () => {
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		if (owner) await client`delete from "user" where id = ${owner}`;
		await client.end();
	});

	const connect = (orgId: string, d: string, token: string) =>
		inOrg(orgId, (tx) =>
			connectOktaSource(
				tx,
				{ orgId, userId: owner },
				{ domain: d, token, domains: ["firma.example"], now: new Date() },
			),
		);
	const rowOf = (orgId: string) =>
		inOrg(orgId, async (tx) => {
			const [row] = await tx
				.select()
				.from(identitySources)
				.where(eq(identitySources.organizationId, orgId));
			return row;
		});

	it("verbinden: Token nur verschlüsselt, Hinweis mit vier Zeichen, nie im Audit", async () => {
		const r = await connect(org.a, domain, TOKEN);
		expect(r.result).toBe("active");
		expect(JSON.stringify(r.audit)).not.toContain(TOKEN);
		const row = await rowOf(org.a);
		expect(row).toMatchObject({
			provider: "okta",
			status: "active",
			tenantKey: domain,
			settings: { tokenHint: "1234" },
			domains: ["firma.example"],
		});
		expect(row?.secretEnc).toBeTruthy();
		expect(row?.secretEnc).not.toContain(TOKEN);
		expect(JSON.stringify(row?.settings)).not.toContain(TOKEN);
		const back = await inOrg(org.a, (tx) =>
			oktaTokenOf(tx, org.a, row as NonNullable<typeof row>),
		);
		expect(back).toBe(TOKEN);
	});

	it("die verschlüsselte Spalte hängt an der Zeile (anderer Kontext = kein Klartext)", async () => {
		const row = await rowOf(org.a);
		const moved = {
			...(row as NonNullable<typeof row>),
			id: crypto.randomUUID(),
		};
		await expect(
			inOrg(org.a, (tx) => oktaTokenOf(tx, org.a, moved)),
		).rejects.toThrow();
	});

	it("dieselbe Okta-Adresse gehört keiner zweiten Org", async () => {
		const r = await connect(org.b, domain, TOKEN);
		expect(r.result).toBe("taken");
		expect(await rowOf(org.b)).toBeUndefined();
	});

	it("andere Okta-Adresse an derselben Org erst nach dem Trennen", async () => {
		const r = await connect(org.a, `x${domain}`, TOKEN);
		expect(r.result).toBe("other_org");
		expect((await rowOf(org.a))?.tenantKey).toBe(domain);
	});

	it("Token erneuern: neue Verschlüsselung, neuer Hinweis", async () => {
		const before = (await rowOf(org.a))?.secretEnc;
		const neu = "00okta-new-token-zyxwvutsrqponmlkjihg9876";
		const r = await connect(org.a, domain, neu);
		expect(r.result).toBe("active");
		expect(r.audit[0]?.after).toMatchObject({ tokenReplaced: true });
		const row = await rowOf(org.a);
		expect(row?.secretEnc).not.toBe(before);
		expect(row?.settings).toEqual({ tokenHint: "9876" });
		expect(
			await inOrg(org.a, (tx) =>
				oktaTokenOf(tx, org.a, row as NonNullable<typeof row>),
			),
		).toBe(neu);
	});
});
