import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	notificationPreferences,
	notifications,
	teamsIntegrations,
	teamsUsers,
} from "@/db/schema";
import { withOrg } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";
import {
	channelsFor,
	mailDecision,
	NO_REMOTE,
} from "@/lib/notifications/channels";
import { loadChannelPrefs, teamsActiveFor } from "@/lib/notifications/prefs";
import { openConsentState } from "@/lib/teams/consent";
import type { GraphClient, GraphError, GraphResult } from "@/lib/teams/graph";
import {
	completeConsent,
	deliverTeams,
	prepareConsent,
} from "@/lib/teams/service";

// Integrationstest (DATABASE_URL_TEST): Zustellung in Microsoft Teams (T5)
// gegen einen nachgebauten Graph-Client. Nur Personen mit Kanal Teams bzw.
// Mail und Teams; einmal zugestellt = nie wieder; drei Fehlversuche = Mail;
// fehlende Freigabe bricht ab und zählt nicht; Freigabe nur mit passendem
// Einmalwert und Tenant; fremde Org unberührt.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const SECRET = "t".repeat(40);

type Call = { fn: string; args: unknown[] };

function stubGraph(over: { send?: GraphError } = {}) {
	const calls: Call[] = [];
	const ok = <T>(value: T): GraphResult<T> => ({ ok: true, value });
	const client = {
		async token() {
			return ok("tok");
		},
		async findUser(tenant: string, email: string) {
			calls.push({ fn: "findUser", args: [tenant, email] });
			return email.startsWith("nie-")
				? ({ ok: false, error: "user_not_found" } as const)
				: ok(`aad-${email.split("@")[0]}`);
		},
		async findCatalogApp(tenant: string) {
			calls.push({ fn: "findCatalogApp", args: [tenant] });
			return ok("cat-1");
		},
		async installApp(tenant: string, aad: string, app: string) {
			calls.push({ fn: "installApp", args: [tenant, aad, app] });
			return ok(true as const);
		},
		async sendActivity(
			tenant: string,
			aad: string,
			item: { title: string; webUrl: string },
		) {
			calls.push({ fn: "sendActivity", args: [tenant, aad, item] });
			return over.send
				? ({ ok: false, error: over.send } as const)
				: ok(true as const);
		},
	} as unknown as GraphClient;
	return { client, calls };
}

