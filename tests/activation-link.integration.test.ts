import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstest (DATABASE_URL_TEST): Aktivierungslink für ein vom
// Plattform-Admin angelegtes Konto. Bis zum Einlösen kein Mail-Notweg,
// gesperrte Konten lösen keinen Link auf (sonst wäre der Token verbraucht,
// bevor die Sitzung an der Sperre scheitert).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Aktivierungslink (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const email = `activate-${Date.now()}@example.test`;
	let userId = "";
	let adminId = "";
	let orgId = "";
	let invitationId = "";

	beforeAll(async () => {
		process.env.DATABASE_URL = url;
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Neu Angelegt', ${email}, false, now(), now()) returning id`;
		userId = u?.id;
		const [a] = await client`
			insert into "user" (name, email, email_verified, role, created_at, updated_at)
			values ('Admin', ${`admin-${Date.now()}@example.test`}, true, 'admin', now(), now()) returning id`;
		adminId = a?.id;
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Aktivierung Test', ${`activate-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
		const [inv] = await client`
			insert into invitation (organization_id, email, role, status, expires_at, inviter_id, created_at)
			values (${orgId}, ${email}, 'editor', 'pending', now() + interval '7 days', ${adminId}, now())
			returning id`;
		invitationId = inv?.id;
	});

	afterAll(async () => {
		await client`delete from verification where value::jsonb->>'userId' = ${userId}`;
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
			await tx`delete from "user" where id in (${userId}, ${adminId})`;
		});
		await client.end({ timeout: 5 });
		const { sqlClient } = await import("@/db");
		await sqlClient.end({ timeout: 5 });
	});

	it("nicht aktiviert → kein Notweg; Sperre blockiert den Link; Einlösen aktiviert", async () => {
		const {
			consumeRegistrationToken,
			issueRegistrationLink,
			pendingActivations,
			resolveRegistration,
		} = await import("@/lib/auth/registration-link");
		const { hasPendingActivation, mayReceiveMagicLink } = await import(
			"@/lib/auth/allow-list"
		);

		const expires = new Date(Date.now() + 60_000);
		const first = await issueRegistrationLink(
			{ kind: "activate", userId, email, invitationId },
			expires,
		);
		// ein neuer Link ersetzt den alten
		const { token, url: link } = await issueRegistrationLink(
			{ kind: "activate", userId, email, invitationId },
			expires,
		);
		expect(link).toContain("/aktivieren#klk_activate_");
		expect((await resolveRegistration(first.token)).ok).toBe(false);

		expect(await hasPendingActivation(userId)).toBe(true);
		expect((await pendingActivations([userId])).has(userId)).toBe(true);
		expect(await mayReceiveMagicLink(email)).toBe(false);
		expect(await mayReceiveMagicLink(email, true)).toBe(false);

		const r = await resolveRegistration(token);
		expect(r.ok && r.info).toMatchObject({
			kind: "activate",
			email,
			invitationId,
			organization: "Aktivierung Test",
			role: "editor",
		});

		await client`update "user" set banned = true where id = ${userId}`;
		expect(await resolveRegistration(token)).toEqual({
			ok: false,
			error: "blocked",
		});
		await client`update "user" set banned = true, ban_expires = now() - interval '1 minute' where id = ${userId}`;
		expect((await resolveRegistration(token)).ok).toBe(true);
		await client`update "user" set banned = false, ban_expires = null where id = ${userId}`;

		await consumeRegistrationToken(token);
		expect(await hasPendingActivation(userId)).toBe(false);
		expect(await mayReceiveMagicLink(email)).toBe(true);
		expect((await resolveRegistration(token)).ok).toBe(false);
	});
});
