import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as helloRoute } from "@/app/api/ingest/wallet/hello/route";
import { schema } from "@/db";
import { orgSettings, securityChanges } from "@/db/schema";
import type { OrgContext } from "@/lib/auth/guards";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { mutateOrg } from "@/lib/db/with-org";
import {
	EMPTY_NETWORK_POLICY,
	type NetworkPolicy,
} from "@/lib/net/network-policy";
import { orgNetworkAllows, orgNetworkPolicy } from "@/lib/net/org-network";
import {
	decideSecurityChange,
	requestApplyChange,
} from "@/lib/security-changes/service";
import { CONTRACT, CONTRACT_VERSION } from "@/lib/wallet-link/contract";
import { createWalletLink } from "@/lib/wallet-link-ingest/service";

// Integrationstest (DATABASE_URL_TEST): IP-Liste je Org (Härtung A5). Die
// Liste wirkt erst über Vier-Augen und dann sofort (Zwischenspeicher
// verworfen); Token aus fremden Netzen = 403 network_denied, Ausnahme je
// Fläche; eine andere Org bleibt unberührt.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("IP-Liste je Organisation (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	const u = { o1: "", o2: "" };
	let token = "";

	const ctx = (userId: string, orgId: string) =>
		({
			userId,
			orgId,
			orgRole: "owner",
			ip: "203.0.113.9",
			userAgent: null,
		}) as OrgContext;
	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const stored = (orgId: string) =>
		inOrg(orgId, async (tx) => {
			const [r] = await tx
				.select({ v: orgSettings.networkPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId));
			return (r?.v ?? {}) as Record<string, unknown>;
		});
	// Antrag von o1, Zustimmung von o2: danach wirkt die Liste
	const change = async (next: NetworkPolicy) => {
		expect(
			await requestApplyChange(ctx(u.o1, orgA), {
				kind: "network_policy",
				targetKey: null,
				summary: "IP-Liste",
				payload: { value: next },
				before: await stored(orgA),
			}),
		).toEqual({ ok: false, error: "four_eyes_requested" });
		const rows = await inOrg(orgA, (tx) =>
			tx
				.select()
				.from(securityChanges)
				.where(eq(securityChanges.organizationId, orgA)),
		);
		const open = rows.find((r) => r.status === "pending");
		expect(
			(
				await decideSecurityChange(ctx(u.o2, orgA), {
					id: open?.id ?? "",
					approve: true,
					note: null,
				})
			).ok,
		).toBe(true);
	};
	const hello = (ip: string) =>
		helloRoute(
			new Request("http://localhost/api/ingest/wallet/hello", {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
					"x-real-ip": ip,
				},
				body: JSON.stringify({
					contract: CONTRACT,
					v: CONTRACT_VERSION,
					walletOrgId: "6f1f1d34-6b7e-4d5c-9a51-0c1d2e3f4a5b",
					walletOrgName: "Raza Wallet",
					linkId: "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b",
					sentAt: new Date().toISOString(),
				}),
			}),
		);

	const office: NetworkPolicy = {
		...EMPTY_NETWORK_POLICY,
		members: [{ cidr: "203.0.113.0/24", note: "Büro" }],
	};

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		for (const key of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${key}, ${`net-${key}-${stamp}@example.org`}, true, now(), now())
				returning id`;
			u[key] = row?.id;
		}
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Netz ${name}`}, ${`net-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		// Entscheider:innen zählen erst nach 24 h (eligibleDeciders)
		await client`insert into member (organization_id, user_id, role, created_at) values
			(${orgA}, ${u.o1}, 'owner', now() - interval '2 days'),
			(${orgA}, ${u.o2}, 'owner', now() - interval '2 days'),
			(${orgB}, ${u.o1}, 'owner', now() - interval '2 days')`;
		const created = await mutateOrg(
			{ orgId: orgA, userId: u.o1 },
			async (tx) => {
				const r = await createWalletLink(
					tx,
					{ orgId: orgA, userId: u.o1 },
					{ name: "both.money" },
				);
				return { result: r, audit: r.audit };
			},
		);
		token = created.token;
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${orgA}, ${orgB})`;
		});
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end({ timeout: 5 });
	});

	it("aus: Token aus jedem Netz", async () => {
		// Zwischenspeicher mit „aus“ füllen; die Wirkung muss ihn verwerfen
		expect((await orgNetworkPolicy(orgA)).members).toEqual([]);
		expect((await hello("198.51.100.7")).status).not.toBe(403);
	});

	it("wirkt erst mit der zweiten Person, dann sofort", async () => {
		await change(office);
		expect((await orgNetworkPolicy(orgA)).members).toEqual(office.members);
		expect(await orgNetworkAllows(orgA, "app", "203.0.113.50")).toBe(true);
		expect(await orgNetworkAllows(orgA, "app", "198.51.100.7")).toBe(false);
		// fremde Org bleibt offen
		expect(await orgNetworkAllows(orgB, "app", "198.51.100.7")).toBe(true);
	});

	it("Token aus fremdem Netz = 403, aus dem Büro durch", async () => {
		const denied = await hello("198.51.100.7");
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ error: "network_denied" });
		// ohne bekannte Adresse: fail closed
		expect((await hello("")).status).toBe(403);
		expect((await hello("203.0.113.50")).status).not.toBe(403);
	});

	it("Ausnahme je Fläche: both.money offen, Ingest bleibt zu", async () => {
		await change({
			...office,
			exceptions: { ...office.exceptions, wallet: true },
		});
		expect((await hello("198.51.100.7")).status).not.toBe(403);
		expect(await orgNetworkAllows(orgA, "ingest", "198.51.100.7")).toBe(false);
		expect(await orgNetworkAllows(orgA, "app", "198.51.100.7")).toBe(false);
	});
});