d("Benachrichtigungen in Teams (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgs = { A: "", B: "" };
	const users: Record<string, string> = {};
	const saved: Record<string, string | undefined> = {};
	const base = "https://raza.work";
	const now = new Date();

	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	const notif = (org: string, userKey: string, title: string) =>
		inOrg(org, async (tx) => {
			const [row] = await tx
				.insert(notifications)
				.values({
					organizationId: org,
					userId: users[userKey] ?? "",
					kind: "task_assigned",
					title,
					link: "/heute/aufgaben",
				})
				.returning({ id: notifications.id });
			return row?.id ?? "";
		});

	const stateOf = (org: string, id: string) =>
		inOrg(org, async (tx) => {
			const [row] = await tx
				.select({
					teamsSentAt: notifications.teamsSentAt,
					teamsAttempts: notifications.teamsAttempts,
				})
				.from(notifications)
				.where(eq(notifications.id, id));
			return row;
		});

	const deliver = (org: string, graph: GraphClient) =>
		withOrg({ orgId: org, userId: null }, (tx) =>
			deliverTeams(tx, org, graph, { baseUrl: base, now }),
		);

	beforeAll(async () => {
		for (const k of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"BETTER_AUTH_URL",
			"VAULT_KEK_BASE64",
			"TEAMS_CLIENT_ID",
			"TEAMS_CLIENT_SECRET",
		])
			saved[k] = process.env[k];
		process.env.DATABASE_URL ??= url;
		process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
		process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
		process.env.VAULT_KEK_BASE64 ??= Buffer.alloc(32).toString("base64");
		process.env.TEAMS_CLIENT_ID = "0f7a1c2b-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
		process.env.TEAMS_CLIENT_SECRET = "nachgebaut";
		resetEnvCache();
		for (const name of ["owner", "ana", "bo", "cara", "nie-dave"]) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${name}, ${`${name}-${stamp}@firma.de`}, true, now(), now()) returning id`;
			users[name] = u?.id;
		}
		for (const name of ["A", "B"] as const) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Teams ${name}`}, ${`teams-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			orgs[name] = org?.id;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org?.id}, ${users.owner}, 'owner', now())`;
		}
		await inOrg(orgs.A, async (tx) => {
			await tx.insert(teamsIntegrations).values({
				organizationId: orgs.A,
				tenantId: TENANT,
				status: "active",
				enabled: true,
				consentedAt: now,
			});
			const pref = (u: string, channel: "teams" | "both" | "mail") => ({
				organizationId: orgs.A,
				userId: users[u] ?? "",
				channels: { task_assigned: channel },
				digestEnabled: true,
			});
			await tx
				.insert(notificationPreferences)
				.values([
					pref("ana", "teams"),
					pref("bo", "both"),
					pref("nie-dave", "teams"),
				]);
		});
		// Org B: dieselbe Person will Teams, die Org hat es nicht eingerichtet
		await inOrg(orgs.B, (tx) =>
			tx.insert(notificationPreferences).values({
				organizationId: orgs.B,
				userId: users.ana ?? "",
				channels: { task_assigned: "teams" },
				digestEnabled: true,
			}),
		);
	});

	afterAll(async () => {
		for (const [k, v] of Object.entries(saved))
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		resetEnvCache();
		await client`delete from organization where id in (${orgs.A}, ${orgs.B})`;
		await client`delete from "user" where id in ${client(Object.values(users))}`;
		await client.end();
	});

	it("stellt nur Teams-Personen zu, einmal, mit Link der eigenen Instanz", async () => {
		const ana = await notif(orgs.A, "ana", "Aufgabe für Ana");
		const bo = await notif(orgs.A, "bo", "Aufgabe für Bo");
		const cara = await notif(orgs.A, "cara", "Aufgabe für Cara");
		const g = stubGraph();
		const s = await deliver(orgs.A, g.client);
		expect(s.sent).toBe(2);
		expect((await stateOf(orgs.A, ana))?.teamsSentAt).not.toBeNull();
		expect((await stateOf(orgs.A, bo))?.teamsSentAt).not.toBeNull();
		expect((await stateOf(orgs.A, cara))?.teamsSentAt).toBeNull();
		const sends = g.calls.filter((c) => c.fn === "sendActivity");
		expect(sends.map((c) => (c.args[2] as { webUrl: string }).webUrl)).toEqual([
			`${base}/heute/aufgaben`,
			`${base}/heute/aufgaben`,
		]);
		// Katalog-App und Konten gemerkt
		const [integ] = await inOrg(orgs.A, (tx) =>
			tx
				.select()
				.from(teamsIntegrations)
				.where(eq(teamsIntegrations.organizationId, orgs.A)),
		);
		expect(integ?.catalogAppId).toBe("cat-1");
		const known = await inOrg(orgs.A, (tx) =>
			tx
				.select()
				.from(teamsUsers)
				.where(eq(teamsUsers.userId, users.ana ?? "")),
		);
		expect(known[0]?.aadObjectId).toBe(`aad-ana-${stamp}`);
		expect(known[0]?.appInstalledAt).not.toBeNull();

		// zweiter Lauf: nichts doppelt, kein neuer Katalog-Abruf, keine Installation
		const g2 = stubGraph();
		await notif(orgs.A, "ana", "Zweite Aufgabe");
		const s2 = await deliver(orgs.A, g2.client);
		expect(s2.sent).toBe(1);
		expect(g2.calls.map((c) => c.fn)).toEqual(["sendActivity"]);
	});

	it("Mail-Jobs: nur Teams = erledigt, beides = Mail, ohne Einstellung = Mail", async () => {
		const prefs = await inOrg(orgs.A, (tx) => loadChannelPrefs(tx, orgs.A));
		const active = await inOrg(orgs.A, (tx) => teamsActiveFor(tx, orgs.A));
		expect(active).toBe(true);
		const opts = { digest: false, digestEnabled: true };
		const sent = {
			...NO_REMOTE,
			teamsActive: active,
			teamsSentAt: now,
			teamsAttempts: 0,
			pushSentAt: null,
			pushAttempts: 0,
		};
		expect(
			mailDecision(
				channelsFor(prefs.get(users.ana ?? ""), "task_assigned"),
				sent,
				opts,
			),
		).toBe("skip");
		expect(
			mailDecision(
				channelsFor(prefs.get(users.bo ?? ""), "task_assigned"),
				sent,
				opts,
			),
		).toBe("send");
		expect(
			mailDecision(
				channelsFor(prefs.get(users.cara ?? ""), "task_assigned"),
				{ ...sent, teamsSentAt: null },
				opts,
			),
		).toBe("send");
	});

	it("drei Fehlversuche, dann Mail", async () => {
		const id = await notif(orgs.A, "nie-dave", "Aufgabe für Dave");
		for (let i = 0; i < 4; i++) await deliver(orgs.A, stubGraph().client);
		const st = await stateOf(orgs.A, id);
		expect(st?.teamsSentAt).toBeNull();
		expect(st?.teamsAttempts).toBe(3);
		const prefs = await inOrg(orgs.A, (tx) => loadChannelPrefs(tx, orgs.A));
		const decision = mailDecision(
			channelsFor(prefs.get(users["nie-dave"] ?? ""), "task_assigned"),
			{
				...NO_REMOTE,
				teamsActive: true,
				teamsSentAt: null,
				teamsAttempts: st?.teamsAttempts ?? 0,
				pushSentAt: null,
				pushAttempts: 0,
			},
			{ digest: false, digestEnabled: true },
		);
		expect(decision).toBe("send");
		const [u] = await inOrg(orgs.A, (tx) =>
			tx
				.select()
				.from(teamsUsers)
				.where(eq(teamsUsers.userId, users["nie-dave"] ?? "")),
		);
		expect(u?.lastError).toBe("user_not_found");
	});

	it("fehlende Freigabe bricht ab, zählt nicht und setzt die Org auf Fehler", async () => {
		const id = await notif(orgs.A, "ana", "Nach Widerruf");
		const s = await deliver(
			orgs.A,
			stubGraph({ send: "consent_missing" }).client,
		);
		expect(s.sent).toBe(0);
		expect((await stateOf(orgs.A, id))?.teamsAttempts).toBe(0);
		const [integ] = await inOrg(orgs.A, (tx) =>
			tx
				.select()
				.from(teamsIntegrations)
				.where(eq(teamsIntegrations.organizationId, orgs.A)),
		);
		expect(integ?.status).toBe("error");
		expect(integ?.lastError).toBe("consent_missing");
		// Org nicht mehr aktiv: Mail-Jobs warten nicht mehr
		expect(await inOrg(orgs.A, (tx) => teamsActiveFor(tx, orgs.A))).toBe(false);
	});

	it("fremde Org: nichts zugestellt, nichts sichtbar", async () => {
		const id = await notif(orgs.B, "ana", "Aufgabe in B");
		const g = stubGraph();
		const s = await deliver(orgs.B, g.client);
		expect(s).toEqual({ sent: 0, failed: 0, skipped: 0 });
		expect(g.calls).toHaveLength(0);
		expect((await stateOf(orgs.B, id))?.teamsSentAt).toBeNull();
		const seen = await inOrg(orgs.B, (tx) =>
			tx.select().from(teamsIntegrations),
		);
		expect(seen.filter((r) => r.organizationId === orgs.A)).toHaveLength(0);
		const seenUsers = await inOrg(orgs.B, (tx) => tx.select().from(teamsUsers));
		expect(seenUsers).toHaveLength(0);
	});

	it("Freigabe nur mit passendem Einmalwert und Tenant, nur einmal", async () => {
		const prep = await inOrg(orgs.B, (tx) =>
			prepareConsent(tx, {
				orgId: orgs.B,
				userId: users.owner ?? "",
				tenantId: TENANT,
				secret: SECRET,
				now,
			}),
		);
		const opened = openConsentState(prep.state, SECRET, now.getTime());
		expect(opened?.orgId).toBe(orgs.B);
		const complete = (nonce: string, tenantId: string | null) =>
			inOrg(orgs.B, (tx) =>
				completeConsent(tx, {
					orgId: orgs.B,
					nonce,
					tenantId,
					granted: true,
					error: null,
					now,
				}),
			);
		expect((await complete("falsch", TENANT)).result).toBe("invalid");
		expect(
			(
				await complete(
					opened?.nonce ?? "",
					"11111111-2222-4333-8444-555555555555",
				)
			).result,
		).toBe("invalid");
		expect(
			(await complete(opened?.nonce ?? "", TENANT.toUpperCase())).result,
		).toBe("active");
		expect((await complete(opened?.nonce ?? "", TENANT)).result).toBe(
			"invalid",
		);
		const [row] = await inOrg(orgs.B, (tx) =>
			tx
				.select()
				.from(teamsIntegrations)
				.where(eq(teamsIntegrations.organizationId, orgs.B)),
		);
		expect(row?.status).toBe("active");
		expect(row?.enabled).toBe(false);
		// Inhaber:innen erfahren es
		const told = await inOrg(orgs.B, (tx) =>
			tx
				.select()
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, users.owner ?? ""),
						eq(notifications.kind, "system"),
					),
				),
		);
		expect(told.some((n) => n.title.includes("Teams"))).toBe(true);
	});
});
