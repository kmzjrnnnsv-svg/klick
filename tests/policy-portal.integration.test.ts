import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	documents,
	documentVersions,
	orgSettings,
	policyPortals,
	policyReaders,
} from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { env } from "@/lib/env";
import { codeHash } from "@/lib/policy-portal/rules";
import {
	acknowledgeAsReader,
	type PublicPortal,
	publicPortal,
	readerPolicies,
	redeemPortalCode,
	requestPortalCode,
	resolvePortalReader,
	signOutReader,
} from "@/lib/policy-portal/service";

// Integrationstest (DATABASE_URL_TEST): Richtlinien-Portal (M2). Code nur an
// bestätigte Domains; falscher Code zählt, nach fünf ist Schluss; der Token
// gilt nur für diese Org; Leser:innen sehen nur Verteiler „alle“/
// „Mitarbeitende“ und offene Einstufung; Kenntnisnahme einmal; Abmelden und
// entfernte Domain beenden den Zugang.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Richtlinien-Portal (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const slug = `portal-test-${stamp}`;
	const domain = "firma.example";
	let orgId = "";
	let portal: PublicPortal;
	const versions: Record<string, string> = {};

	const inOrg = <T>(
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	const doc = (
		nr: string,
		distribution: string[],
		classification: "internal" | "confidential" = "internal",
	) =>
		inOrg(async (tx) => {
			const [row] = await tx
				.insert(documents)
				.values({
					organizationId: orgId,
					docNumber: nr,
					title: `Richtlinie ${nr}`,
					classification,
					distribution,
					status: "published",
					version: "1.0",
				})
				.returning({ id: documents.id });
			const [v] = await tx
				.insert(documentVersions)
				.values({
					organizationId: orgId,
					documentId: row?.id as string,
					version: "1.0",
					bodyMarkdown: `# ${nr}`,
					changeSummary: "Erste Fassung",
					approvedAt: new Date(),
					publishedAt: new Date(),
				})
				.returning({ id: documentVersions.id });
			versions[nr] = v?.id as string;
		});

	const knownCode = (email: string, code: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({ id: policyReaders.id })
				.from(policyReaders)
				.where(eq(policyReaders.email, email));
			await tx
				.update(policyReaders)
				.set({
					codeHash: codeHash(env().BETTER_AUTH_SECRET, r?.id as string, code),
					codeExpiresAt: new Date(Date.now() + 60_000),
					codeAttempts: 0,
				})
				.where(eq(policyReaders.id, r?.id as string));
		});

	const redeem = (email: string, code: string) =>
		redeemPortalCode({ portal, email, code, ip: "127.0.0.1", userAgent: null });

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Portal GmbH', ${`portal-gmbh-${stamp}`}, now())
			returning id`;
		orgId = o?.id as string;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
			});
			await tx.insert(policyPortals).values({
				organizationId: orgId,
				slug,
				enabled: true,
				orgName: "Portal GmbH",
				domains: [
					{
						domain,
						token: "t",
						verifiedAt: new Date().toISOString(),
						via: "dns",
					},
					{ domain: "offen.example", token: "u", verifiedAt: null, via: null },
				],
			});
		});
		await doc("RL-ALL", ["all"]);
		await doc("RL-MA", ["employee"]);
		await doc("RL-ISB", ["function:isb"]);
		await doc("RL-VERTR", ["all"], "confidential");
		const p = await publicPortal(slug);
		if (!p) throw new Error("portal not public");
		portal = p;
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		await client.end();
	});

	it("Code nur an bestätigte Domains", async () => {
		await requestPortalCode({
			portal,
			email: "a@offen.example",
			baseUrl: "http://localhost",
			userAgent: null,
		});
		await requestPortalCode({
			portal,
			email: "Mara@Firma.example",
			baseUrl: "http://localhost",
			userAgent: null,
		});
		const readers = await inOrg((tx) =>
			tx
				.select({
					email: policyReaders.email,
					codeHash: policyReaders.codeHash,
				})
				.from(policyReaders),
		);
		expect(readers.map((r) => r.email)).toEqual(["mara@firma.example"]);
		expect(readers[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("falscher Code zählt, nach fünf Versuchen gesperrt", async () => {
		await knownCode("mara@firma.example", "111111");
		for (let i = 0; i < 5; i++)
			expect(await redeem("mara@firma.example", "222222")).toEqual({
				ok: false,
				error: "invalid",
			});
		expect(await redeem("mara@firma.example", "111111")).toEqual({
			ok: false,
			error: "locked",
		});
	});

	it("richtiger Code → Zugang; Leser:in sieht nur offene Richtlinien für alle/Mitarbeitende", async () => {
		await knownCode("mara@firma.example", "123456");
		const res = await redeem("mara@firma.example", "123456");
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		// derselbe Code gilt nur einmal
		expect((await redeem("mara@firma.example", "123456")).ok).toBe(false);
		const reader = await resolvePortalReader(portal, res.token);
		expect(reader?.email).toBe("mara@firma.example");
		if (!reader) return;
		const list = await readerPolicies(portal, reader);
		expect(list.map((p) => p.docNumber)).toEqual(["RL-ALL", "RL-MA"]);

		// Kenntnisnahme einmal, nicht für fremden Verteiler
		const ack = (versionId: string) =>
			acknowledgeAsReader({ portal, reader, versionId, userAgent: null });
		expect(await ack(versions["RL-MA"] as string)).toBe(true);
		expect(await ack(versions["RL-MA"] as string)).toBe(true);
		expect(await ack(versions["RL-ISB"] as string)).toBe(false);
		const after = await readerPolicies(portal, reader);
		expect(
			after.find((p) => p.docNumber === "RL-MA")?.acknowledgedAt,
		).not.toBeNull();
		expect(
			after.find((p) => p.docNumber === "RL-ALL")?.acknowledgedAt,
		).toBeNull();

		// fremde Org bzw. anderes Portal: Token passt nicht
		expect(
			await resolvePortalReader(
				{ ...portal, organizationId: crypto.randomUUID() },
				res.token,
			),
		).toBeNull();
		// Domain entfernt → Zugang endet
		expect(
			await resolvePortalReader({ ...portal, domains: [] }, res.token),
		).toBeNull();
		// Abmelden widerruft den Token
		await signOutReader(portal, reader);
		expect(await resolvePortalReader(portal, res.token)).toBeNull();
	});

	it("ausgeschaltetes Portal ist ohne Org-Kontext unsichtbar", async () => {
		await inOrg((tx) =>
			tx
				.update(policyPortals)
				.set({ enabled: false })
				.where(eq(policyPortals.slug, slug)),
		);
		expect(await publicPortal(slug)).toBeNull();
	});
});
