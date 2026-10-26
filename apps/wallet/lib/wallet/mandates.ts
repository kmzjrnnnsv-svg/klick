import { randomBytes, randomUUID } from "node:crypto";
import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { passkey, user, verification } from "@wallet/db/auth-schema";
import {
	members,
	payoutMandates,
	walletAddressBook,
	walletPayouts,
} from "@wallet/db/schema";
import { baseURL, rpID } from "@wallet/lib/auth/config";
import { mutateOrg, type OrgCtx, type OrgTx } from "@wallet/lib/db/with-org";
import { notify } from "@wallet/lib/notifications/notify";
import { accessPolicyTx } from "@wallet/lib/orgs/access";
import { assetAllowed, deviceBound } from "@wallet/lib/orgs/access-policy";
import type {
	MandateInput,
	PreparedMandate,
} from "@wallet/lib/validation/mandates";
import { effectiveStatus } from "@wallet/lib/wallet/address-book";
import {
	and,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	notInArray,
	sql,
} from "drizzle-orm";
import { verifyAssertion } from "@/lib/signatures/verify";
import { type ActionResult, fail } from "@/lib/validation/common";
import { AmountError, parseAmount } from "@/lib/wallet/core/amount";
import type { AssetCode } from "@/lib/wallet/core/assets";
import { assetOf } from "@/lib/wallet/core/assets";
import {
	encodeMandate,
	type Mandate,
	type MandateUse,
	mandateChallenge,
	mandateCovers,
	normalizeDestinations,
	parseMandate,
} from "@/lib/wallet/core/mandate";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";

// Vollmachten (Härtung W, Schritt 1 in der App): eine Inhaber:in stellt sie
// aus und unterschreibt den kanonischen Text (lib/wallet/core/mandate.ts)
// mit einem gerätegebundenen Sicherheitsschlüssel. Jede Auszahlung der
// Bedienung prüft — wenn die Org es verlangt (Einstellungen > Zugang) — eine
// passende Vollmacht: Felder aus dem unterschriebenen Text, Unterschrift
// neu mit dem gespeicherten Schlüssel, Aussteller:in noch Inhaber:in,
// Restbetrag unter Zeilensperre. Schritt 2 (mandate-signer.ts): derselbe
// Text geht in den Signer, dessen Quorum ihn mit den eigenen
// Sicherheitsschlüsseln freigibt; erst dann gilt er dort als Vorab-Freigabe.

const PENDING_MS = 5 * 60 * 1000;
const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const pendingKey = (sessionId: string) => `mandate:${sessionId}`;

// Auszahlungen, die nicht (mehr) auf den Rahmen zählen
const NOT_SPENT = ["dropped", "failed", "cancelled", "expired"] as const;

async function issuerKeys(tx: OrgTx, userId: string) {
	const rows = await tx
		.select({
			id: passkey.credentialID,
			transports: passkey.transports,
			deviceType: passkey.deviceType,
			backedUp: passkey.backedUp,
		})
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return rows.filter(deviceBound);
}

async function roleOf(tx: OrgTx, orgId: string, userId: string) {
	const [m] = await tx
		.select({ role: members.role })
		.from(members)
		.where(and(eq(members.organizationId, orgId), eq(members.userId, userId)))
		.limit(1);
	return m?.role ?? null;
}

/**
 * Vollmacht vorbereiten: Felder prüfen, kanonischen Text bauen, Challenge
 * für den Sicherheitsschlüssel ausgeben. Der Text liegt 5 min an der Sitzung.
 */
