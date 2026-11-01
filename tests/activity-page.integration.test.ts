import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type ActivityCursor,
	encodeActivityCursor,
	parseActivityCursor,
	START_CURSOR,
} from "@/lib/activity-page";
import { orgActivity } from "@/lib/compliance/queries-p2";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { resetEnvCache } from "@/lib/env";

// Integrationstest (DATABASE_URL_TEST): /aktivitaet blättert über Audit und
// Kommentare; Einträge mit gleichem Zeitpunkt (eine Transaktion, gleiche
// Mikrosekunde) erscheinen genau einmal, fremde Orgs nie.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Aktivität seitenweise (Postgres)", () => {
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
			values ('Feed', ${`feed-${stamp}@firma.de`}, true, now(), now()) returning id`;
		userId = u?.id;
		for (const name of ["A", "B"] as const) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Feed ${name}`}, ${`feed-${name.toLowerCase()}-${stamp}`}, now())
				returning id`;
			orgs[name] = org?.id;
		}
		// Org A: neun Audit-Einträge in einer Transaktion (gleiches `at`),
		// dann drei einzelne
		await mutateOrg({ orgId: orgs.A, userId }, async () => ({
			result: null,
			audit: Array.from({ length: 9 }, (_, i) => ({
				action: "feed.batch",
				target: `risk:${i}`,
				after: { n: i },
			})),
		}));
		for (let i = 0; i < 3; i++)
			await mutateOrg({ orgId: orgs.A, userId }, async () => ({
				result: null,
				audit: { action: "feed.single", target: `risk:s${i}`, after: { i } },
			}));
		// Kommentare: fünf in derselben Mikrosekunde, drei einzeln
		const insertComment = (orgId: string, at: string) =>
			client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${orgId}, true)`;
				await tx`insert into comments
					(organization_id, entity_type, entity_id, author_user_id, body_markdown, created_at)
					values (${orgId}, 'risk', gen_random_uuid(), ${userId}, 'Kommentar', ${at}::text::timestamptz)`;
			});
		for (let i = 0; i < 5; i++)
			await insertComment(orgs.A, "2026-11-01T10:00:00.123456Z");
		for (const at of [
			"2026-11-01T10:00:00.123457Z",
			"2026-11-01T09:59:59.999999Z",
			"2026-11-01T10:00:01.000001Z",
		])
			await insertComment(orgs.A, at);
		// Org B: ein Kommentar und ein Eintrag, die A nie sehen darf
		await insertComment(orgs.B, "2026-11-01T10:00:00.123456Z");
		await mutateOrg({ orgId: orgs.B, userId }, async () => ({
			result: null,
			audit: { action: "feed.other", target: "risk:b" },
		}));
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

	it("jede Seite höchstens die Größe, alles genau einmal, nichts Fremdes", async () => {
		for (const size of [1, 4, 7]) {
			const audit: string[] = [];
			const comments: string[] = [];
			let cursor: ActivityCursor | null = START_CURSOR;
			let pages = 0;
			while (cursor && pages < 50) {
				const parsed = parseActivityCursor(encodeActivityCursor(cursor));
				const page = await readOrg({ orgId: orgs.A, userId }, (tx) =>
					orgActivity(tx, orgs.A, parsed, size),
				);
				expect(page.audit.length + page.comments.length).toBeLessThanOrEqual(
					size,
				);
				audit.push(...page.audit.map((a) => a.id));
				comments.push(...page.comments.map((c) => c.id));
				cursor = page.next;
				pages++;
			}
			expect(audit).toHaveLength(12);
			expect(new Set(audit).size).toBe(12);
			expect(comments).toHaveLength(8);
			expect(new Set(comments).size).toBe(8);
		}
	});

	it("erste Seite neueste zuerst, Namen der Handelnden geladen", async () => {
		const page = await readOrg({ orgId: orgs.A, userId }, (tx) =>
			orgActivity(tx, orgs.A, START_CURSOR, 50),
		);
		expect(page.next).toBeNull();
		expect(page.comments[0]?.cursorAt).toBe("2026-11-01T10:00:01.000001Z");
		expect(page.names.get(userId)).toBe("Feed");
	});
});
