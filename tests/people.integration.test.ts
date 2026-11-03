import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { notifications, tasks } from "@/db/schema";
import { remindAllowed } from "@/lib/compliance/people";
import { lastReminders } from "@/lib/compliance/queries-people";
import { openItemsByPerson } from "@/lib/compliance/queries-report";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): offene Punkte je Person (/team,
// /auswertung) und „zuletzt erinnert“ — gezählt in SQL, nur in der eigenen
// Organisation, Erinnerungen höchstens einmal in 24 Stunden.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Personen: offene Punkte und Erinnerungen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgIds: string[] = [];
	const userIds: string[] = [];

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		for (const n of ["a", "b"]) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${`Person ${n}`}, ${`people-${n}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			userIds.push(u?.id as string);
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Personen ${n}`}, ${`people-${n}-${stamp}`}, now()) returning id`;
			orgIds.push(o?.id as string);
		}
	});

	afterAll(async () => {
		for (const id of orgIds)
			await client`delete from organization where id = ${id}`;
		for (const id of userIds) await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	it("zählt überfällig, bald, im Plan und ohne Frist je Person", async () => {
		const [orgA, orgB] = orgIds as [string, string];
		const [userA, userB] = userIds as [string, string];
		await inOrg(orgA, (tx) =>
			tx.insert(tasks).values([
				{
					organizationId: orgA,
					title: "alt",
					assigneeUserId: userA,
					dueAt: "2026-10-01",
				},
				{
					organizationId: orgA,
					title: "bald",
					assigneeUserId: userA,
					dueAt: "2026-11-10",
				},
				{
					organizationId: orgA,
					title: "später",
					assigneeUserId: userA,
					dueAt: "2027-01-01",
				},
				{ organizationId: orgA, title: "offen", assigneeUserId: userA },
				{
					organizationId: orgA,
					title: "erledigt",
					assigneeUserId: userA,
					dueAt: "2026-10-01",
					status: "done",
				},
				{
					organizationId: orgA,
					title: "andere",
					assigneeUserId: userB,
					dueAt: "2026-10-02",
				},
			]),
		);
		// fremde Org zählt nicht mit
		await inOrg(orgB, (tx) =>
			tx.insert(tasks).values({
				organizationId: orgB,
				title: "fremd",
				assigneeUserId: userA,
				dueAt: "2026-10-01",
			}),
		);
		const rows = await inOrg(orgA, (tx) =>
			openItemsByPerson(tx, orgA, "2026-11-03", "2026-11-17"),
		);
		const a = rows.find((r) => r.userId === userA);
		const b = rows.find((r) => r.userId === userB);
		expect(a).toEqual({
			userId: userA,
			overdue: 1,
			soon: 1,
			planned: 1,
			undated: 1,
		});
		expect(b).toEqual({
			userId: userB,
			overdue: 1,
			soon: 0,
			planned: 0,
			undated: 0,
		});
	});

	it("„zuletzt erinnert“ ist die jüngste Erinnerung dieser Org", async () => {
		const [orgA, orgB] = orgIds as [string, string];
		const [userA, userB] = userIds as [string, string];
		const older = new Date("2026-11-01T08:00:00Z");
		const newer = new Date("2026-11-02T08:00:00Z");
		await inOrg(orgA, (tx) =>
			tx.insert(notifications).values([
				{
					organizationId: orgA,
					userId: userA,
					kind: "reminder",
					title: "1",
					createdAt: older,
				},
				{
					organizationId: orgA,
					userId: userA,
					kind: "reminder",
					title: "2",
					createdAt: newer,
				},
				// andere Arten zählen nicht als Erinnerung durch Inhaber:innen
				{
					organizationId: orgA,
					userId: userB,
					kind: "review_due",
					title: "Tick",
				},
			]),
		);
		await inOrg(orgB, (tx) =>
			tx.insert(notifications).values({
				organizationId: orgB,
				userId: userB,
				kind: "reminder",
				title: "fremd",
			}),
		);
		const last = await inOrg(orgA, (tx) => lastReminders(tx, orgA));
		expect(last.get(userA)?.toISOString()).toBe(newer.toISOString());
		expect(last.has(userB)).toBe(false);
		// nur ausgewählte Personen
		const only = await inOrg(orgA, (tx) => lastReminders(tx, orgA, [userB]));
		expect(only.size).toBe(0);
		// Sperre 24 h ab der jüngsten Erinnerung
		expect(
			remindAllowed(last.get(userA), new Date("2026-11-03T07:59:00Z")),
		).toBe(false);
		expect(
			remindAllowed(last.get(userA), new Date("2026-11-03T08:00:00Z")),
		).toBe(true);
	});
});
