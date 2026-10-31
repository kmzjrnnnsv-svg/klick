import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	announcementAcknowledgements,
	auditLog,
	notifications,
} from "@/db/schema";
import {
	acknowledgeAnnouncement,
	publishAnnouncement,
	withdrawAnnouncement,
} from "@/lib/announcements/service";
import { openAnnouncementsFor } from "@/lib/db/announcements";

// Integrationstest (DATABASE_URL_TEST): Mitteilungen an Kund:innen
// (Admin-Portal, Teil 6). Ein Vorfall für Org A benachrichtigt nur deren
// Inhaber:in und steht in A's Kette; Kenntnisnahme nur durch Inhaber:in/GL,
// einmal je Org; Org B sieht weder Mitteilung noch Kenntnisnahme (RLS);
// Zurückziehen nimmt sie aus der App.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Mitteilungen an Kund:innen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org = { A: "", B: "" };
	const u = { admin: "", ownerA: "", editorA: "", ownerB: "" };
	const created: string[] = [];

	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		for (const k of Object.keys(u) as (keyof typeof u)[]) {
			const [r] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${k}, ${`ann-${k}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			u[k] = r?.id as string;
		}
		for (const k of ["A", "B"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Ann ${k}`}, ${`ann-${k.toLowerCase()}-${stamp}`}, now())
				returning id`;
			org[k] = o?.id as string;
		}
		const members: [string, string, string][] = [
			[org.A, u.ownerA, "owner"],
			[org.A, u.editorA, "editor"],
			[org.B, u.ownerB, "owner"],
		];
		for (const [o, user, role] of members)
			await client`
				insert into member (id, organization_id, user_id, role, created_at)
				values (gen_random_uuid(), ${o}, ${user}, ${role}, now())`;
	});

	afterAll(async () => {
		if (created.length)
			await client`delete from platform_announcements where id = any(${created})`;
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		for (const id of Object.values(u))
			if (id) await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	const actor = () => ({ userId: u.admin, ip: null, userAgent: null });
	let incidentId = "";

	it("Vorfall für Org A: Mail-Hinweis an die Inhaber:in, Eintrag in A's Kette", async () => {
		const res = await publishAnnouncement(actor(), {
			kind: "incident",
			title: "Test-Vorfall",
			body: "Am Testtag hat Klick einen Vorfall festgestellt.",
			startsAt: new Date(Date.now() - 60_000),
			endsAt: null,
			orgIds: [org.A],
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		incidentId = res.data.id;
		created.push(incidentId);
		expect(res.data).toMatchObject({ orgs: 1, notified: 1 });

		const notes = await inOrg(org.A, (tx) =>
			tx
				.select({ userId: notifications.userId, kind: notifications.kind })
				.from(notifications)
				.where(eq(notifications.organizationId, org.A)),
		);
		expect(notes).toEqual([{ userId: u.ownerA, kind: "security_alert" }]);

		const chainA = await inOrg(org.A, (tx) =>
			tx
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, org.A),
						eq(auditLog.target, `announcement:${incidentId}`),
					),
				),
		);
		expect(chainA.map((r) => r.action)).toEqual(["platform.announcement"]);
		const chainB = await inOrg(org.B, (tx) =>
			tx
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(eq(auditLog.organizationId, org.B)),
		);
		expect(chainB).toEqual([]);
	});

	it("nur Org A sieht die Mitteilung", async () => {
		const now = new Date();
		expect((await openAnnouncementsFor(org.A, now)).map((a) => a.id)).toContain(
			incidentId,
		);
		expect(
			(await openAnnouncementsFor(org.B, now)).map((a) => a.id),
		).not.toContain(incidentId);
	});

	it("Kenntnisnahme nur Inhaber:in/GL, einmal je Org; fremde Org nie", async () => {
		const ctx = (orgId: string, userId: string) => ({ orgId, userId });
		expect(
			await acknowledgeAnnouncement(ctx(org.A, u.editorA), incidentId),
		).toEqual({ ok: false, error: "forbidden" });
		expect(
			await acknowledgeAnnouncement(ctx(org.B, u.ownerB), incidentId),
		).toEqual({ ok: false, error: "not_found" });
		expect(
			(await acknowledgeAnnouncement(ctx(org.A, u.ownerA), incidentId)).ok,
		).toBe(true);
		expect(
			(await acknowledgeAnnouncement(ctx(org.A, u.ownerA), incidentId)).ok,
		).toBe(true);

		const inA = await inOrg(org.A, (tx) =>
			tx
				.select({ id: announcementAcknowledgements.id })
				.from(announcementAcknowledgements),
		);
		expect(inA).toHaveLength(1);
		// RLS: Org B sieht die Kenntnisnahme von A nicht
		const inB = await inOrg(org.B, (tx) =>
			tx
				.select({ id: announcementAcknowledgements.id })
				.from(announcementAcknowledgements),
		);
		expect(inB).toEqual([]);
	});

	it("Wartung für alle: kein Mail-Hinweis; Zurückziehen nimmt sie aus der App", async () => {
		const res = await publishAnnouncement(actor(), {
			kind: "maintenance",
			title: "Test-Wartung",
			body: "Kurz nicht erreichbar, danach geht es weiter.",
			startsAt: new Date(Date.now() + 3600_000),
			endsAt: new Date(Date.now() + 2 * 3600_000),
			orgIds: null,
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		created.push(res.data.id);
		expect(res.data.notified).toBe(0);
		expect(
			(await openAnnouncementsFor(org.B, new Date())).map((a) => a.id),
		).toContain(res.data.id);
		expect((await withdrawAnnouncement(actor(), res.data.id)).ok).toBe(true);
		expect(
			(await openAnnouncementsFor(org.B, new Date())).map((a) => a.id),
		).not.toContain(res.data.id);
		expect(await withdrawAnnouncement(actor(), res.data.id)).toEqual({
			ok: false,
			error: "not_found",
		});
	});

	it("Zeitfenster und leere Auswahl werden abgelehnt", async () => {
		const base = {
			kind: "info" as const,
			title: "Falsch",
			body: "Dieser Text ist lang genug.",
		};
		expect(
			await publishAnnouncement(actor(), {
				...base,
				startsAt: new Date(),
				endsAt: new Date(Date.now() - 1000),
				orgIds: null,
			}),
		).toEqual({ ok: false, error: "ends_before_start" });
		expect(
			await publishAnnouncement(actor(), {
				...base,
				startsAt: new Date(),
				endsAt: null,
				orgIds: ["00000000-0000-4000-8000-000000000000"],
			}),
		).toEqual({ ok: false, error: "no_orgs" });
	});
});
