import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	accessTokens,
	auditLog,
	notifications,
	siteTunnels,
} from "@/db/schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import {
	createSiteTunnel,
	issueSiteLinkAsPlatform,
	planSiteTunnel,
	removeSiteTunnel,
} from "@/lib/db/site-tunnels";
import { resetEnvCache } from "@/lib/env";
import { runSiteTunnels } from "@/lib/jobs/site-tunnels";
import {
	resolveSiteLink,
	revealSiteSecret,
	siteTunnelsForOrg,
} from "@/lib/site-tunnels/service";
import { NetzAgent } from "@/netz-agent/agent";
import { COMMANDS } from "@/netz-agent/protocol";
import { dryRunner } from "@/netz-agent/runner";

// Integrationstest (DATABASE_URL_TEST): Standort-Tunnel (ADR-033) von der
// Anlage durch den Betrieb über den Job bis zum Agenten (echter NetzAgent im
// Trockenlauf). Überschneidende Netze bekommen ein Übergabenetz, eine
// Gegenstelle gehört nur einem Tunnel, Geheimnisse liegen verschlüsselt, Org B
// sieht A's Tunnel nicht (RLS), der Link zeigt das Geheimnis nur mit Eintrag
// in der Kette, Abbau sperrt Links und baut beim Agenten ab.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;
const SERVER_KEY = Buffer.alloc(32, 5).toString("base64");