export async function prepareMandate(
	ctx: OrgCtx & { userId: string; sessionId: string },
	input: MandateInput,
	now = new Date(),
): Promise<ActionResult<PreparedMandate>> {
	const info = assetOf(input.network, input.asset);
	if (!info) return fail("asset");
	let perPayout: bigint;
	let total: bigint;
	try {
		perPayout = parseAmount(input.perPayout.replace(",", "."), info.decimals);
		total = parseAmount(input.total.replace(",", "."), info.decimals);
	} catch (e) {
		if (e instanceof AmountError) return fail(`amount_${e.code}`);
		throw e;
	}
	if (perPayout > total) return fail("mandate_amounts");
	if (input.granteeUserId === ctx.userId) return fail("mandate_self");
	return mutateOrg<ActionResult<PreparedMandate>>(ctx, async (tx) => {
		const none = (r: ActionResult<PreparedMandate>) => ({
			result: r,
			audit: [],
		});
		if ((await roleOf(tx, ctx.orgId, input.granteeUserId)) !== "operator")
			return none(fail("mandate_grantee"));
		if (!assetAllowed(await accessPolicyTx(tx, ctx.orgId), input.asset))
			return none(fail("asset_not_allowed"));
		const book = await tx
			.select()
			.from(walletAddressBook)
			.where(
				and(
					eq(walletAddressBook.organizationId, ctx.orgId),
					eq(walletAddressBook.network, input.network),
					inArray(walletAddressBook.id, input.destinationIds),
				),
			);
		if (
			book.length !== new Set(input.destinationIds).size ||
			book.some((b) => effectiveStatus(b, now) !== "active")
		)
			return none(fail("destination_inactive"));
		const keys = await issuerKeys(tx, ctx.userId);
		if (keys.length === 0) return none(fail("security_key_required"));
		const validFrom = Math.floor(now.getTime() / 1000);
		const m: Mandate = {
			orgId: ctx.orgId,
			mandateId: randomUUID(),
			grantee: input.granteeUserId,
			network: input.network,
			chainId: NETWORKS[input.network].chainId ?? null,
			asset: input.asset,
			perPayout,
			total,
			destinations: normalizeDestinations(
				input.network,
				book.map((b) => b.address),
			),
			validFrom,
			validUntil: validFrom + input.days * 86_400,
			issuer: ctx.userId,
			nonce: randomBytes(16).toString("hex"),
		};
		const text = encodeMandate(m);
		const options = await generateAuthenticationOptions({
			rpID,
			challenge: new Uint8Array(mandateChallenge(text)),
			userVerification: "required",
			timeout: 120_000,
			allowCredentials: keys.map((k) => ({
				id: k.id,
				transports: k.transports
					? (k.transports.split(",") as ("usb" | "nfc" | "ble")[])
					: undefined,
			})),
		});
		const identifier = pendingKey(ctx.sessionId);
		await tx
			.delete(verification)
			.where(eq(verification.identifier, identifier));
		await tx.insert(verification).values({
			identifier,
			value: text,
			expiresAt: new Date(now.getTime() + PENDING_MS),
		});
		const [grantee] = await tx
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, m.grantee));
		return none({
			ok: true,
			data: {
				options,
				summary: {
					grantee: grantee?.name || grantee?.email || "",
					asset: m.asset,
					network: m.network,
					perPayout: amountText(m.network, m.asset, m.perPayout),
					total: amountText(m.network, m.asset, m.total),
					destinations: book.map((b) => b.label),
					validUntil: new Date(m.validUntil * 1000).toISOString(),
				},
			},
		});
	});
}

