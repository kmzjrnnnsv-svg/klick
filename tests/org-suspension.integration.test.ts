import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { auditLog, orgSettings } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import {
	accountExists,
	deleteEmptyOrganization,
	insertMembers,
	insertOrganization,
	internalMembersOf,
} from "@/lib/db/admin-orgs";
import {
	orgAccount,
	saveOrgAccount,
	setOrgSuspension,
} from "@/lib/db/org-accounts";
import { seedEmptyOrg } from "@/lib/org/seed";
import {
	invalidateSuspension,
	orgSuspended,
	orgSuspension,
} from "@/lib/org/suspension";

// Integrationstest (DATABASE_URL_TEST): Vertrag und Sperre einer
// Organisation (Admin-Portal, Teil 2). Sperre wirkt sofort nach dem
// Verwerfen des Zwischenspeichers, steht in der Kette der Org und liefert
// die Inhaber:innen für die Mitteilung; fremde Orgs bleiben unberührt.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Sperre einer Organisation (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	const u = { admin: "", owner: "", editor: "" };
	const actor = () => ({ userId: u.admin, ip: null, userAgent: null });
	const orgActions = (orgId: string) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return (
				await tx
					.select({ action: auditLog.action })
					.from(auditLog)
					.where(eq(auditLog.organizationId, orgId))
			).map((r) => r.action);
		});

	beforeAll(async () => {
		for (const key of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, role, created_at, updated_at)
				values (${key}, ${`sp-${key}-${stamp}@example.org`}, true, ${key === "admin" ? "admin" : "user"}, now(), now())
				returning id`;
			u[key] = row?.id;
		}
		for (const name of ["A", "B"]) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Sperre ${name}`}, ${`sperre-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		await client`insert into member (organization_id, user_id, role, created_at) values
			(${orgA}, ${u.owner}, 'owner', now()),
			(${orgA}, ${u.editor}, 'editor', now())`;
	});

	afterAll(async () => {
		await client`delete from organization where id in (${orgA}, ${orgB})`;
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end();
	});

	it("ohne Zeile nicht gesperrt", async () => {
		expect(await orgSuspended(orgA)).toBe(false);
		expect(await orgAccount(orgA)).toBeNull();
	});

	it("Sperren: sofort wirksam, in der Kette der Org, Inhaber:innen zurück", async () => {
		const out = await setOrgSuspension(actor(), orgA, {
			suspend: true,
			reason: "Rechnung seit 60 Tagen offen",
		});
		expect(out.changed).toBe(true);
		expect(out.owners.map((o) => o.email)).toEqual([
			`sp-owner-${stamp}@example.org`,
		]);
		invalidateSuspension(orgA);
		expect(await orgSuspension(orgA)).toEqual({
			suspended: true,
			reason: "Rechnung seit 60 Tagen offen",
		});
		expect(await orgSuspended(orgB)).toBe(false);
		expect(await orgActions(orgA)).toContain("org.suspended");
		const chain = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgA}, true)`);
			return verifyAuditChain(tx, orgA);
		});
		expect(chain.ok).toBe(true);
		// zweimal sperren ändert nichts
		const again = await setOrgSuspension(actor(), orgA, {
			suspend: true,
			reason: "noch einmal",
		});
		expect(again.changed).toBe(false);
	});

	it("Vertrag ändern lässt die Sperre stehen; Entsperren hebt sie auf", async () => {
		await saveOrgAccount(actor(), orgA, {
			status: "active",
			auditPassedAt: new Date("2026-09-15T00:00:00Z"),
			note: "intern",
		});
		const acc = await orgAccount(orgA);
		expect(acc?.suspendedAt).not.toBeNull();
		expect(acc?.note).toBe("intern");
		const out = await setOrgSuspension(actor(), orgA, { suspend: false });
		expect(out.changed).toBe(true);
		invalidateSuspension(orgA);
		expect(await orgSuspended(orgA)).toBe(false);
		expect(await orgActions(orgA)).toContain("org.resumed");
		// Vertragsänderungen stehen nur im Plattform-Protokoll
		expect(await orgActions(orgA)).not.toContain("org.account_updated");
	});

	it("Organisation anlegen: Kurzname nur einmal, leere Org wieder weg", async () => {
		const slug = `neu-${stamp}`;
		const id = await insertOrganization({ name: "Neu GmbH", slug });
		expect(id).toBeTruthy();
		expect(await insertOrganization({ name: "Doppelt", slug })).toBeNull();
		expect(await accountExists(`SP-OWNER-${stamp}@example.org`)).toBe(true);
		// mit Mitglied bleibt sie stehen
		await deleteEmptyOrganization(orgA);
		expect(
			(await client`select 1 from organization where id = ${orgA}`).length,
		).toBe(1);
		await deleteEmptyOrganization(id ?? "");
		expect(
			(await client`select 1 from organization where id = ${id}`).length,
		).toBe(0);
	});

	it("Neu beginnen: interne Mitglieder und Grundausstattung in der neuen Org", async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		try {
			await client`insert into member (organization_id, user_id, role, created_at) values (${orgB}, ${u.admin}, 'auditor', now())`;
			const kept = await internalMembersOf(orgA);
			expect(kept.map((m) => m.role).sort()).toEqual(["editor", "owner"]);
			expect(await internalMembersOf(orgB)).toEqual([]);
			const fresh = await insertOrganization({
				name: "Neu begonnen",
				slug: `neu-begonnen-${stamp}`,
			});
			expect(fresh).toBeTruthy();
			const id = fresh ?? "";
			await insertMembers(id, kept);
			const seeded = await db.transaction(async (tx) => {
				await tx.execute(sql`select set_config('app.org_id', ${id}, true)`);
				return seedEmptyOrg(tx, {
					orgId: id,
					userId: u.owner,
					flags: { termsAcceptedAt: "2026-10-01T00:00:00.000Z" },
				});
			});
			expect(seeded.keyVersion).toBe(1);
			const settings = await db.transaction(async (tx) => {
				await tx.execute(sql`select set_config('app.org_id', ${id}, true)`);
				return tx
					.select({ flags: orgSettings.setupFlags })
					.from(orgSettings)
					.where(eq(orgSettings.organizationId, id));
			});
			expect(settings[0]?.flags.termsAcceptedAt).toBe(
				"2026-10-01T00:00:00.000Z",
			);
			expect(settings[0]?.flags.setupStartedAt).toBeTruthy();
			expect((await internalMembersOf(id)).length).toBe(2);
			await client`delete from organization where id = ${id}`;
		} finally {
			setKmsForTests(null);
		}
	});
});
