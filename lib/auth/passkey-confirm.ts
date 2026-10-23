import {
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
	generateAuthenticationOptions,
	type PublicKeyCredentialRequestOptionsJSON,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	passkey,
	session as sessionTable,
	verification,
} from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { passkeyOldEnough } from "./session-rules";

// Bestätigen mit Passkey für die LAUFENDE Sitzung (ADR-019): zweiter Faktor
// nach einer Mail-Link-Anmeldung („mfa“) oder Step-up vor einer sensiblen
// Aktion („stepup“). Das Passkey-Plugin kennt nur die Anmeldung, die immer
// eine neue Sitzung anlegt — hier prüfen wir selbst mit @simplewebauthn
// (gleiche Version wie im Plugin), verlangen Nutzerverifikation und setzen
// nur Zeitstempel an der bestehenden Sitzung.

// „wallet“ entsperrt den Wallet-Bereich (15 min, nur diese Org) — setzt
// weder Step-up noch MFA.
export type ConfirmPurpose = "mfa" | "stepup" | "wallet";

const CHALLENGE_MS = 5 * 60 * 1000;

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const rpID = process.env.PASSKEY_RP_ID ?? new URL(baseURL).hostname;

// Das Plugin speichert die Transporte kommagetrennt.
const transportsOf = (t: string | null) =>
	t
		? (t.split(",").filter(Boolean) as AuthenticatorTransportFuture[])
		: undefined;

// Challenge je Sitzung und Zweck; ein neuer Aufruf ersetzt den alten.
const challengeKey = (sessionId: string, purpose: ConfirmPurpose) =>
	`passkey-confirm:${purpose}:${sessionId}`;

export async function passkeyConfirmOptions(input: {
	userId: string;
	sessionId: string;
	purpose: ConfirmPurpose;
}): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
	const own = await globalDb
		.select({ id: passkey.credentialID, transports: passkey.transports })
		.from(passkey)
		.where(eq(passkey.userId, input.userId));
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
	await globalDb
		.delete(verification)
		.where(eq(verification.identifier, identifier));
	await globalDb.insert(verification).values({
		identifier,
		value: options.challenge,
		expiresAt: new Date(Date.now() + CHALLENGE_MS),
	});
	return options;
}

export type PasskeyConfirmResult =
	| { ok: true }
	| { ok: false; error: "invalid" | "expired" | "passkey_too_new" };

export async function verifyPasskeyConfirm(input: {
	userId: string;
	sessionId: string;
	purpose: ConfirmPurpose;
	response: AuthenticationResponseJSON;
	ip: string | null;
	userAgent: string | null;
	// nur „wallet“: Org, für die entsperrt wird, und ob Echtgeld aktiv ist
	// (dann zählen nur Passkeys ≥ 72 h)
	wallet?: { orgId: string; liveEnabled: boolean };
}): Promise<PasskeyConfirmResult> {
	const actor = {
		userId: input.userId,
		ip: input.ip,
		userAgent: input.userAgent,
	};
	const failed = async (error: "invalid" | "expired" | "passkey_too_new") => {
		await auditPlatform(actor, {
			action:
				input.purpose === "mfa"
					? "auth.2fa_failed"
					: input.purpose === "wallet"
						? "wallet.unlock_failed"
						: "auth.step_up_failed",
			outcome: "failure",
			after: { method: "passkey", reason: error },
		});
		return { ok: false as const, error };
	};

	// Challenge einmalig verbrauchen
	const identifier = challengeKey(input.sessionId, input.purpose);
	const [challenge] = await globalDb
		.delete(verification)
		.where(eq(verification.identifier, identifier))
		.returning({
			value: verification.value,
			expiresAt: verification.expiresAt,
		});
	if (!challenge || challenge.expiresAt.getTime() < Date.now())
		return failed("expired");

	// Nur eigene Passkeys — ein fremder Schlüssel bestätigt nie diese Sitzung.
	const [pk] = await globalDb
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
				// Das Plugin speichert den Schlüssel base64-kodiert.
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
		input.purpose === "wallet" &&
		(!input.wallet ||
			!passkeyOldEnough(pk.createdAt, {
				liveEnabled: input.wallet.liveEnabled,
			}))
	)
		return failed(input.wallet ? "passkey_too_new" : "invalid");

	const now = new Date();
	// Zähler nur fortschreiben, wenn er sich seit dem Lesen nicht geändert
	// hat — zwei gleichzeitige Bestätigungen mit demselben Zählerstand
	// gewinnen nicht beide.
	const bumped = await globalDb
		.update(passkey)
		.set({ counter: verified.authenticationInfo.newCounter })
		.where(and(eq(passkey.id, pk.id), eq(passkey.counter, pk.counter)))
		.returning({ id: passkey.id });
	if (bumped.length === 0) return failed("invalid");
	await globalDb
		.update(sessionTable)
		.set(
			input.purpose === "mfa"
				? { mfaVerifiedAt: now, lastActiveAt: now }
				: input.purpose === "wallet"
					? {
							walletUnlockedAt: now,
							walletUnlockOrgId: input.wallet?.orgId ?? null,
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
		action:
			input.purpose === "mfa"
				? "auth.2fa_verified"
				: input.purpose === "wallet"
					? "wallet.unlocked"
					: "auth.step_up",
		target: `session:${input.sessionId}`,
		after: {
			method: "passkey",
			...(input.wallet ? { orgId: input.wallet.orgId } : {}),
		},
	});
	return { ok: true };
}