/** Unterschrift prüfen und die Vollmacht festschreiben. */
export async function submitMandate(
	ctx: OrgCtx & { userId: string; sessionId: string },
	response: AuthenticationResponseJSON,
): Promise<ActionResult<{ id: string }>> {
	return mutateOrg<ActionResult<{ id: string }>>(ctx, async (tx) => {
		const none = (r: ActionResult<{ id: string }>) => ({
			result: r,
			audit: [],
		});
		const [pending] = await tx
			.delete(verification)
			.where(eq(verification.identifier, pendingKey(ctx.sessionId)))
			.returning({
				text: verification.value,
				expiresAt: verification.expiresAt,
			});
		if (!pending || pending.expiresAt.getTime() < Date.now())
			return none(fail("mandate_expired"));
		const text = pending.text;
		const m = parseMandate(text);
		if (m.orgId !== ctx.orgId || m.issuer !== ctx.userId)
			return none(fail("forbidden"));
		const [pk] = await tx
			.select()
			.from(passkey)
			.where(
				and(
					eq(passkey.credentialID, response.id),
					eq(passkey.userId, ctx.userId),
				),
			)
			.limit(1);
		if (!pk) return none(fail("mandate_signature"));
		let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
		try {
			verified = await verifyAuthenticationResponse({
				response,
				expectedChallenge: b64u(mandateChallenge(text)),
				expectedOrigin: baseURL,
				expectedRPID: rpID,
				credential: {
					id: pk.credentialID,
					publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64")),
					counter: pk.counter,
				},
				requireUserVerification: true,
			});
		} catch {
			return none(fail("mandate_signature"));
		}
		if (!verified.verified || !verified.authenticationInfo.userVerified)
			return none(fail("mandate_signature"));
		if (
			!deviceBound({
				deviceType: verified.authenticationInfo.credentialDeviceType,
				backedUp: verified.authenticationInfo.credentialBackedUp,
			})
		)
			return none(fail("security_key_required"));
		const bumped = await tx
			.update(passkey)
			.set({ counter: verified.authenticationInfo.newCounter })
			.where(and(eq(passkey.id, pk.id), eq(passkey.counter, pk.counter)))
			.returning({ id: passkey.id });
		if (bumped.length === 0) return none(fail("mandate_signature"));
		if ((await roleOf(tx, ctx.orgId, ctx.userId)) !== "owner")
			return none(fail("forbidden"));
		if ((await roleOf(tx, ctx.orgId, m.grantee)) !== "operator")
			return none(fail("mandate_grantee"));
		await tx.insert(payoutMandates).values({
			id: m.mandateId,
			organizationId: ctx.orgId,
			granteeUserId: m.grantee,
			network: m.network,
			asset: m.asset,
			perPayout: m.perPayout.toString(),
			total: m.total.toString(),
			destinations: m.destinations,
			validFrom: new Date(m.validFrom * 1000),
			validUntil: new Date(m.validUntil * 1000),
			issuedByUserId: m.issuer,
			text,
			textHash: Buffer.from(mandateChallenge(text)).toString("hex"),
			assertion: {
				credentialId: response.id,
				authenticatorData: response.response.authenticatorData,
				clientDataJSON: response.response.clientDataJSON,
				signature: response.response.signature,
			},
		});
		await notify(tx, {
			orgId: ctx.orgId,
			actorUserId: ctx.userId,
			recipients: [m.grantee],
			kind: "payout",
			title: `Vollmacht: bis ${amountText(m.network, m.asset, m.total)}`,
			body: `Du darfst bis ${new Date(m.validUntil * 1000).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} an ${m.destinations.length} Ziel(e) auszahlen, je Auszahlung höchstens ${amountText(m.network, m.asset, m.perPayout)}.`,
			link: "/mandates",
		});
		return {
			result: { ok: true, data: { id: m.mandateId } },
			audit: {
				action: "wallet.mandate_issued",
				target: `payout_mandate:${m.mandateId}`,
				after: {
					grantee: m.grantee,
					network: m.network,
					asset: m.asset,
					perPayout: m.perPayout.toString(),
					total: m.total.toString(),
					destinations: m.destinations,
					validUntil: new Date(m.validUntil * 1000).toISOString(),
					textHash: Buffer.from(mandateChallenge(text)).toString("hex"),
					credentialId: response.id,
				},
			},
		};
	});
}

export async function revokeMandate(
	ctx: OrgCtx & { userId: string },
	id: string,
	reason: string,
): Promise<ActionResult> {
	return mutateOrg<ActionResult>(ctx, async (tx) => {
		const [row] = await tx
			.update(payoutMandates)
			.set({
				revokedAt: new Date(),
				revokedByUserId: ctx.userId,
				revokeReason: reason,
			})
			.where(
				and(
					eq(payoutMandates.id, id),
					eq(payoutMandates.organizationId, ctx.orgId),
					isNull(payoutMandates.revokedAt),
				),
			)
			.returning({ grantee: payoutMandates.granteeUserId });
		if (!row) return { result: fail("notFound"), audit: [] };
		await notify(tx, {
			orgId: ctx.orgId,
			actorUserId: ctx.userId,
			recipients: [row.grantee],
			kind: "payout",
			title: "Vollmacht widerrufen",
			body: reason,
			link: "/mandates",
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.mandate_revoked",
				target: `payout_mandate:${id}`,
				after: { reason },
			},
		};
	});
}

