import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@wallet/db";
import { passkey, user } from "@wallet/db/auth-schema";
import {
	members,
	orgs,
	payoutMandates,
	walletAccounts,
	walletAddressBook,
	walletPayouts,
} from "@wallet/db/schema";
import { baseURL, rpID } from "@wallet/lib/auth/config";
import { mutateOrg, readOrg, withPlatform } from "@wallet/lib/db/with-org";
import { createOrg } from "@wallet/lib/orgs/service";
import {
	listMandates,
	mandateForPayout,
	prepareMandate,
	revokeMandate,
	submitMandate,
} from "@wallet/lib/wallet/mandates";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SoftSecurityKey } from "../../../tests/helpers/security-key";

// Vollmacht (Härtung W, Schritt 1) gegen wallet_test: Inhaberin stellt sie
// mit einem Sicherheitsschlüssel aus, jede Auszahlung der Bedienung prüft
// Rahmen, Restbetrag und Unterschrift; synchronisierte Schlüssel,
// geänderter Text und herabgestufte Ausstellerin zählen nicht.

const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

const DEST = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const USDC = (n: number) => BigInt(n) * 1_000_000n;

d("Vollmachten both.money (Postgres)", () => {
	const stamp = Date.now();
	const key = new SoftSecurityKey();
	const synced = new SoftSecurityKey({ be: true, bs: true });
	let orgId = "";
	let owner = "";
	let operator = "";
	let accountId = "";
	let destId = "";
	let mandateId = "";
	const sessionId = `sess-${stamp}`;
	const ctx = () => ({ orgId, userId: owner, sessionId });

	const respond = (
		k: SoftSecurityKey,
		challenge: string,
	): AuthenticationResponseJSON => {
		const a = k.assert({
			rpId: rpID,
			origin: baseURL,
			challenge: Buffer.from(challenge, "base64url"),
		});
		return {
			id: a.credId,
			rawId: a.credId,
			type: "public-key",
			clientExtensionResults: {},
			response: {
				authenticatorData: a.authenticatorData,
				clientDataJSON: a.clientDataJSON,
				signature: a.signature,
			},
		};
	};
	const input = {
		granteeUserId: "",
		network: "ethereum_sepolia" as const,
		asset: "USDC" as const,
		perPayout: "100",
		total: "250",
		destinationIds: [] as string[],
		days: 30,
	};
	const check = (amount: bigint, destination = DEST, userId = operator) =>
		readOrg({ orgId, userId: null }, (tx) =>
			mandateForPayout(tx, {
				orgId,
				userId,
				network: "ethereum_sepolia",
				asset: "USDC",
				amount,
				destination,
				now: new Date(),
			}),
		);
	const spend = (amount: bigint, status: "approved" | "cancelled") =>
		mutateOrg({ orgId, userId: operator }, async (tx) => {
			await tx.insert(walletPayouts).values({
				organizationId: orgId,
				accountId,
				addressBookId: destId,
				asset: "USDC",
				amount: amount.toString(),
				destination: DEST,
				destinationLabel: "Lieferant",
				feeCap: "1",
				status,
				intentId: `i-${Math.random()}`,
				intentText: "-",
				expiresAt: new Date(Date.now() + 3600_000),
				mandateId,
			});
			return { result: null, audit: [] };
		});

	beforeAll(async () => {
		const users = await db
			.insert(user)
			.values([
				{ name: "Inhaberin", email: `m-owner-${stamp}@example.org` },
				{ name: "Bedienung", email: `m-op-${stamp}@example.org` },
			])
			.returning({ id: user.id });
		owner = users[0]?.id ?? "";
		operator = users[1]?.id ?? "";
		orgId = (
			await createOrg(
				{ userId: null, reason: "Test: Vollmacht" },
				{
					name: "Vollmacht GmbH",
					slug: `vollmacht-${stamp}`,
					isOperator: true,
					owner: { userId: owner },
				},
			)
		).id;
		await withPlatform({ userId: null, reason: "Test: Mitglied" }, (tx) =>
			tx
				.insert(members)
				.values({ organizationId: orgId, userId: operator, role: "operator" }),
		);
		await db.insert(passkey).values([
			{
				publicKey: key.coseKey().toString("base64"),
				userId: owner,
				credentialID: key.id,
				counter: 0,
				deviceType: "singleDevice",
				backedUp: false,
			},
		]);
		await mutateOrg({ orgId, userId: owner }, async (tx) => {
			const [acc] = await tx
				.insert(walletAccounts)
				.values({
					organizationId: orgId,
					name: "Hot",
					network: "ethereum_sepolia",
					kind: "hot",
					accountKey: `xpub-${stamp}`,
					keyFingerprint: "00000000",
				})
				.returning({ id: walletAccounts.id });
			accountId = acc?.id ?? "";
			const [ab] = await tx
				.insert(walletAddressBook)
				.values({
					organizationId: orgId,
					network: "ethereum_sepolia",
					address: DEST,
					label: "Lieferant",
					intentId: `wl-${stamp}`,
					status: "active",
					expiresAt: new Date(Date.now() + 86_400_000),
				})
				.returning({ id: walletAddressBook.id });
			destId = ab?.id ?? "";
			return { result: null, audit: [] };
		});
		input.granteeUserId = operator;
		input.destinationIds = [destId];
	});

	afterAll(async () => {
		if (orgId)
			await withPlatform(
				{ userId: null, reason: "Test aufräumen" },
				async (tx) => {
					await tx
						.delete(walletPayouts)
						.where(eq(walletPayouts.organizationId, orgId));
					await tx
						.delete(payoutMandates)
						.where(eq(payoutMandates.organizationId, orgId));
					await tx.delete(orgs).where(eq(orgs.id, orgId));
				},
			);
		await db.delete(user).where(inArray(user.id, [owner, operator]));
	});

	it("ohne Vollmacht keine Auszahlung der Bedienung", async () => {
		expect(await check(USDC(10))).toEqual({
			ok: false,
			error: "mandate_required",
		});
	});

	it("nicht an sich selbst, nicht an Inhaber:innen, nur aktive Ziele", async () => {
		expect(
			await prepareMandate(ctx(), { ...input, granteeUserId: owner }),
		).toMatchObject({ ok: false, error: "mandate_self" });
		expect(
			await prepareMandate(ctx(), { ...input, perPayout: "300" }),
		).toMatchObject({ ok: false, error: "mandate_amounts" });
	});

	it("synchronisierter Schlüssel zählt nicht", async () => {
		await db.insert(passkey).values({
			publicKey: synced.coseKey().toString("base64"),
			userId: owner,
			credentialID: synced.id,
			counter: 0,
			deviceType: "multiDevice",
			backedUp: true,
		});
		const prep = await prepareMandate(ctx(), input);
		expect(prep.ok).toBe(true);
		if (!prep.ok) return;
		// nur der Sicherheitsschlüssel wird angeboten
		expect(prep.data.options.allowCredentials?.map((c) => c.id)).toEqual([
			key.id,
		]);
		const res = await submitMandate(
			ctx(),
			respond(synced, prep.data.options.challenge),
		);
		expect(res).toMatchObject({ ok: false, error: "security_key_required" });
		await db.delete(passkey).where(eq(passkey.credentialID, synced.id));
	});

	it("ausstellen mit Sicherheitsschlüssel", async () => {
		const prep = await prepareMandate(ctx(), input);
		expect(prep.ok).toBe(true);
		if (!prep.ok) return;
		expect(prep.data.summary.total).toContain("250");
		const res = await submitMandate(
			ctx(),
			respond(key, prep.data.options.challenge),
		);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		mandateId = res.data.id;
		// Challenge ist verbraucht
		expect(
			await submitMandate(ctx(), respond(key, prep.data.options.challenge)),
		).toMatchObject({ ok: false, error: "mandate_expired" });
		const list = await readOrg({ orgId, userId: owner }, (tx) =>
			listMandates(tx, orgId),
		);
		expect(list).toHaveLength(1);
		expect(list[0]?.grantee).toBe("Bedienung");
	});

	it("Rahmen, Restbetrag und Ziel", async () => {
		expect(await check(USDC(100))).toEqual({ ok: true, mandateId });
		expect(await check(USDC(101))).toEqual({
			ok: false,
			error: "mandate_per_payout",
		});
		expect(await check(USDC(10), OTHER)).toEqual({
			ok: false,
			error: "mandate_destination",
		});
		expect(await check(USDC(10), DEST, owner)).toEqual({
			ok: false,
			error: "mandate_required",
		});
		await spend(USDC(100), "approved");
		await spend(USDC(100), "approved");
		// abgebrochene zählen nicht
		await spend(USDC(100), "cancelled");
		expect(await check(USDC(50))).toEqual({ ok: true, mandateId });
		expect(await check(USDC(51))).toEqual({
			ok: false,
			error: "mandate_total",
		});
	});

	it("geänderter Text oder herabgestufte Ausstellerin: ungültig", async () => {
		const [row] = await readOrg({ orgId, userId: null }, (tx) =>
			tx.select().from(payoutMandates).where(eq(payoutMandates.id, mandateId)),
		);
		const original = row?.text ?? "";
		const forged = original.replace(
			"|100000000|250000000|",
			"|100000000|900000000|",
		);
		expect(forged).not.toBe(original);
		const setText = (text: string) =>
			mutateOrg({ orgId, userId: null }, async (tx) => {
				await tx
					.update(payoutMandates)
					.set({ text })
					.where(eq(payoutMandates.id, mandateId));
				return { result: null, audit: [] };
			});
		await setText(forged);
		expect(await check(USDC(10))).toEqual({
			ok: false,
			error: "mandate_signature",
		});
		await setText(original);
		expect(await check(USDC(10))).toEqual({ ok: true, mandateId });
		const setRole = (role: "owner" | "operator") =>
			withPlatform({ userId: null, reason: "Test: Rolle" }, (tx) =>
				tx
					.update(members)
					.set({ role })
					.where(
						and(eq(members.organizationId, orgId), eq(members.userId, owner)),
					),
			);
		await setRole("operator");
		expect(await check(USDC(10))).toEqual({
			ok: false,
			error: "mandate_signature",
		});
		await setRole("owner");
	});

	it("Widerruf beendet die Vollmacht sofort", async () => {
		expect(
			await revokeMandate(
				{ orgId, userId: owner },
				mandateId,
				"Projekt beendet",
			),
		).toEqual({ ok: true, data: undefined });
		expect(await check(USDC(10))).toEqual({
			ok: false,
			error: "mandate_required",
		});
		expect(
			await revokeMandate({ orgId, userId: owner }, mandateId, "noch einmal"),
		).toMatchObject({ ok: false, error: "notFound" });
	});
});
