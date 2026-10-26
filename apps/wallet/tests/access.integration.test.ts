import { db } from "@wallet/db";
import { passkey, user } from "@wallet/db/auth-schema";
import { auditLog, members, notifications, orgs } from "@wallet/db/schema";
import { passkeyConfirmOptions } from "@wallet/lib/auth/passkey-confirm";
import { completeLinkRegistration } from "@wallet/lib/auth/passkey-link";
import {
	deviceBoundByUser,
	userOnlyDeviceBound,
} from "@wallet/lib/auth/security-keys";
import { readOrg, withPlatform } from "@wallet/lib/db/with-org";
import {
	orgAccessPolicy,
	userRequiresSecurityKey,
} from "@wallet/lib/orgs/access";
import { updateAccessPolicy } from "@wallet/lib/orgs/access-service";
import { createOrg } from "@wallet/lib/orgs/service";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Zugangsregeln je Wallet-Org (Härtung W) gegen wallet_test: Speichern mit
// Aussperr-Schutz, Audit und Mitteilung, Sicherheitsschlüssel-Pflicht für
// alle Mitglieder (Registrierung, Bestätigung), Zwischenspeicher.

const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

d("Zugangsregeln both.money (Postgres)", () => {
	const stamp = Date.now();
	let orgId = "";
	let owner = "";
	let operator = "";
	const ctx = () => ({ orgId, userId: owner });
	const open = {
		network: [],
		securityKeysOnly: false,
		allowedAssets: null,
		mandatesRequired: false,
	};

	beforeAll(async () => {
		const users = await db
			.insert(user)
			.values([
				{ name: "Inhaberin", email: `owner-${stamp}@example.org` },
				{ name: "Bedienung", email: `op-${stamp}@example.org` },
			])
			.returning({ id: user.id });
		owner = users[0]?.id ?? "";
		operator = users[1]?.id ?? "";
		const created = await createOrg(
			{ userId: null, reason: "Test: Zugang" },
			{
				name: "Zugang GmbH",
				slug: `zugang-${stamp}`,
				isOperator: true,
				owner: { userId: owner },
			},
		);
		orgId = created.id;
		await withPlatform({ userId: null, reason: "Test: Mitglied" }, (tx) =>
			tx
				.insert(members)
				.values({ organizationId: orgId, userId: operator, role: "operator" }),
		);
		// Inhaberin: YubiKey; Bedienung: Passkey aus dem iCloud-Schlüsselbund
		await db.insert(passkey).values([
			{
				publicKey: "x",
				userId: owner,
				credentialID: `cred-key-${stamp}`,
				counter: 0,
				deviceType: "singleDevice",
				backedUp: false,
			},
			{
				publicKey: "x",
				userId: operator,
				credentialID: `cred-sync-${stamp}`,
				counter: 0,
				deviceType: "multiDevice",
				backedUp: true,
			},
		]);
	});

	afterAll(async () => {
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		await db.delete(user).where(inArray(user.id, [owner, operator]));
	});

	it("Schlüssel je Person", async () => {
		expect(await userOnlyDeviceBound(owner)).toBe(true);
		expect(await userOnlyDeviceBound(operator)).toBe(false);
		const m = await deviceBoundByUser([owner, operator]);
		expect(m.get(owner)).toBe(true);
		expect(m.get(operator)).toBe(false);
	});

	it("IP-Liste: eigene Adresse muss drin liegen", async () => {
		const input = {
			...open,
			network: [{ cidr: "10.9.0.7/24", note: "WireGuard" }],
		};
		const locked = await updateAccessPolicy(ctx(), input, {
			ip: "198.51.100.7",
			onlyDeviceBound: true,
		});
		expect(locked).toEqual({
			ok: false,
			error: "lockout",
			fieldErrors: undefined,
		});
		const res = await updateAccessPolicy(ctx(), input, {
			ip: "10.9.0.20",
			onlyDeviceBound: true,
		});
		expect(res).toEqual({ ok: true, data: { changes: ["network_tightened"] } });
		const p = await orgAccessPolicy(orgId);
		// Host-Bits genullt gespeichert
		expect(p.network.members).toEqual([
			{ cidr: "10.9.0.0/24", note: "WireGuard" },
		]);
		// gleiche Liste noch einmal: keine Änderung, kein Eintrag
		const again = await updateAccessPolicy(ctx(), input, {
			ip: "10.9.0.20",
			onlyDeviceBound: true,
		});
		expect(again).toEqual({ ok: true, data: { changes: [] } });
		const rows = await readOrg(ctx(), (tx) =>
			tx
				.select({ after: auditLog.after })
				.from(auditLog)
				.where(eq(auditLog.action, "org.access_policy_changed")),
		);
		expect(rows).toHaveLength(1);
	});

	it("nur Sicherheitsschlüssel: nicht ohne eigenen, dann für alle Mitglieder", async () => {
		const input = {
			...open,
			network: [{ cidr: "10.9.0.0/24", note: "WireGuard" }],
			securityKeysOnly: true,
		};
		expect(
			await updateAccessPolicy(ctx(), input, {
				ip: "10.9.0.20",
				onlyDeviceBound: false,
			}),
		).toMatchObject({ ok: false, error: "security_key_self" });
		expect(await userRequiresSecurityKey(operator)).toBe(false);
		const res = await updateAccessPolicy(ctx(), input, {
			ip: "10.9.0.20",
			onlyDeviceBound: true,
		});
		expect(res).toEqual({ ok: true, data: { changes: ["security_keys_on"] } });
		// Zwischenspeicher sofort ungültig
		expect(await userRequiresSecurityKey(operator)).toBe(true);

		// Bestätigung: synchronisierte Passkeys werden gar nicht angeboten
		expect(
			await passkeyConfirmOptions({
				userId: operator,
				sessionId: `s-${stamp}`,
				purpose: "stepup",
			}),
		).toBeNull();
		const opts = await passkeyConfirmOptions({
			userId: owner,
			sessionId: `s-${stamp}`,
			purpose: "stepup",
		});
		expect(opts?.allowCredentials?.map((c) => c.id)).toEqual([
			`cred-key-${stamp}`,
		]);

		// weiterer Passkey zur eigenen Sitzung: synchronisiert abgelehnt
		await expect(
			completeLinkRegistration({
				raw: null,
				context: null,
				userVerified: true,
				credential: { deviceType: "multiDevice", backedUp: true },
				user: { id: operator },
				createUser: async () => ({ id: "-" }),
			}),
		).rejects.toMatchObject({ body: { code: "SECURITY_KEY_REQUIRED" } });
		await expect(
			completeLinkRegistration({
				raw: null,
				context: null,
				userVerified: true,
				credential: { deviceType: "singleDevice", backedUp: false },
				user: { id: operator },
				createUser: async () => ({ id: "-" }),
			}),
		).resolves.toBeUndefined();
	});

	it("Lockerung meldet die Inhaber:innen, Verschärfung alle", async () => {
		const res = await updateAccessPolicy(
			ctx(),
			{ ...open, allowedAssets: ["USDC", "EURC"] },
			{ ip: "10.9.0.20", onlyDeviceBound: true },
		);
		expect(res).toEqual({
			ok: true,
			data: {
				changes: ["network_relaxed", "security_keys_off", "assets_tightened"],
			},
		});
		const p = await orgAccessPolicy(orgId);
		expect(p.allowedAssets).toEqual(["USDC", "EURC"]);
		expect(p.network.members).toEqual([]);
		const notes = await readOrg(ctx(), (tx) =>
			tx
				.select({ userId: notifications.userId, kind: notifications.kind })
				.from(notifications)
				.where(
					and(
						eq(notifications.organizationId, orgId),
						eq(notifications.link, "/settings/access"),
					),
				),
		);
		// nie an die handelnde Person; Lockerung nur an Inhaber:innen (hier
		// keine weitere), Verschärfungen davor an die Bedienung
		expect(notes.every((n) => n.userId !== owner)).toBe(true);
		expect(notes.filter((n) => n.kind === "security_alert")).toEqual([]);
		expect(notes.filter((n) => n.userId === operator).length).toBe(2);
	});
});
