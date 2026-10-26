import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { orgSettings } from "@/db/schema";
import { provisionSsoUser, ssoGateForUser } from "@/lib/auth/sso-provisioning";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";

// Integrationstest (DATABASE_URL_TEST): SSO je Kunde (S1/S2). Neue Konten
// der bestätigten Domain werden Mitglied mit der Rolle aus den Gruppen;
// Rollenwechsel bei jeder Anmeldung, nie für Inhaber:innen; Ein-Org-Regel;
// Firmen-MFA nur, wenn eingeschaltet; „SSO erzwingen“ mit Notzugang.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("SSO-Provisionierung (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const domain = `sso-${stamp}.example`;
	const users: Record<string, string> = {};
	let orgId = "";
	let otherOrg = "";

	const inOrg = <T>(
		org: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org}, true)`);
			return fn(tx);
		});
	const newUser = async (key: string, email = `${key}@${domain}`) => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values (${key}, ${email}, true, now(), now()) returning id`;
		users[key] = u?.id as string;
		return users[key] as string;
	};
	const newSession = async (userId: string) => {
		const [s] = await client`
			insert into session (expires_at, token, created_at, updated_at, user_id)
			values (now() + interval '1 day', ${`t-${userId}-${Math.random()}`}, now(), now(), ${userId})
			returning id`;
		return s?.id as string;
	};
	const sessionOf = async (id: string) =>
		(
			await client`select active_organization_id, mfa_verified_at, mfa_org_id, step_up_at from session where id = ${id}`
		)[0];
	const roleOf = async (userId: string, org = orgId) =>
		(
			await client`select role from member where user_id = ${userId} and organization_id = ${org}`
		)[0]?.role ?? null;
	const setPolicy = (policy: Record<string, unknown>) =>
		inOrg(orgId, (tx) =>
			tx
				.update(orgSettings)
				.set({ ssoPolicy: policy })
				.where(eq(orgSettings.organizationId, orgId)),
		);
	const provider = () => ({
		providerId: `p-${stamp}`,
		organizationId: orgId,
		domain,
		issuer: "https://login.example",
		domainVerified: true,
	});
	const login = (
		userId: string,
		email: string,
		claims: Record<string, unknown>,
	) =>
		provisionSsoUser({
			user: { id: userId, email },
			userInfo: claims,
			token: { idToken: undefined },
			provider: provider(),
		});

	beforeAll(async () => {
		for (const name of ["SSO GmbH", "Andere GmbH"]) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${name}, ${`${name.split(" ")[0]?.toLowerCase()}-${stamp}`}, now())
				returning id`;
			if (!orgId) orgId = o?.id as string;
			else otherOrg = o?.id as string;
		}
		for (const org of [orgId, otherOrg]) {
			const wrapped = await wrapDek(await generateDek());
			await inOrg(org, (tx) =>
				tx.insert(orgSettings).values({
					organizationId: org,
					encryptedDek: wrapped.wrapped,
					keyVersion: wrapped.keyVersion,
				}),
			);
		}
		await client`
			insert into sso_provider (issuer, provider_id, organization_id, domain, domain_verified)
			values ('https://login.example', ${`p-${stamp}`}, ${orgId}, ${domain}, true)`;
		await setPolicy({
			trustIdpMfa: true,
			defaultRole: "employee",
			groupRoles: [{ group: "klick-edit", role: "editor" }],
		});
	});

	afterAll(async () => {
		const ids = Object.values(users);
		if (ids.length) await client`delete from "user" where id = any(${ids})`;
		if (orgId) await client`delete from organization where id = ${orgId}`;
		if (otherOrg) await client`delete from organization where id = ${otherOrg}`;
		await client.end();
	});

	it("neues Konto: Mitglied mit Rolle aus Gruppen, Org und Firmen-MFA an der Sitzung", async () => {
		const uid = await newUser("mara");
		const sid = await newSession(uid);
		await login(uid, `mara@${domain}`, {
			groups: ["Klick-Edit"],
			amr: ["pwd", "mfa"],
		});
		expect(await roleOf(uid)).toBe("editor");
		const s = await sessionOf(sid);
		expect(s?.active_organization_id).toBe(orgId);
		expect(s?.mfa_verified_at).not.toBeNull();
		// Firmen-MFA gilt nur in der Org des Anbieters (S1)
		expect(s?.mfa_org_id).toBe(orgId);
		expect(new Date(s?.step_up_at).getTime()).toBe(0);
	});

	it("Rolle folgt den Gruppen bei jeder Anmeldung, nie für Inhaber:innen", async () => {
		const uid = users.mara as string;
		await newSession(uid);
		await login(uid, `mara@${domain}`, { groups: [] });
		expect(await roleOf(uid)).toBe("employee");
		const owner = await newUser("chefin");
		await client`insert into member (organization_id, user_id, role, created_at) values (${orgId}, ${owner}, 'owner', now())`;
		await newSession(owner);
		await login(owner, `chefin@${domain}`, { groups: [] });
		expect(await roleOf(owner)).toBe("owner");
	});

	it("ohne Firmen-MFA-Freigabe bleibt die Sitzung unbestätigt", async () => {
		await setPolicy({ trustIdpMfa: false, defaultRole: "viewer" });
		const uid = await newUser("ben");
		const sid = await newSession(uid);
		await login(uid, `ben@${domain}`, { amr: ["mfa"] });
		expect(await roleOf(uid)).toBe("viewer");
		expect((await sessionOf(sid))?.mfa_verified_at).toBeNull();
	});

	it("Ein-Org-Regel und fremde Domain: kein Beitritt", async () => {
		const uid = await newUser("eva");
		await client`insert into member (organization_id, user_id, role, created_at) values (${otherOrg}, ${uid}, 'editor', now())`;
		await newSession(uid);
		await login(uid, `eva@${domain}`, { groups: ["klick-edit"] });
		expect(await roleOf(uid)).toBeNull();
		const foreign = await newUser("fremd", `fremd-${stamp}@anders.example`);
		await login(foreign, `fremd-${stamp}@anders.example`, {});
		expect(await roleOf(foreign)).toBeNull();
	});

	it("Firmen-MFA nur für Mitglieder der Org des Anbieters (S1)", async () => {
		await setPolicy({ trustIdpMfa: true, defaultRole: "employee" });
		const uid = await newUser("ida");
		await client`insert into member (organization_id, user_id, role, created_at) values (${otherOrg}, ${uid}, 'editor', now())`;
		const sid = await newSession(uid);
		await login(uid, `ida@${domain}`, { amr: ["mfa"] });
		expect(await roleOf(uid)).toBeNull();
		expect((await sessionOf(sid))?.mfa_verified_at).toBeNull();
	});

	it("Google ohne passendes hd: keine Sitzung (S8)", async () => {
		const uid = await newUser("gina");
		await expect(
			provisionSsoUser({
				user: { id: uid, email: `gina@${domain}` },
				userInfo: { hd: "gmail.com" },
				token: { idToken: undefined },
				provider: { ...provider(), issuer: "https://accounts.google.com" },
			}),
		).rejects.toMatchObject({ body: { code: "SSO_DOMAIN_MISMATCH" } });
		expect(await roleOf(uid)).toBeNull();
	});

	it("SSO erzwingen: nur der SSO-Rückruf, Inhaber:innen mit Notzugang", async () => {
		const mara = users.mara as string;
		const owner = users.chefin as string;
		expect(await ssoGateForUser(mara, "/passkey/verify-authentication")).toBe(
			"allow",
		);
		await setPolicy({ enforce: true });
		expect(await ssoGateForUser(mara, "/passkey/verify-authentication")).toBe(
			"deny",
		);
		expect(await ssoGateForUser(mara, "/magic-link/verify")).toBe("deny");
		expect(await ssoGateForUser(mara, "/sso/callback/:providerId")).toBe(
			"allow",
		);
		expect(await ssoGateForUser(owner, "/passkey/verify-authentication")).toBe(
			"bypass",
		);
		expect(
			await ssoGateForUser(users.fremd as string, "/magic-link/verify"),
		).toBe("allow");
	});
});
