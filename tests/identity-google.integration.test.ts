import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import { identityAccounts, identitySources, orgSettings } from "@/db/schema";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import type { GoogleGet } from "@/lib/google/client";
import { fetchGoogleSnapshot } from "@/lib/identity/providers/google";
import {
	applySnapshot,
	connectGoogleSource,
	evaluateIdentityChecks,
	ownerEmailsOf,
	syncContext,
} from "@/lib/identity/service";

// Integrationstest (DATABASE_URL_TEST): Google Workspace (Teil D I3). Eine
// Kundin gehört nur einer Org, eine zweite Kundin an derselben Org erst nach
// dem Trennen, der Abruf schreibt Konten wie bei Entra; die Admin-Adresse
// steht nicht im Audit.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const IAM = ["CC-IAM-02", "CC-IAM-03", "CC-IAM-04", "CC-IAM-05"];

d("Google Workspace (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const customer = `C${stamp.toString(36)}`;
	const org = { a: "", b: "" };
	let owner = "";
	const ownerEmail = `olga-${stamp}@firma.example`;

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
				values (${`G ${key}`}, ${`g-${key}-${stamp}`}, now()) returning id`;
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

	const connect = (orgId: string, customerId: string, adminEmail: string) =>
		inOrg(orgId, (tx) =>
			connectGoogleSource(
				tx,
				{ orgId, userId: owner },
				{
					customerId,
					adminEmail,
					domains: ["firma.example"],
					now: new Date(),
				},
			),
		);

	it("Inhaber:innen-Adressen für die Bindung", async () => {
		expect(await inOrg(org.a, (tx) => ownerEmailsOf(tx, org.a))).toEqual([
			ownerEmail,
		]);
	});

	it("verbinden: aktiv, Kundennummer als Schlüssel, Admin-Adresse nicht im Audit", async () => {
		const r = await connect(org.a, customer, "it@firma.example");
		expect(r.result).toBe("active");
		expect(JSON.stringify(r.audit)).not.toContain("it@firma.example");
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select()
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a)),
		);
		expect(row).toMatchObject({
			provider: "google",
			status: "active",
			tenantKey: customer,
			settings: { adminEmail: "it@firma.example" },
			domains: ["firma.example"],
		});
		expect(row?.connectedAt).not.toBeNull();
	});

	it("dieselbe Kundin gehört keiner zweiten Org (auch in anderer Schreibweise)", async () => {
		const r = await connect(org.b, customer.toUpperCase(), "it@firma.example");
		expect(r.result).toBe("taken");
		const rows = await inOrg(org.b, (tx) =>
			tx
				.select({ id: identitySources.id })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.b)),
		);
		expect(rows).toEqual([]);
	});

	it("andere Kundin an derselben Org erst nach dem Trennen", async () => {
		const r = await connect(org.a, `${customer}x`, "it@zweit.example");
		expect(r.result).toBe("other_customer");
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select({ tenantKey: identitySources.tenantKey })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a)),
		);
		expect(row?.tenantKey).toBe(customer);
	});

	it("neue Admin-Adresse bei derselben Kundin", async () => {
		const r = await connect(org.a, customer, "neu@firma.example");
		expect(r.result).toBe("active");
		expect(r.audit[0]?.after).toMatchObject({ adminChanged: true });
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select({ settings: identitySources.settings })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a)),
		);
		expect(row?.settings).toEqual({ adminEmail: "neu@firma.example" });
	});

	it("Abruf aus der Directory API schreibt Konten und Prüfungen", async () => {
		const get: GoogleGet = async (_s, path) => {
			const body = path.startsWith("/admin/directory/v1/customers/")
				? { id: customer }
				: path.startsWith("/admin/directory/v1/customer/my_customer/domains")
					? { domains: [{ domainName: "firma.example", verified: true }] }
					: path.startsWith("/admin/directory/v1/users?")
						? {
								users: [
									{
										id: "g1",
										primaryEmail: ownerEmail,
										isAdmin: true,
										isEnrolledIn2Sv: true,
										lastLoginTime: "2026-11-01T08:00:00.000Z",
									},
									{
										id: "g2",
										primaryEmail: "bob@firma.example",
										isEnrolledIn2Sv: false,
										lastLoginTime: "1970-01-01T00:00:00.000Z",
										creationTime: "2025-01-01T00:00:00.000Z",
									},
								],
							}
						: null;
			return body
				? { ok: true, value: { status: 200, body: JSON.stringify(body) } }
				: { ok: true, value: { status: 404, body: "{}" } };
		};
		const snap = await fetchGoogleSnapshot(get, "neu@firma.example", customer);
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;
		await inOrg(org.a, async (tx) => {
			const [src] = await tx
				.select({ id: identitySources.id })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a));
			const ctx = await syncContext(tx, org.a, src?.id as string);
			if (!ctx) throw new Error("keine Quelle");
			const now = new Date();
			await applySnapshot(
				tx,
				{ orgId: org.a },
				{
					source: ctx.source,
					members: ctx.members,
					snapshot: snap.value,
					now,
				},
			);
			await evaluateIdentityChecks(tx, { orgId: org.a }, now);
		});
		const accounts = await inOrg(org.a, (tx) =>
			tx
				.select({
					externalId: identityAccounts.externalId,
					userId: identityAccounts.matchedUserId,
					isTopAdmin: identityAccounts.isTopAdmin,
					mfaRegistered: identityAccounts.mfaRegistered,
					lastSignInAt: identityAccounts.lastSignInAt,
				})
				.from(identityAccounts)
				.where(eq(identityAccounts.organizationId, org.a))
				.orderBy(identityAccounts.externalId),
		);
		expect(accounts).toEqual([
			{
				externalId: "g1",
				userId: owner,
				isTopAdmin: true,
				mfaRegistered: true,
				lastSignInAt: new Date("2026-11-01T08:00:00.000Z"),
			},
			{
				externalId: "g2",
				userId: null,
				isTopAdmin: false,
				mfaRegistered: false,
				lastSignInAt: null,
			},
		]);
		// die andere Org sieht nichts davon
		const other = await inOrg(org.b, (tx) =>
			tx.select({ id: identityAccounts.id }).from(identityAccounts),
		);
		expect(other).toEqual([]);
	});
});
