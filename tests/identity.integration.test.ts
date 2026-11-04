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
	identityExceptions,
	identitySources,
	nonconformities,
	orgSettings,
} from "@/db/schema";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import {
	addIdentityException,
	revokeIdentityException,
	setIdentityAccountLeft,
	setIdentityAccountMatch,
	writeIdentityPolicy,
} from "@/lib/identity/manage";
import { identityPolicyOf } from "@/lib/identity/policy";
import { addMonthsIso } from "@/lib/identity/rules";
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

	// ── I1b: Ausnahmen, ausgeschieden, Zuordnung, Schwellen ─────────────
	const accountId = async (ext: string) => {
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select({ id: identityAccounts.id })
				.from(identityAccounts)
				.where(
					and(
						eq(identityAccounts.organizationId, org.a),
						eq(identityAccounts.externalId, ext),
					),
				),
		);
		return row?.id as string;
	};
	const checkResult = async (key: string) => {
		const [row] = await inOrg(org.a, (tx) =>
			tx
				.select({
					result: identityCheckResults.result,
					affected: identityCheckResults.affected,
				})
				.from(identityCheckResults)
				.where(
					and(
						eq(identityCheckResults.organizationId, org.a),
						eq(identityCheckResults.checkKey, key as "mfa"),
					),
				),
		);
		return row;
	};
	// Abruf frisch zu einem Zeitpunkt (sonst „nicht bewertbar“)
	const freshAt = (at: Date) =>
		inOrg(org.a, (tx) =>
			tx
				.update(identitySources)
				.set({ lastSyncAt: at })
				.where(eq(identitySources.organizationId, org.a)),
		);
	const later = new Date(Date.now() + 70 * 86_400_000);
	const day = (d: Date) => d.toISOString().slice(0, 10);
	const ctxA = () => ({ orgId: org.a, userId: owner });

	it("Ausnahme nimmt das Admin-Konto ohne MFA aus der Prüfung", async () => {
		await freshAt(later);
		const anna = await accountId("anna");
		const r = await inOrg(org.a, (tx) =>
			addIdentityException(tx, ctxA(), {
				accountId: anna,
				kind: "emergency",
				reason: "Notfallkonto, liegt im Tresor",
				expiresAt: addMonthsIso(day(later), 3) as string,
				now: later,
			}),
		);
		expect(r.ok).toBe(true);
		expect((await checkResult("mfa"))?.result).toBe("pass");
		expect((await checkResult("privileged"))?.result).toBe("pass");
	});

	it("keine Ausnahme für das eigene Konto, Admins höchstens 6 Monate", async () => {
		const olga = await accountId("olga");
		const own = await inOrg(org.a, (tx) =>
			addIdentityException(tx, ctxA(), {
				accountId: olga,
				kind: "other",
				reason: "Ich nehme mich selbst aus",
				expiresAt: addMonthsIso(day(later), 1) as string,
				now: later,
			}),
		);
		expect(own).toEqual({ ok: false, error: "identity_own_account" });
		const anna = await accountId("anna");
		const long = await inOrg(org.a, (tx) =>
			addIdentityException(tx, ctxA(), {
				accountId: anna,
				kind: "service",
				reason: "Dienstkonto für die Datensicherung",
				expiresAt: addMonthsIso(day(later), 9) as string,
				now: later,
			}),
		);
		expect(long).toEqual({ ok: false, error: "identity_expiry_too_long" });
	});

	it("Ausnahme zurückgenommen: MFA schlägt wieder an", async () => {
		const [exc] = await inOrg(org.a, (tx) =>
			tx
				.select({ id: identityExceptions.id })
				.from(identityExceptions)
				.where(eq(identityExceptions.organizationId, org.a)),
		);
		const r = await inOrg(org.a, (tx) =>
			revokeIdentityException(tx, ctxA(), {
				exceptionId: exc?.id as string,
				now: later,
			}),
		);
		expect(r.ok).toBe(true);
		expect((await checkResult("mfa"))?.result).toBe("fail");
	});

	it("ausgeschieden markiert: nach der Frist schlägt „Austritte“ an", async () => {
		const bob = await accountId("bob");
		await inOrg(org.a, (tx) =>
			setIdentityAccountLeft(tx, ctxA(), {
				accountId: bob,
				left: true,
				now: later,
			}),
		);
		const after = new Date(later.getTime() + 5 * 86_400_000);
		await freshAt(after);
		await inOrg(org.a, (tx) =>
			evaluateIdentityChecks(tx, { orgId: org.a }, after),
		);
		const leavers = await checkResult("leavers");
		expect(leavers?.result).toBe("fail");
		expect(leavers?.affected).toContain(bob);
		await inOrg(org.a, (tx) =>
			setIdentityAccountLeft(tx, ctxA(), {
				accountId: bob,
				left: false,
				now: after,
			}),
		);
		expect((await checkResult("leavers"))?.result).not.toBe("fail");
	});

	it("Zuordnung von Hand: niemand bleibt, automatisch findet die Person wieder", async () => {
		const olga = await accountId("olga");
		const read = () =>
			inOrg(org.a, async (tx) => {
				const [row] = await tx
					.select({
						user: identityAccounts.matchedUserId,
						mode: identityAccounts.matchMode,
					})
					.from(identityAccounts)
					.where(eq(identityAccounts.id, olga));
				return row;
			});
		await inOrg(org.a, (tx) =>
			setIdentityAccountMatch(tx, ctxA(), {
				accountId: olga,
				match: "none",
				now: later,
			}),
		);
		expect(await read()).toEqual({ user: null, mode: "manual" });
		const stranger = await inOrg(org.a, (tx) =>
			setIdentityAccountMatch(tx, ctxA(), {
				accountId: olga,
				match: "00000000-0000-4000-8000-000000000000",
				now: later,
			}),
		);
		expect(stranger).toEqual({ ok: false, error: "identity_not_member" });
		await inOrg(org.a, (tx) =>
			setIdentityAccountMatch(tx, ctxA(), {
				accountId: olga,
				match: "auto",
				now: later,
			}),
		);
		expect(await read()).toEqual({ user: owner, mode: "auto" });
	});

	it("Schwellen speichern und lesen (ohne die feste Grenze)", async () => {
		const next = { ...identityPolicyOf({}), maxTopAdmins: 2 };
		await inOrg(org.a, (tx) =>
			writeIdentityPolicy(
				tx,
				{ orgId: org.a },
				{
					before: {},
					next,
					now: later,
				},
			),
		);
		const stored = await inOrg(org.a, async (tx) => {
			const [row] = await tx
				.select({ p: orgSettings.identityPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, org.a));
			return row?.p;
		});
		expect(stored).not.toHaveProperty("staleHours");
		expect(identityPolicyOf(stored).maxTopAdmins).toBe(2);
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
