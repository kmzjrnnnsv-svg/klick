import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	notificationPreferences,
	notifications,
	pushSubscriptions,
} from "@/db/schema";
import { orgRunner, withOrg } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";
import {
	channelsFor,
	mailDecision,
	NO_REMOTE,
	PUSH_MAX_ATTEMPTS,
} from "@/lib/notifications/channels";
import { loadChannelPrefs, pushUsersFor } from "@/lib/notifications/prefs";
import type { PushError, PushSender } from "@/lib/push/http";
import { deliverPush, MAX_DEVICES, saveDevice } from "@/lib/push/service";
import { generateVapidKeys } from "@/lib/push/webpush";

// Integrationstest (DATABASE_URL_TEST): Push je Person gegen einen
// nachgebauten Push-Dienst. Nur Personen mit Kanal Push und Gerät; einmal
// zugestellt = nie wieder; abgemeldete Geräte fallen weg; drei Fehlversuche
// = Mail; Drosselung bricht ab und zählt nicht; fremde Org unberührt; nur
// Titel und Link der eigenen Instanz.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const keys = (n: number) => ({
	p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, n)]).toString(
		"base64url",
	),
	auth: Buffer.alloc(16, n).toString("base64url"),
});

type Sent = { endpoint: string; title: string; url: string; urgency?: string };

function stubSender(by: (endpoint: string) => PushError | null = () => null) {
	const sent: Sent[] = [];
	const send: PushSender = async (target, message, opts) => {
		sent.push({
			endpoint: target.endpoint,
			title: message.title,
			url: message.url,
			urgency: opts.urgency,
		});
		const err = by(target.endpoint);
		return err ? { ok: false, error: err } : { ok: true };
	};
	return { send, sent };
}

