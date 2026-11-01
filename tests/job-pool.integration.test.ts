import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsJob } from "@/lib/db/job-scope";
import { poolConnection } from "@/lib/db/pool-options";
import { longRunning, readOrg } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";
import { runRetention } from "@/lib/jobs/retention";
import { mailWorkOrgs, pushWorkOrgs } from "@/lib/jobs/work-orgs";

// Integrationstest (DATABASE_URL_TEST) für P4: Zeitgrenzen kommen als
// Startparameter an, longRunning hebt sie für eine Transaktion an, Jobs
// finden nur Orgs mit offener Arbeit, die Retention löscht alte
// Benachrichtigungen in Blöcken und lässt neue stehen.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Jobs, Pool und Aufräumen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const orgs = { A: "", B: "" };
	let userId = "";
	const saved: Record<string, string | undefined> = {};

	beforeAll(async () => {
		for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"])
			saved[k] = process.env[k];
		process.env.DATABASE_URL ??= url;
		process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
		process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
		resetEnvCache();
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Jobs', ${`jobs-${stamp}@firma.de`}, true, now(), now()) returning id`;
		userId = u?.id;
		for (const name of ["A", "B"] as const) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Jobs ${name}`}, ${`jobs-${name.toLowerCase()}-${stamp}`}, now())
				returning id`;
			orgs[name] = org?.id;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org?.id}, ${userId}, 'owner', now())`;
		}
	});

	afterAll(async () => {
		for (const [k, v] of Object.entries(saved))
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		resetEnvCache();
		await client`delete from organization where id in (${orgs.A}, ${orgs.B})`;
		await client`delete from "user" where id = ${userId}`;
		await client.end();
	});

	const insertNotification = (
		orgId: string,
		opts: { ageDays: number; read?: boolean; emailed?: boolean },
	) =>
		client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			const created = new Date(Date.now() - opts.ageDays * 86_400_000);
			const [row] = await tx`
				insert into notifications
				  (organization_id, user_id, kind, title, created_at, read_at, emailed_at)
				values (${orgId}, ${userId}, 'task_assigned', 'Test', ${created},
				  ${opts.read ? created : null}, ${opts.emailed ? created : null})
				returning id`;
			return row?.id as string;
		});

	it("Zeitgrenzen kommen als Startparameter an", async () => {
		const conn = poolConnection("jobs", "nodejs");
		const timed = postgres(url ?? "", { max: 1, connection: conn });
		const [row] = await timed`show statement_timeout`;
		const [lock] = await timed`show lock_timeout`;
		await timed.end();
		expect(row?.statement_timeout).toBe("10min");
		expect(lock?.lock_timeout).toBe("30s");
	});

	it("longRunning hebt die Grenze nur für die eigene Transaktion an", async () => {
		const ctx = { orgId: orgs.A, userId: null };
		const inside = await readOrg(ctx, async (tx) => {
			await longRunning(tx, 120_000);
			const [r] = await tx.execute<{ statement_timeout: string }>(
				sql`show statement_timeout`,
			);
			return r?.statement_timeout;
		});
		expect(inside).toBe("2min");
		const after = await readOrg(ctx, async (tx) => {
			const [r] = await tx.execute<{ statement_timeout: string }>(
				sql`show statement_timeout`,
			);
			return r?.statement_timeout;
		});
		expect(after).not.toBe("2min");
	});

	it("im Job laufen Org-Abfragen über den Job-Pool", async () => {
		const n = await runAsJob(() =>
			readOrg({ orgId: orgs.A, userId: null }, async (tx) => {
				const [r] = await tx.execute<{ n: number }>(
					sql`select count(*)::int as n from member where organization_id = ${orgs.A}`,
				);
				return r?.n;
			}),
		);
		expect(n).toBe(1);
	});

	it("Jobs finden nur Orgs mit offener Arbeit", async () => {
		await insertNotification(orgs.A, { ageDays: 0 });
		const mail = await mailWorkOrgs();
		expect(mail).toContain(orgs.A);
		expect(mail).not.toContain(orgs.B);
		// Push braucht ein Gerät der Person: ohne Gerät keine Arbeit
		const since = new Date(Date.now() - 3 * 86_400_000);
		expect(await pushWorkOrgs(since)).not.toContain(orgs.A);
		await client.begin(async (t) => {
			await t`select set_config('app.org_id', ${orgs.A}, true)`;
			await t`insert into push_subscriptions
				(organization_id, user_id, endpoint, p256dh, auth, label)
				values (${orgs.A}, ${userId}, ${`https://fcm.googleapis.com/fcm/send/jobs-${stamp}`},
				  'x', 'y', 'Testgerät')`;
		});
		expect(await pushWorkOrgs(since)).toContain(orgs.A);
		expect(await pushWorkOrgs(since)).not.toContain(orgs.B);
	});

	it("Retention löscht alte Benachrichtigungen, neue bleiben", async () => {
		const oldRead = await insertNotification(orgs.B, {
			ageDays: 200,
			read: true,
		});
		const oldUnread = await insertNotification(orgs.B, { ageDays: 400 });
		const recentUnread = await insertNotification(orgs.B, { ageDays: 200 });
		const recentRead = await insertNotification(orgs.B, {
			ageDays: 10,
			read: true,
		});
		await runRetention();
		const left = await client.begin(async (t) => {
			await t`select set_config('app.org_id', ${orgs.B}, true)`;
			return t`select id from notifications where organization_id = ${orgs.B}`;
		});
		const ids = left.map((r) => r.id as string);
		expect(ids).not.toContain(oldRead);
		expect(ids).not.toContain(oldUnread);
		expect(ids).toContain(recentUnread);
		expect(ids).toContain(recentRead);
	});
});
