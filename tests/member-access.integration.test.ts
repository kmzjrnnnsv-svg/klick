import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstest (DATABASE_URL_TEST): member_access ist FORCE RLS. Ohne
// Org-Kontext sieht die App-Rolle keine Zeile — Ablauf und Grants wären im
// Guard stillschweigend leer. memberAccessFor liest deshalb im Kontext der
// Org (ADR-018: befristete Prüfer- und Berater-Zugänge).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("member_access im Org-Kontext (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	let orgId = "";
	let userId = "";
	let memberId = "";
	const until = new Date("2026-01-31T12:00:00Z");

	beforeAll(async () => {
		process.env.DATABASE_URL = url;
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Access Test', ${`access-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Beraterin', ${`access-${Date.now()}@example.test`}, true, now(), now()) returning id`;
		userId = u?.id;
		const [m] = await client`
			insert into member (organization_id, user_id, role, created_at)
			values (${orgId}, ${userId}, 'consultant', now()) returning id`;
		memberId = m?.id;
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into member_access (member_id, organization_id, access_until, grants)
				values (${memberId}, ${orgId}, ${until}, ${client.json(["aml_detail"])})`;
		});
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
			await tx`delete from "user" where id = ${userId}`;
		});
		await client.end({ timeout: 5 });
		const { sqlClient } = await import("@/db");
		await sqlClient.end({ timeout: 5 });
	});

	it("ohne Kontext unsichtbar, über memberAccessFor mit Ablauf und Grants", async () => {
		const [{ n }] =
			await client`select count(*)::int as n from member_access where member_id = ${memberId}`;
		expect(n).toBe(0);
		const { listUserMemberships, memberAccessFor } = await import(
			"@/lib/auth/org"
		);
		const [row] = await memberAccessFor(orgId, [memberId]);
		expect(row?.accessUntil?.toISOString()).toBe(until.toISOString());
		expect(row?.grants).toEqual(["aml_detail"]);
		const [m] = await listUserMemberships(userId);
		expect(m).toMatchObject({ organizationId: orgId, role: "consultant" });
		expect(m?.expired).toBe(true);
	});
});
