import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	controlImplementations,
	controls,
	controlTests,
	identityAccounts,
	identityCheckResults,
	identitySources,
	nonconformities,
	orgSettings,
} from "@/db/schema";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import {
	applySnapshot,
	completeEntraConsent,
	evaluateIdentityChecks,
	prepareEntraConsent,
	syncContext,
} from "@/lib/identity/service";
import type { ProviderAccount, ProviderSnapshot } from "@/lib/identity/types";

// Integrationstest (DATABASE_URL_TEST): Identität (Teil D). Freigabe nur mit
// Bindung, ein Tenant gehört nur einer Org, Abruf schreibt Konten und
// Zuordnung, Prüfungen schreiben Ergebnis und Test im Testprogramm, aber in
// der Einrichtungsfrist keine Abweichung. Fremde Orgs sehen nichts.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const TENANT = "5f0c2b8e-1d3a-4c5b-9e7f-0a1b2c3d4e5f";
const IAM = ["CC-IAM-02", "CC-IAM-03", "CC-IAM-04", "CC-IAM-05"];

const account = (
	id: string,
	over: Partial<ProviderAccount> = {},
): ProviderAccount => ({
	externalId: id,
	email: `${id}@contoso.example`,
	displayName: id,
	kind: "member",
	enabled: true,
	isAdmin: false,
	isTopAdmin: false,
	adminRoles: [],
	mfaRegistered: true,
	lastSignInAt: "2026-11-01T08:00:00.000Z",
	createdAt: "2025-01-01T00:00:00.000Z",
	leaveAt: null,
	...over,
});