/** Summe der Auszahlungen, die auf die Vollmacht laufen (Basiseinheiten). */
export async function mandateUsed(
	tx: OrgTx,
	mandateId: string,
): Promise<bigint> {
	const rows = await tx
		.select({ amount: walletPayouts.amount })
		.from(walletPayouts)
		.where(
			and(
				eq(walletPayouts.mandateId, mandateId),
				notInArray(walletPayouts.status, [...NOT_SPENT]),
			),
		);
	return rows.reduce((s, r) => s + BigInt(r.amount), 0n);
}

export type MandateCheck =
	| { ok: true; mandateId: string }
	| { ok: false; error: `mandate_${MandateUse | "required" | "signature"}` };

/**
 * Passende Vollmacht für eine Auszahlung der Bedienung. Mit `lock` (in der
 * schreibenden Transaktion) sind die Vollmachten bis zum Ende gesperrt —
 * zwei gleichzeitige Auszahlungen überziehen den Rahmen so nie.
 */
export async function mandateForPayout(
	tx: OrgTx,
	p: {
		orgId: string;
		userId: string;
		network: WalletNetwork;
		asset: AssetCode;
		amount: bigint;
		destination: string;
		now: Date;
		lock?: boolean;
	},
): Promise<MandateCheck> {
	const q = tx
		.select()
		.from(payoutMandates)
		.where(
			and(
				eq(payoutMandates.organizationId, p.orgId),
				eq(payoutMandates.granteeUserId, p.userId),
				eq(payoutMandates.network, p.network),
				eq(payoutMandates.asset, p.asset),
				isNull(payoutMandates.revokedAt),
				gt(payoutMandates.validUntil, p.now),
			),
		)
		.orderBy(payoutMandates.validUntil);
	const rows = p.lock ? await q.for("update") : await q;
	let error: MandateCheck = { ok: false, error: "mandate_required" };
	const at = Math.floor(p.now.getTime() / 1000);
	for (const row of rows) {
		let m: Mandate;
		try {
			m = parseMandate(row.text);
		} catch {
			error = { ok: false, error: "mandate_signature" };
			continue;
		}
		// Gilt nur, was unterschrieben ist: Zeile und Text müssen passen
		if (m.mandateId !== row.id || m.orgId !== p.orgId) {
			error = { ok: false, error: "mandate_signature" };
			continue;
		}
		const use = mandateCovers(m, {
			grantee: p.userId,
			network: p.network,
			asset: p.asset,
			amount: p.amount,
			destination: p.destination,
			at,
			used: await mandateUsed(tx, row.id),
		});
		if (use !== "ok") {
			error = { ok: false, error: `mandate_${use}` };
			continue;
		}
		if (!(await signatureValid(tx, row, m))) {
			error = { ok: false, error: "mandate_signature" };
			continue;
		}
		return { ok: true, mandateId: row.id };
	}
	return error;
}

/**
 * Gilt die Vollmacht einer schon angelegten Auszahlung noch? Der Job fragt
 * das vor dem Signieren (Selbstprüfung B1): nicht widerrufen, im Zeitraum,
 * Bedienung noch Bedienung, Aussteller:in noch Inhaber:in mit gültiger
 * Unterschrift. Fällt das in der App weg, bremst die App auch dann, wenn der
 * Widerruf im Signer nicht ankam.
 */
export async function mandateStillValid(
	tx: OrgTx,
	orgId: string,
	mandateId: string,
	now: Date,
): Promise<boolean> {
	const [row] = await tx
		.select()
		.from(payoutMandates)
		.where(
			and(
				eq(payoutMandates.id, mandateId),
				eq(payoutMandates.organizationId, orgId),
			),
		)
		.limit(1);
	if (!row || row.revokedAt) return false;
	if (now < row.validFrom || now >= row.validUntil) return false;
	if ((await roleOf(tx, orgId, row.granteeUserId)) !== "operator") return false;
	let m: Mandate;
	try {
		m = parseMandate(row.text);
	} catch {
		return false;
	}
	if (m.mandateId !== row.id || m.orgId !== orgId) return false;
	return signatureValid(tx, row, m);
}

