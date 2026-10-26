import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { auditLog, notifications, platformAccessGrants } from "@/db/schema";
import type { OrgContext, PlatformAdminContext } from "@/lib/auth/guards";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import {
	impersonationAllowed,
	remindOverdueReports,
} from "@/lib/db/platform-access";
import {
	consumeGrant,
	consumeGrantsForAll,
	decidePlatformAccess,
	requestPlatformAccess,
	revokePlatformAccess,
	viewableOrgs,
} from "@/lib/platform-access/service";

// Integrationstest (DATABASE_URL_TEST): Lockbox (Härtung A3). Antrag wirkt
// erst mit Freigabe; Freigabe nur durch Inhaber:in, nie für sich selbst;
// Nutzung und Entscheidung stehen in der Kette der Org; die betroffene
// Person darf beenden; Notfall wirkt sofort; Wartezeit nur, wenn niemand
// freigeben kann, und erst nach 24 h.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Lockbox: Plattform-Zugriff nur mit Freigabe (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	const u = { admin: "", owner: "", editor: "", solo: "" };

	const admin = (): PlatformAdminContext => ({
		userId: u.admin,
		email: "admin@example.org",
		name: "Admin",
		ip: null,
		userAgent: null,
		sessionId: "s-admin",
		stepUpFresh: true,
	});
	const member = (
		userId: string,
		orgId: string,
		orgRole: OrgContext["orgRole"],
	) => ({ userId, orgId, orgRole, ip: null, userAgent: null }) as OrgContext;
	const actor = () => ({ userId: u.admin, ip: null, userAgent: null });
	const base = {
		reason: "Fehler beim Export nachstellen",
		durationMinutes: 60,
		emergency: null,
		waiting: false,
	};
	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const actions = (orgId: string) =>
		inOrg(orgId, async (tx) =>
			(
				await tx
					.select({ action: auditLog.action })
					.from(auditLog)
					.where(eq(auditLog.organizationId, orgId))
			).map((r) => r.action),
		);

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		for (const key of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, role, created_at, updated_at)
				values (${key}, ${`lb-${key}-${stamp}@example.org`}, true, ${key === "admin" ? "admin" : "user"}, now(), now())
				returning id`;
			u[key] = row?.id;
		}
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Lockbox ${name}`}, ${`lockbox-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		await client`insert into member (organization_id, user_id, role, created_at) values
			(${orgA}, ${u.owner}, 'owner', now()),
			(${orgA}, ${u.editor}, 'editor', now()),
			(${orgB}, ${u.solo}, 'owner', now())`;
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client`delete from organization where id in (${orgA}, ${orgB})`;
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end();
	});

	it("Antrag wirkt erst mit Freigabe; Benachrichtigung und Kette der Org", async () => {
		const res = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgA,
			scope: "impersonate",
			targetUserId: u.editor,
		});
		expect(res.ok).toBe(true);
		const id = res.ok ? res.data.id : "";
		expect(
			await consumeGrant({
				orgId: orgA,
				scope: "impersonate",
				targetUserId: u.editor,
				actor: actor(),
				purpose: "Test",
			}),
		).toBeNull();
		const notes = await inOrg(orgA, (tx) =>
			tx
				.select({ userId: notifications.userId })
				.from(notifications)
				.where(
					and(
						eq(notifications.organizationId, orgA),
						eq(notifications.kind, "platform_access"),
					),
				),
		);
		expect(notes.map((n) => n.userId)).toEqual([u.owner]);
		expect(await actions(orgA)).toContain("platform_access.requested");

		// Bearbeiter:in darf nicht freigeben, die Inhaber:in schon
		const denied = await decidePlatformAccess(
			member(u.editor, orgA, "editor"),
			{
				id,
				approve: true,
				note: null,
			},
		);
		expect(denied).toEqual({ ok: false, error: "lockbox_forbidden" });
		const ok = await decidePlatformAccess(member(u.owner, orgA, "owner"), {
			id,
			approve: true,
			note: null,
		});
		expect(ok.ok).toBe(true);

		const grant = await consumeGrant({
			orgId: orgA,
			scope: "impersonate",
			targetUserId: u.editor,
			actor: actor(),
			purpose: "Test",
		});
		expect(grant?.id).toBe(id);
		expect(grant?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
		// andere Person: keine Freigabe
		expect(
			await consumeGrant({
				orgId: orgA,
				scope: "impersonate",
				targetUserId: u.owner,
				actor: actor(),
				purpose: "Test",
			}),
		).toBeNull();
		const log = await actions(orgA);
		expect(log).toContain("platform_access.approved");
		expect(log).toContain("platform_access.used");

		// die betroffene Person beendet
		expect(
			(await revokePlatformAccess(member(u.editor, orgA, "editor"), id)).ok,
		).toBe(true);
		expect(
			await consumeGrant({
				orgId: orgA,
				scope: "impersonate",
				targetUserId: u.editor,
				actor: actor(),
				purpose: "Test",
			}),
		).toBeNull();
	});

	it("niemand entscheidet über einen Zugriff auf sich selbst", async () => {
		const res = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgA,
			scope: "reset_access",
			targetUserId: u.owner,
		});
		const id = res.ok ? res.data.id : "";
		expect(
			await decidePlatformAccess(member(u.owner, orgA, "owner"), {
				id,
				approve: true,
				note: null,
			}),
		).toEqual({ ok: false, error: "lockbox_self" });
	});

	it("Wartezeit nur ohne andere Entscheider:innen, wirkt erst nach 24 h", async () => {
		expect(
			await requestPlatformAccess(admin(), {
				...base,
				orgId: orgA,
				scope: "reset_access",
				targetUserId: u.editor,
				waiting: true,
			}),
		).toEqual({ ok: false, error: "lockbox_waiting_not_needed" });
		const res = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgB,
			scope: "reset_access",
			targetUserId: u.solo,
			waiting: true,
		});
		expect(res.ok).toBe(true);
		const [row] = await inOrg(orgB, (tx) =>
			tx
				.select()
				.from(platformAccessGrants)
				.where(eq(platformAccessGrants.organizationId, orgB)),
		);
		expect(row?.status).toBe("waiting");
		expect(
			await consumeGrant({
				orgId: orgB,
				scope: "reset_access",
				targetUserId: u.solo,
				actor: actor(),
				purpose: "Test",
			}),
		).toBeNull();
		// die betroffene Person bricht ab
		expect(
			(await revokePlatformAccess(member(u.solo, orgB, "owner"), row?.id ?? ""))
				.ok,
		).toBe(true);
	});

	it("Notfall wirkt sofort und steht in der Kette der Org", async () => {
		const res = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgA,
			scope: "view",
			targetUserId: null,
			emergency: "security_incident",
		});
		expect(res.ok).toBe(true);
		expect(await viewableOrgs(actor(), "Test")).toContain(orgA);
		expect(await viewableOrgs(actor(), "Test")).not.toContain(orgB);
		expect(await actions(orgA)).toContain("platform_access.emergency");

		// Bericht überfällig: Erinnerung an die Plattform-Admins, einmal am Tag
		const id = res.ok ? res.data.id : "";
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgA}, true)`;
			await tx`update platform_access_grants
				set report_due_at = now() - interval '1 hour' where id = ${id}`;
		});
		expect(await remindOverdueReports(new Date())).toBeGreaterThan(0);
		expect(await remindOverdueReports(new Date())).toBe(0);
		const key = `lockbox-report:${id}`;
		const reminded = await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			const rows = await tx`
				select user_id from notifications where payload->>'dedupeKey' = ${key}`;
			await tx`delete from notifications where payload->>'dedupeKey' = ${key}`;
			return rows;
		});
		expect(reminded.map((r) => r.user_id)).toContain(u.admin);
	});

	it("Zugriff auf eine Person mit mehreren Orgs braucht jede Freigabe", async () => {
		// Bearbeiter:in aus A ist auch Berater:in in B
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${orgB}, ${u.editor}, 'consultant', now())`;
		const use = {
			scope: "reset_access" as const,
			targetUserId: u.editor,
			actor: actor(),
			purpose: "Test",
		};
		const a = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgA,
			scope: "reset_access",
			targetUserId: u.editor,
		});
		await decidePlatformAccess(member(u.owner, orgA, "owner"), {
			id: a.ok ? a.data.id : "",
			approve: true,
			note: null,
		});
		// nur A hat freigegeben: nichts wird verbraucht
		const usedBefore = (await actions(orgA)).filter(
			(x) => x === "platform_access.used",
		).length;
		expect(await consumeGrantsForAll([orgA, orgB], use)).toBe(false);
		expect(
			(await actions(orgA)).filter((x) => x === "platform_access.used").length,
		).toBe(usedBefore);
		const b = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgB,
			scope: "reset_access",
			targetUserId: u.editor,
		});
		await decidePlatformAccess(member(u.solo, orgB, "owner"), {
			id: b.ok ? b.data.id : "",
			approve: true,
			note: null,
		});
		expect(await consumeGrantsForAll([orgA, orgB], use)).toBe(true);
		// Zurücksetzen gilt einmal (K7): derselbe Vorgang geht nicht zweimal
		expect(await consumeGrantsForAll([orgA, orgB], use)).toBe(false);
		await client`delete from member where organization_id = ${orgB} and user_id = ${u.editor}`;
	});

	it("Impersonation gilt nur solange die Freigabe, Widerruf beendet die Sitzung", async () => {
		const res = await requestPlatformAccess(admin(), {
			...base,
			orgId: orgA,
			scope: "impersonate",
			targetUserId: u.owner,
		});
		const id = res.ok ? res.data.id : "";
		expect(await impersonationAllowed(u.owner, orgA, u.admin)).toBe(false);
		// die Inhaberin ist Ziel, also entscheidet sie nicht: GL fehlt in A,
		// darum hier direkt freigeben (Regeln dafür testet platform-access.test)
		await inOrg(orgA, (tx) =>
			tx
				.update(platformAccessGrants)
				.set({
					status: "approved",
					expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				})
				.where(eq(platformAccessGrants.id, id)),
		);
		expect(await impersonationAllowed(u.owner, orgA, u.admin)).toBe(true);
		expect(await impersonationAllowed(u.owner, orgB, u.admin)).toBe(false);
		// die Freigabe gilt der beantragenden Person, nicht dem ganzen Betrieb
		expect(await impersonationAllowed(u.owner, orgA, u.editor)).toBe(false);
		await client`insert into session (expires_at, token, created_at, updated_at, user_id, impersonated_by)
			values (now() + interval '1 hour', ${`imp-${stamp}`}, now(), now(), ${u.owner}, ${u.admin})`;
		await client`insert into session (expires_at, token, created_at, updated_at, user_id)
			values (now() + interval '1 hour', ${`own-${stamp}`}, now(), now(), ${u.owner})`;
		expect(
			(await revokePlatformAccess(member(u.owner, orgA, "owner"), id)).ok,
		).toBe(true);
		expect(await impersonationAllowed(u.owner, orgA, u.admin)).toBe(false);
		const left =
			await client`select token from session where user_id = ${u.owner}`;
		expect(left.map((r) => r.token)).toEqual([`own-${stamp}`]);
		await client`delete from session where user_id = ${u.owner}`;
	});

	it("ungültige Anträge werden abgelehnt", async () => {
		expect(
			await requestPlatformAccess(admin(), {
				...base,
				orgId: orgA,
				scope: "impersonate",
				targetUserId: u.solo,
			}),
		).toEqual({ ok: false, error: "lockbox_target_not_member" });
		expect(
			await requestPlatformAccess(admin(), {
				...base,
				orgId: orgA,
				scope: "view",
				targetUserId: null,
				reason: "kurz",
			}),
		).toEqual({ ok: false, error: "lockbox_reason" });
	});
});