d("Identität (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org = { a: "", b: "" };
	let owner = "";
	const ownerEmail = `owner-${stamp}@contoso.example`;

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
				values (${`Id ${key}`}, ${`id-${key}-${stamp}`}, now()) returning id`;
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

	const consent = (orgId: string, bound: boolean, nonce: string) =>
		inOrg(orgId, async (tx) => {
			const now = new Date();
			await prepareEntraConsent(
				tx,
				{ orgId, userId: owner },
				{ tenant: "contoso.example", nonce, now },
			);
			return completeEntraConsent(tx, {
				orgId,
				nonce,
				tenantId: TENANT,
				granted: true,
				bound,
				error: null,
				now,
			});
		});

	it("Freigabe wirkt nur mit Bindung", async () => {
		expect((await consent(org.a, false, "n-a1")).result).toBe("unbound");
		const r = await consent(org.a, true, "n-a2");
		expect(r.result).toBe("active");
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select()
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a)),
		);
		expect(row).toMatchObject({
			status: "active",
			tenantKey: TENANT,
			consentNonceHash: null,
		});
	});

	it("derselbe Tenant gehört keiner zweiten Org", async () => {
		const r = await consent(org.b, true, "n-b1");
		expect(r.result).toBe("taken");
		const rows = await inOrg(org.b, (tx) =>
			tx
				.select({ status: identitySources.status })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.b)),
		);
		expect(rows).toEqual([{ status: "pending_consent" }]);
	});

	it("Abruf schreibt Konten, ordnet zu und schreibt Prüfungen mit Tests", async () => {
		const now = new Date();
		const snapshot: ProviderSnapshot = {
			domains: ["contoso.example"],
			capabilities: { signIn: true, mfa: true, roles: true, leaveDate: false },
			accounts: [
				account("anna", {
					isAdmin: true,
					adminRoles: ["User Administrator"],
					mfaRegistered: false,
				}),
				account("bob"),
				{ ...account("olga"), email: ownerEmail },
				account("gast", { kind: "guest", email: "gast@extern.example" }),
			],
		};
		await inOrg(org.a, async (tx) => {
			const ctx = await syncContext(
				tx,
				org.a,
				(
					await tx
						.select({ id: identitySources.id })
						.from(identitySources)
						.where(eq(identitySources.organizationId, org.a))
				)[0]?.id as string,
			);
			if (!ctx) throw new Error("no source");
			await applySnapshot(
				tx,
				{ orgId: org.a },
				{
					source: ctx.source,
					members: ctx.members,
					snapshot,
					now,
				},
			);
			await evaluateIdentityChecks(tx, { orgId: org.a }, now);
		});
		const accounts = await inOrg(org.a, (tx) =>
			tx
				.select({
					externalId: identityAccounts.externalId,
					matchedUserId: identityAccounts.matchedUserId,
				})
				.from(identityAccounts)
				.where(eq(identityAccounts.organizationId, org.a)),
		);
		expect(accounts).toHaveLength(4);
		expect(accounts.find((a) => a.externalId === "olga")?.matchedUserId).toBe(
			owner,
		);
		expect(
			accounts.find((a) => a.externalId === "gast")?.matchedUserId,
		).toBeNull();

		const results = await inOrg(org.a, (tx) =>
			tx
				.select({
					key: identityCheckResults.checkKey,
					result: identityCheckResults.result,
					lastTestId: identityCheckResults.lastTestId,
				})
				.from(identityCheckResults)
				.where(eq(identityCheckResults.organizationId, org.a)),
		);
		const byKey = new Map(results.map((r) => [r.key, r]));
		// Admin ohne MFA: fail; nie geprüft: fail
		expect(byKey.get("mfa")?.result).toBe("fail");
		expect(byKey.get("recert")?.result).toBe("fail");
		expect(byKey.get("mfa")?.lastTestId).not.toBeNull();

		const tests = await inOrg(org.a, (tx) =>
			tx
				.select({ code: controls.code, result: controlTests.result })
				.from(controlTests)
				.innerJoin(
					controlImplementations,
					eq(controlImplementations.id, controlTests.implementationId),
				)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlTests.organizationId, org.a),
						eq(controlTests.method, "automated"),
					),
				),
		);
		expect(tests.map((t) => t.code).sort()).toEqual([...IAM].sort());
		// Einrichtungsfrist: noch keine Abweichung trotz fail
		const ncs = await inOrg(org.a, (tx) =>
			tx
				.select({ id: nonconformities.id })
				.from(nonconformities)
				.where(eq(nonconformities.organizationId, org.a)),
		);
		expect(ncs).toEqual([]);
	});

	it("gleiches Ergebnis am nächsten Tag: kein zweiter Test", async () => {
		const next = new Date(Date.now() + 86_400_000);
		await inOrg(org.a, (tx) =>
			evaluateIdentityChecks(tx, { orgId: org.a }, next),
		);
		const [{ n } = { n: 0 }] = await inOrg(org.a, (tx) =>
			tx
				.select({ n: sql<number>`count(*)::int` })
				.from(controlTests)
				.where(
					and(
						eq(controlTests.organizationId, org.a),
						eq(controlTests.method, "automated"),
					),
				),
		);
		expect(n).toBe(4);
	});

	it("nach der Einrichtungsfrist entsteht bei fail eine Abweichung, nur einmal", async () => {
		await inOrg(org.a, (tx) =>
			tx
				.update(identitySources)
				.set({ connectedAt: new Date(Date.now() - 10 * 86_400_000) })
				.where(eq(identitySources.organizationId, org.a)),
		);
		const month = new Date(Date.now() + 31 * 86_400_000);
		// Stand gilt als frisch genug: Abruf neu datieren
		await inOrg(org.a, (tx) =>
			tx
				.update(identitySources)
				.set({ lastSyncAt: month })
				.where(eq(identitySources.organizationId, org.a)),
		);
		await inOrg(org.a, (tx) =>
			evaluateIdentityChecks(tx, { orgId: org.a }, month),
		);
		const after = new Date(month.getTime() + 31 * 86_400_000);
		await inOrg(org.a, (tx) =>
			tx
				.update(identitySources)
				.set({ lastSyncAt: after })
				.where(eq(identitySources.organizationId, org.a)),
		);
		await inOrg(org.a, (tx) =>
			evaluateIdentityChecks(tx, { orgId: org.a }, after),
		);
		const ncs = await inOrg(org.a, (tx) =>
			tx
				.select({ title: nonconformities.title })
				.from(nonconformities)
				.where(eq(nonconformities.organizationId, org.a)),
		);
		const titles = ncs.map((n) => n.title).sort();
		// je fail-Prüfung genau eine (mfa, recert), beim zweiten Lauf keine neue
		expect(titles.filter((t) => t.startsWith("CC-IAM-03"))).toHaveLength(1);
		expect(titles.filter((t) => t.startsWith("CC-IAM-05"))).toHaveLength(1);
	});

	it("eine andere Org sieht weder Quelle noch Konten", async () => {
		const accounts = await inOrg(org.b, (tx) =>
			tx
				.select({ id: identityAccounts.id })
				.from(identityAccounts)
				.where(eq(identityAccounts.organizationId, org.a)),
		);
		expect(accounts).toEqual([]);
		const sources = await inOrg(org.b, (tx) =>
			tx
				.select({ id: identitySources.id })
				.from(identitySources)
				.where(eq(identitySources.organizationId, org.a)),
		);
		expect(sources).toEqual([]);
	});
});