/** Offene Vollmachten einer Person (Mitglied entfernt oder Rolle geändert). */
export async function revokeMandatesOf(
	tx: OrgTx,
	ctx: OrgCtx & { userId: string | null },
	granteeUserId: string,
	reason: string,
): Promise<string[]> {
	const rows = await tx
		.update(payoutMandates)
		.set({
			revokedAt: new Date(),
			revokedByUserId: ctx.userId,
			revokeReason: reason,
		})
		.where(
			and(
				eq(payoutMandates.organizationId, ctx.orgId),
				eq(payoutMandates.granteeUserId, granteeUserId),
				isNull(payoutMandates.revokedAt),
			),
		)
		.returning({ id: payoutMandates.id });
	return rows.map((r) => r.id);
}

/** Auszahlungen auf der Vollmacht, die noch nicht signiert sind. */
export async function openMandatePayouts(
	tx: OrgTx,
	orgId: string,
	mandateId: string,
): Promise<{ id: string; intentId: string; status: string }[]> {
	return tx
		.select({
			id: walletPayouts.id,
			intentId: walletPayouts.intentId,
			status: walletPayouts.status,
		})
		.from(walletPayouts)
		.where(
			and(
				eq(walletPayouts.organizationId, orgId),
				eq(walletPayouts.mandateId, mandateId),
				inArray(walletPayouts.status, ["awaiting_approval", "approved"]),
			),
		);
}

// Unterschrift neu prüfen: gespeicherter Schlüssel der Aussteller:in,
// gerätegebunden, Aussteller:in noch Inhaber:in der Org
async function signatureValid(
	tx: OrgTx,
	row: typeof payoutMandates.$inferSelect,
	m: Mandate,
): Promise<boolean> {
	if ((await roleOf(tx, m.orgId, m.issuer)) !== "owner") return false;
	const [pk] = await tx
		.select({ publicKey: passkey.publicKey })
		.from(passkey)
		.where(
			and(
				eq(passkey.credentialID, row.assertion.credentialId),
				eq(passkey.userId, m.issuer),
			),
		)
		.limit(1);
	if (!pk) return false;
	const r = verifyAssertion({
		publicKeyCose: new Uint8Array(Buffer.from(pk.publicKey, "base64")),
		authenticatorData: Buffer.from(
			row.assertion.authenticatorData,
			"base64url",
		),
		clientDataJSON: Buffer.from(row.assertion.clientDataJSON, "base64url"),
		signature: Buffer.from(row.assertion.signature, "base64url"),
		expectedChallenge: b64u(mandateChallenge(row.text)),
		expectedOrigin: baseURL,
		rpId: rpID,
	});
	return r.ok && !r.flags.be && !r.flags.bs;
}

export type MandateView = {
	id: string;
	grantee: string;
	granteeUserId: string;
	network: WalletNetwork;
	asset: AssetCode;
	perPayout: string;
	total: string;
	used: string;
	destinations: number;
	validFrom: Date;
	validUntil: Date;
	issuer: string;
	revokedAt: Date | null;
	revokeReason: string | null;
};

/** Vollmachten der Org (Inhaber:innen) bzw. die eigenen (Bedienung). */
export async function listMandates(
	tx: OrgTx,
	orgId: string,
	onlyFor?: string,
): Promise<MandateView[]> {
	const rows = await tx
		.select({
			m: payoutMandates,
			grantee: sql<string>`(select coalesce(nullif(u.name, ''), u.email) from "user" u where u.id = ${payoutMandates.granteeUserId})`,
			issuer: sql<string>`(select coalesce(nullif(u.name, ''), u.email) from "user" u where u.id = ${payoutMandates.issuedByUserId})`,
		})
		.from(payoutMandates)
		.where(
			and(
				eq(payoutMandates.organizationId, orgId),
				onlyFor ? eq(payoutMandates.granteeUserId, onlyFor) : undefined,
			),
		)
		.orderBy(desc(payoutMandates.createdAt))
		.limit(200);
	const out: MandateView[] = [];
	for (const r of rows)
		out.push({
			id: r.m.id,
			grantee: r.grantee,
			granteeUserId: r.m.granteeUserId,
			network: r.m.network,
			asset: r.m.asset,
			perPayout: r.m.perPayout,
			total: r.m.total,
			used: (await mandateUsed(tx, r.m.id)).toString(),
			destinations: r.m.destinations.length,
			validFrom: r.m.validFrom,
			validUntil: r.m.validUntil,
			issuer: r.issuer,
			revokedAt: r.m.revokedAt,
			revokeReason: r.m.revokeReason,
		});
	return out;
}