d("Standort-Tunnel (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org = { A: "", B: "" };
	const u = { admin: "", ownerA: "", ownerB: "" };
	const env = process.env;
	const saved = {
		s: env.SITE_AGENT_SOCKET,
		ip: env.SITE_PUBLIC_IP,
		k: env.SITE_WG_PUBLIC_KEY,
	};
	const server = { publicIp: "88.99.1.2", wgPublicKey: SERVER_KEY };
	const run = dryRunner({
		"wg genkey": { stdout: `${SERVER_KEY}\n` },
		"wg pubkey": { stdout: `${SERVER_KEY}\n` },
	});
	const agent = new NetzAgent({
		dir: mkdtempSync(join(tmpdir(), "klick-netz-int-")),
		swanctlDir: mkdtempSync(join(tmpdir(), "klick-swanctl-int-")),
		serverIp: server.publicIp,
		run,
	});
	// App ↔ Agent ohne Socket: dieselben Befehle wie über app.sock
	const call = (async (_socket: string, cmd: string, args?: unknown) => {
		const fn = COMMANDS[cmd];
		if (!fn) throw new Error(cmd);
		return JSON.parse(JSON.stringify(await fn(agent, args)));
	}) as Parameters<typeof runSiteTunnels>[1];
	const tunnel = { A: "", B: "" };

	beforeAll(async () => {
		env.SITE_AGENT_SOCKET = "/run/klick-netz/app.sock";
		env.SITE_PUBLIC_IP = server.publicIp;
		env.SITE_WG_PUBLIC_KEY = SERVER_KEY;
		resetEnvCache();
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		await agent.start();
		for (const k of Object.keys(u) as (keyof typeof u)[]) {
			const [r] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${k}, ${`site-${k}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			u[k] = r?.id as string;
		}
		for (const k of ["A", "B"] as const) {
			const wrapped = await wrapDek(await generateDek());
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Standort ${k}`}, ${`site-${k.toLowerCase()}-${stamp}`}, now())
				returning id`;
			org[k] = o?.id as string;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org[k]}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org[k]}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
		}
		await client`insert into member (id, organization_id, user_id, role, created_at) values
			(gen_random_uuid(), ${org.A}, ${u.ownerA}, 'owner', now()),
			(gen_random_uuid(), ${org.B}, ${u.ownerB}, 'owner', now())`;
	});

	afterAll(async () => {
		env.SITE_AGENT_SOCKET = saved.s;
		env.SITE_PUBLIC_IP = saved.ip;
		env.SITE_WG_PUBLIC_KEY = saved.k;
		resetEnvCache();
		setKmsForTests(null);
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		for (const id of Object.values(u))
			if (id) await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	const actor = () => ({ userId: u.admin, ip: null, userAgent: null });

	it("legt IPsec für A an: Geheimnis verschlüsselt, Kette und Mitteilung", async () => {
		const r = await createSiteTunnel(
			actor(),
			{
				orgId: org.A,
				name: "Büro Frankfurt",
				vendor: "sophos",
				tech: "ipsec",
				peerIp: "80.1.2.3",
				customerNets: ["192.168.10.0/24"],
			},
			server,
		);
		expect(r).toMatchObject({ ok: true, transferNet: null });
		tunnel.A = r.id as string;
		const [row] = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.A}, true)`);
			return tx.select().from(siteTunnels).where(eq(siteTunnels.id, tunnel.A));
		});
		expect(row?.secretEnc?.startsWith("enc1")).toBe(true);
		const chain = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.A}, true)`);
			return tx
				.select({ action: auditLog.action, after: auditLog.after })
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, org.A),
						eq(auditLog.action, "site_tunnel.created"),
					),
				);
		});
		expect(chain).toHaveLength(1);
		expect(JSON.stringify(chain[0]?.after)).not.toMatch(/psk|secret/i);
		const notes = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.A}, true)`);
			return tx
				.select()
				.from(notifications)
				.where(eq(notifications.userId, u.ownerA));
		});
		expect(notes.some((n) => n.title.includes("Büro Frankfurt"))).toBe(true);
	});

	it("überschneidendes Netz bei B: Übergabenetz; gleiche Gegenstelle: abgelehnt", async () => {
		const plan = await planSiteTunnel(
			{
				orgId: org.B,
				tech: "wireguard",
				peerIp: "80.4.5.6",
				customerNets: ["192.168.10.0/24"],
			},
			server,
		);
		expect(plan).toMatchObject({ ok: true, transferNet: "10.20.1.0/24" });
		expect(
			await planSiteTunnel(
				{
					orgId: org.B,
					tech: "ipsec",
					peerIp: "80.1.2.3",
					customerNets: ["192.168.20.0/24"],
				},
				server,
			),
		).toMatchObject({ ok: false, error: "peer_taken" });
		const r = await createSiteTunnel(
			actor(),
			{
				orgId: org.B,
				name: "Lager",
				vendor: "fritzbox",
				tech: "wireguard",
				peerIp: "80.4.5.6",
				customerNets: ["192.168.10.0/24"],
			},
			server,
		);
		expect(r).toMatchObject({ ok: true, transferNet: "10.20.1.0/24" });
		tunnel.B = r.id as string;
	});

	it("RLS: jede Org sieht nur ihre Tunnel", async () => {
		const a = await siteTunnelsForOrg({ orgId: org.A, userId: u.ownerA });
		const b = await siteTunnelsForOrg({ orgId: org.B, userId: u.ownerB });
		expect(a.map((t) => t.id)).toEqual([tunnel.A]);
		expect(b.map((t) => t.id)).toEqual([tunnel.B]);
		expect(a[0]?.state).toBe("pending");
	});

	it("Job: richtet beim Agenten ein, Übergabenetz kommt an, Status zurück", async () => {
		const res = await runSiteTunnels(new Date(), call);
		expect(res).toMatchObject({ applied: 2, errors: 0 });
		const st = await agent.status();
		expect(st.tunnels.map((t) => t.id).sort()).toEqual(
			[tunnel.A, tunnel.B].sort(),
		);
		const cmds = run.calls.map((c) => `${c.bin} ${c.args.join(" ")}`);
		expect(cmds).toContain(
			"nft add element inet klick site_nets { 10.20.1.0/24 }",
		);
		expect(cmds).toContain(
			"nft add element inet klick site_nets { 192.168.10.0/24 }",
		);
		const [row] = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.B}, true)`);
			return tx.select().from(siteTunnels).where(eq(siteTunnels.id, tunnel.B));
		});
		expect(row?.lastStatusAt).not.toBeNull();
		expect(row?.lastError).toBeNull();
	});

	it("Link für die IT: zeigt Werte, Geheimnis nur mit Eintrag in der Kette", async () => {
		const link = await issueSiteLinkAsPlatform(actor(), org.B, tunnel.B);
		expect(link?.token.startsWith("klk_site_")).toBe(true);
		const r = await resolveSiteLink(link?.token ?? "");
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.site.view.values).toMatchObject({
			server: "88.99.1.2",
			nets: ["10.20.1.0/24"],
		});
		const secret = await revealSiteSecret(r.site, {
			ip: null,
			userAgent: null,
		});
		expect(secret?.tech).toBe("wireguard");
		expect(secret && "config" in secret && secret.config).toContain(
			"Endpoint = 88.99.1.2:51821",
		);
		const viewed = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.B}, true)`);
			return tx
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, org.B),
						eq(auditLog.action, "site_tunnel.secret_viewed"),
					),
				);
		});
		expect(viewed).toHaveLength(1);
		// neuer Link sperrt den alten
		const second = await issueSiteLinkAsPlatform(actor(), org.B, tunnel.B);
		expect((await resolveSiteLink(link?.token ?? "")).ok).toBe(false);
		expect((await resolveSiteLink(second?.token ?? "")).ok).toBe(true);
		// fremde Art: abgelehnt
		expect(
			(
				await resolveSiteLink(
					(second?.token ?? "").replace("klk_site_", "klk_sso_"),
				)
			).ok,
		).toBe(false);
	});

	it("Abbau: gesperrt, solange die IP-Liste das Netz enthält; sonst Link weg, Agent baut ab", async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${org.A}, true)`;
			await tx`update org_settings set network_policy = ${JSON.stringify({ members: [{ cidr: "192.168.10.0/24", note: "Büro" }] })}::jsonb where organization_id = ${org.A}`;
		});
		expect(await removeSiteTunnel(actor(), org.A, tunnel.A)).toEqual({
			ok: false,
			error: "tunnel_in_policy",
		});
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${org.A}, true)`;
			await tx`update org_settings set network_policy = '{}'::jsonb where organization_id = ${org.A}`;
		});
		const link = await issueSiteLinkAsPlatform(actor(), org.A, tunnel.A);
		expect(await removeSiteTunnel(actor(), org.A, tunnel.A)).toEqual({
			ok: true,
		});
		expect((await resolveSiteLink(link?.token ?? "")).ok).toBe(false);
		const [row] = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.A}, true)`);
			return tx.select().from(siteTunnels).where(eq(siteTunnels.id, tunnel.A));
		});
		expect(row?.secretEnc).toBeNull();
		const revoked = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org.A}, true)`);
			return tx
				.select({ revokedAt: accessTokens.revokedAt })
				.from(accessTokens)
				.where(
					and(
						eq(accessTokens.subjectType, "site_tunnel"),
						eq(accessTokens.subjectId, tunnel.A),
					),
				);
		});
		expect(revoked.every((t) => t.revokedAt !== null)).toBe(true);
		const res = await runSiteTunnels(new Date(), call);
		expect(res.removed).toBe(1);
		expect((await agent.status()).tunnels.map((t) => t.id)).toEqual([tunnel.B]);
		// Gegenstelle wieder frei
		expect(
			await planSiteTunnel(
				{
					orgId: org.B,
					tech: "ipsec",
					peerIp: "80.1.2.3",
					customerNets: ["192.168.30.0/24"],
				},
				server,
			),
		).toMatchObject({ ok: true });
	});

	it("Org gelöscht: der Agent baut den verwaisten Tunnel beim nächsten Lauf ab", async () => {
		await client`delete from organization where id = ${org.B}`;
		org.B = "";
		const res = await runSiteTunnels(new Date(), call);
		expect(res.removed).toBe(1);
		expect((await agent.status()).tunnels).toEqual([]);
	});
});