d("Push-Benachrichtigungen (Postgres)", () => {
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

	const notif = (
		org: string,
		userKey: string,
		title: string,
		kind: "task_assigned" | "security_alert" = "task_assigned",
		link = "/heute/aufgaben",
	) =>
		inOrg(org, async (tx) => {
			const [row] = await tx
				.insert(notifications)
				.values({
					organizationId: org,
					userId: users[userKey] ?? "",
					kind,
					title,
					link,
				})
				.returning({ id: notifications.id });
			return row?.id ?? "";
		});

	const stateOf = (org: string, id: string) =>
		inOrg(org, async (tx) => {
			const [row] = await tx
				.select({
					pushSentAt: notifications.pushSentAt,
					pushAttempts: notifications.pushAttempts,
				})
				.from(notifications)
				.where(eq(notifications.id, id));
			return row;
		});

	const deliver = (org: string, send: PushSender) =>
		deliverPush(orgRunner(org), org, send, { baseUrl: base, now });

	const device = (org: string, userKey: string, endpoint: string, n: number) =>
		withOrg({ orgId: org, userId: users[userKey] ?? null }, (tx) =>
			saveDevice(tx, {
				orgId: org,
				userId: users[userKey] ?? "",
				endpoint,
				...keys(n),
				label: `Gerät ${n}`,
			}),
		);

	beforeAll(async () => {
		for (const k of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"BETTER_AUTH_URL",
			"VAULT_KEK_BASE64",
			"WEB_PUSH_PUBLIC_KEY",
			"WEB_PUSH_PRIVATE_KEY",
		])
			saved[k] = process.env[k];
		process.env.DATABASE_URL ??= url;
		process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
		process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
		process.env.VAULT_KEK_BASE64 ??= Buffer.alloc(32).toString("base64");
		const vapid = generateVapidKeys();
		process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
		process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
		resetEnvCache();
		for (const name of ["owner", "ana", "bo", "cara", "dora"]) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${name}, ${`${name}-${stamp}@firma.de`}, true, now(), now()) returning id`;
			users[name] = u?.id;
		}
		for (const name of ["A", "B"] as const) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Push ${name}`}, ${`push-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			orgs[name] = org?.id;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org?.id}, ${users.owner}, 'owner', now())`;
		}
		const pref = (org: string, u: string, channels: string[]) => ({
			organizationId: org,
			userId: users[u] ?? "",
			channels: {
				task_assigned: channels as ("mail" | "push" | "teams")[],
				security_alert: channels as ("mail" | "push" | "teams")[],
			},
			digestEnabled: true,
		});
		await inOrg(orgs.A, (tx) =>
			tx
				.insert(notificationPreferences)
				.values([
					pref(orgs.A, "ana", ["push"]),
					pref(orgs.A, "bo", ["mail", "push"]),
					pref(orgs.A, "cara", ["push"]),
					pref(orgs.A, "dora", ["mail"]),
				]),
		);
		await device(orgs.A, "ana", "https://fcm.googleapis.com/fcm/send/ana-1", 1);
		await device(orgs.A, "ana", "https://web.push.apple.com/ana-2", 2);
		await device(orgs.A, "bo", "https://fcm.googleapis.com/fcm/send/bo-1", 3);
		await device(orgs.A, "dora", "https://fcm.googleapis.com/fcm/send/dora", 4);
		// cara will Push, hat aber kein Gerät
		// Org B: ana will Push, ein Gerät, das nie angesprochen werden darf
		await inOrg(orgs.B, (tx) =>
			tx.insert(notificationPreferences).values(pref(orgs.B, "ana", ["push"])),
		);
		await device(orgs.B, "ana", "https://fcm.googleapis.com/fcm/send/ana-b", 5);
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

	it("stellt nur an Personen mit Push und Gerät zu, an alle ihre Geräte", async () => {
		const a = await notif(orgs.A, "ana", "Neue Aufgabe für Ana");
		const b = await notif(orgs.A, "bo", "Neue Aufgabe für Bo");
		const c = await notif(orgs.A, "cara", "Neue Aufgabe für Cara");
		const dd = await notif(orgs.A, "dora", "Neue Aufgabe für Dora");
		const s = stubSender();
		const stats = await deliver(orgs.A, s.send);
		expect(stats.sent).toBe(2);
		expect(s.sent.map((x) => x.endpoint).sort()).toEqual([
			"https://fcm.googleapis.com/fcm/send/ana-1",
			"https://fcm.googleapis.com/fcm/send/bo-1",
			"https://web.push.apple.com/ana-2",
		]);
		expect(s.sent.every((x) => x.url === `${base}/heute/aufgaben`)).toBe(true);
		expect((await stateOf(orgs.A, a))?.pushSentAt).not.toBeNull();
		expect((await stateOf(orgs.A, b))?.pushSentAt).not.toBeNull();
		expect((await stateOf(orgs.A, c))?.pushSentAt).toBeNull();
		expect((await stateOf(orgs.A, dd))?.pushSentAt).toBeNull();
		// zweiter Lauf: nichts doppelt
		const s2 = stubSender();
		await deliver(orgs.A, s2.send);
		expect(s2.sent).toHaveLength(0);
	});

	it("Mail-Jobs: nur Push = erledigt, Mail und Push = Mail, ohne Gerät = Mail", async () => {
		const prefs = await inOrg(orgs.A, (tx) => loadChannelPrefs(tx, orgs.A));
		const devices = await inOrg(orgs.A, (tx) => pushUsersFor(tx, orgs.A));
		const opts = { digest: false, digestEnabled: true };
		const state = (u: string, sentAt: Date | null) => ({
			...NO_REMOTE,
			pushActive: devices.has(users[u] ?? ""),
			teamsSentAt: null,
			teamsAttempts: 0,
			pushSentAt: sentAt,
			pushAttempts: 0,
		});
		const k = "task_assigned" as const;
		expect(
			mailDecision(
				channelsFor(prefs.get(users.ana ?? ""), k),
				state("ana", now),
				opts,
			),
		).toBe("skip");
		expect(
			mailDecision(
				channelsFor(prefs.get(users.bo ?? ""), k),
				state("bo", now),
				opts,
			),
		).toBe("send");
		expect(
			mailDecision(
				channelsFor(prefs.get(users.cara ?? ""), k),
				state("cara", null),
				opts,
			),
		).toBe("send");
	});

	it("Sofort-Arten mit hoher Dringlichkeit, fremde Links nie", async () => {
		await notif(
			orgs.A,
			"ana",
			"Sicherheitshinweis",
			"security_alert",
			"https://evil.example/x",
		);
		const s = stubSender();
		await deliver(orgs.A, s.send);
		expect(s.sent.length).toBeGreaterThan(0);
		expect(s.sent.every((x) => x.urgency === "high")).toBe(true);
		expect(s.sent.every((x) => x.url === `${base}/heute`)).toBe(true);
	});

	it("abgemeldetes Gerät fällt weg, das andere stellt zu", async () => {
		const id = await notif(orgs.A, "ana", "Noch eine Aufgabe");
		const s = stubSender((e) => (e.includes("apple") ? "gone" : null));
		await deliver(orgs.A, s.send);
		expect((await stateOf(orgs.A, id))?.pushSentAt).not.toBeNull();
		const left = await inOrg(orgs.A, (tx) =>
			tx
				.select({ endpoint: pushSubscriptions.endpoint })
				.from(pushSubscriptions)
				.where(eq(pushSubscriptions.userId, users.ana ?? "")),
		);
		expect(left.map((r) => r.endpoint)).toEqual([
			"https://fcm.googleapis.com/fcm/send/ana-1",
		]);
	});

	it("Drosselung bricht ab und zählt nicht", async () => {
		const id = await notif(orgs.A, "bo", "Gedrosselt");
		await deliver(orgs.A, stubSender(() => "throttled").send);
		const st = await stateOf(orgs.A, id);
		expect(st?.pushSentAt).toBeNull();
		expect(st?.pushAttempts).toBe(0);
	});

	it("drei Fehlversuche, dann Mail", async () => {
		const id = await notif(orgs.A, "bo", "Kommt nie an");
		for (let i = 0; i < PUSH_MAX_ATTEMPTS + 1; i++)
			await deliver(orgs.A, stubSender(() => "failed").send);
		const st = await stateOf(orgs.A, id);
		expect(st?.pushSentAt).toBeNull();
		expect(st?.pushAttempts).toBe(PUSH_MAX_ATTEMPTS);
		const prefs = await inOrg(orgs.A, (tx) => loadChannelPrefs(tx, orgs.A));
		expect(
			mailDecision(
				channelsFor(prefs.get(users.bo ?? ""), "task_assigned"),
				{
					...NO_REMOTE,
					pushActive: true,
					teamsSentAt: null,
					teamsAttempts: 0,
					pushSentAt: null,
					pushAttempts: st?.pushAttempts ?? 0,
				},
				{ digest: false, digestEnabled: true },
			),
		).toBe("send");
	});

	it("fremde Org: eigene Geräte, eigene Benachrichtigungen", async () => {
		const id = await notif(orgs.B, "ana", "Aufgabe in Org B");
		const s = stubSender();
		await deliver(orgs.B, s.send);
		expect(s.sent.map((x) => x.endpoint)).toEqual([
			"https://fcm.googleapis.com/fcm/send/ana-b",
		]);
		expect((await stateOf(orgs.B, id))?.pushSentAt).not.toBeNull();
		// Org A sieht das Gerät aus Org B nicht
		const seen = await inOrg(orgs.A, (tx) =>
			tx
				.select({ endpoint: pushSubscriptions.endpoint })
				.from(pushSubscriptions)
				.where(
					eq(
						pushSubscriptions.endpoint,
						"https://fcm.googleapis.com/fcm/send/ana-b",
					),
				),
		);
		expect(seen).toHaveLength(0);
	});

	it("höchstens zehn Geräte je Person", async () => {
		for (let i = 0; i < MAX_DEVICES; i++)
			await device(
				orgs.A,
				"cara",
				`https://fcm.googleapis.com/fcm/send/cara-${i}`,
				10 + i,
			);
		const r = await device(
			orgs.A,
			"cara",
			"https://fcm.googleapis.com/fcm/send/cara-x",
			30,
		);
		expect(r).toEqual({ ok: false, error: "too_many" });
		// dasselbe Gerät erneuern geht
		const again = await device(
			orgs.A,
			"cara",
			"https://fcm.googleapis.com/fcm/send/cara-0",
			31,
		);
		expect(again.ok).toBe(true);
	});
});
