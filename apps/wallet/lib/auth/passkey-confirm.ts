import {
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
	generateAuthenticationOptions,
	type PublicKeyCredentialRequestOptionsJSON,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "@wallet/db";
import {
	passkey,
	session as sessionTable,
	verification,
} from "@wallet/db/auth-schema";
import { auditPlatform } from "@wallet/lib/audit";
import { userRequiresSecurityKey } from "@wallet/lib/orgs/access";
import { credentialAllowed, deviceBound } from "@wallet/lib/orgs/access-policy";
import { and, eq } from "drizzle-orm";
import { baseURL, rpID } from "./config";

// Laufende Sitzung per Passkey bestätigen, ohne neue Sitzung (wie Klick):
// „stepup“ vor sensiblen Aktionen (10 min), „unlock“ öffnet die Wallet-
// Daten der aktiven Org für 15 min ab Bestätigung. Eigene Challenge je
// Sitzung und Zweck, Zähler des Passkeys muss steigen.

export type ConfirmPurpose = "stepup" | "unlock";

const CHALLENGE_MS = 5 * 60 * 1000;

const transportsOf = (t: string | null) =>
	t
		? (t.split(",").filter(Boolean) as AuthenticatorTransportFuture[])
		: undefined;

const challengeKey = (sessionId: string, purpose: ConfirmPurpose) =>
	`passkey-confirm:${purpose}:${sessionId}`;

export async function passkeyConfirmOptions(input: {
	userId: string;
	sessionId: string;
	purpose: ConfirmPurpose;
}): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
	const all = await db
		.select({
			id: passkey.credentialID,
			transports: passkey.transports,
			deviceType: passkey.deviceType,
			backedUp: passkey.backedUp,
		})
		.from(passkey)
		.where(eq(passkey.userId, input.userId));
	// Nur Sicherheitsschlüssel (Härtung W): synchronisierte gar nicht anbieten
	const strict = await userRequiresSecurityKey(input.userId);
	const own = strict ? all.filter(deviceBound) : all;
	if (own.length === 0) return null;
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: "required",
		timeout: 60_000,
		allowCredentials: own.map((p) => ({
			id: p.id,
			transports: transportsOf(p.transports),
		})),
	});
	const identifier = challengeKey(input.sessionId, input.purpose);
	await db.delete(verification).where(eq(verification.identifier, identifier));
	await db.insert(verification).values({
		identifier,
		value: options.challenge,
		expiresAt: new Date(Date.now() + CHALLENGE_MS),
	});
	return options;
}

export type PasskeyConfirmResult =
	| { ok: true }
	| { ok: false; error: "invalid" | "expired" | "security_key_required" };

export async function verifyPasskeyConfirm(input: {
	userId: string;
	sessionId: string;
	purpose: ConfirmPurpose;
	orgId: string | null;
	response: AuthenticationResponseJSON;
	ip: string | null;
	userAgent: string | null;
}): Promise<PasskeyConfirmResult> {
	const actor = {
		userId: input.userId,
		ip: input.ip,
		userAgent: input.userAgent,
	};
	const action = input.purpose === "unlock" ? "auth.unlock" : "auth.step_up";
	const failed = async (
		error: "invalid" | "expired" | "security_key_required",
	) => {
		await auditPlatform(actor, {
			action: `${action}_failed`,
			outcome: "failure",
			after: { reason: error },
		});
		return { ok: false as const, error };
	};

	const identifier = challengeKey(input.sessionId, input.purpose);
	const [challenge] = await db
		.delete(verification)
		.where(eq(verification.identifier, identifier))
		.returning({
			value: verification.value,
			expiresAt: verification.expiresAt,
		});
	if (!challenge || challenge.expiresAt.getTime() < Date.now())
		return failed("expired");

	const [pk] = await db
		.select()
		.from(passkey)
		.where(
			and(
				eq(passkey.credentialID, input.response.id),
				eq(passkey.userId, input.userId),
			),
		)
		.limit(1);
	if (!pk) return failed("invalid");

	let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
	try {
		verified = await verifyAuthenticationResponse({
			response: input.response,
			expectedChallenge: challenge.value,
			expectedOrigin: baseURL,
			expectedRPID: rpID,
			credential: {
				id: pk.credentialID,
				publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64")),
				counter: pk.counter,
				transports: transportsOf(pk.transports),
			},
			requireUserVerification: true,
		});
	} catch {
		return failed("invalid");
	}
	if (!verified.verified || !verified.authenticationInfo.userVerified)
		return failed("invalid");
	if (
		!credentialAllowed(await userRequiresSecurityKey(input.userId), {
			deviceType: verified.authenticationInfo.credentialDeviceType,
			backedUp: verified.authenticationInfo.credentialBackedUp,
		})
	)
		return failed("security_key_required");
	if (input.purpose === "unlock" && !input.orgId) return failed("invalid");

	const bumped = await db
		.update(passkey)
		.set({ counter: verified.authenticationInfo.newCounter })
		.where(and(eq(passkey.id, pk.id), eq(passkey.counter, pk.counter)))
		.returning({ id: passkey.id });
	if (bumped.length === 0) return failed("invalid");
	const now = new Date();
	await db
		.update(sessionTable)
		.set(
			input.purpose === "unlock"
				? {
						unlockedAt: now,
						unlockOrgId: input.orgId,
						stepUpAt: now,
						lastActiveAt: now,
					}
				: { stepUpAt: now, lastActiveAt: now },
		)
		.where(
			and(
				eq(sessionTable.id, input.sessionId),
				eq(sessionTable.userId, input.userId),
			),
		);
	await auditPlatform(actor, {
		action,
		target: `session:${input.sessionId}`,
		after: input.orgId ? { orgId: input.orgId } : undefined,
	});
	return { ok: true };
}

// Sperren: Entsperrung und Step-up sofort aufheben
export async function lockSession(sessionId: string): Promise<void> {
	await db
		.update(sessionTable)
		.set({ unlockedAt: null, unlockOrgId: null, stepUpAt: new Date(0) })
		.where(eq(sessionTable.id, sessionId));
}
