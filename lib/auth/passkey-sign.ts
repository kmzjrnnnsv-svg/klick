import {
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
	generateAuthenticationOptions,
	type PublicKeyCredentialRequestOptionsJSON,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { signChallenge } from "@/lib/signatures/canonical";
import {
	assertionDeviceBound,
	deviceBoundPasskey,
} from "@/lib/signatures/policy";

// Unterschrift per Passkey (N4): die Challenge ist kein Zufallswert aus dem
// Speicher, sondern SHA-256 über den kanonischen Text — die Assertion bindet
// damit genau diesen Inhalt. Einmaligkeit sichern Einmalwert + Ablauf im
// Text und die Eindeutigkeit (Org, Einmalwert, Nachweis) in der Tabelle.

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
export const SIGN_RP_ID =
	process.env.PASSKEY_RP_ID ?? new URL(baseURL).hostname;
export const SIGN_ORIGIN = baseURL.replace(/\/+$/, "");

const transportsOf = (t: string | null) =>
	t
		? (t.split(",").filter(Boolean) as AuthenticatorTransportFuture[])
		: undefined;

// keysOnly (AP9.1b): nur gerätegebundene Sicherheitsschlüssel anbieten
export async function passkeySignOptions(
	userId: string,
	signText: string,
	opts: { keysOnly?: boolean } = {},
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
	const all = await globalDb
		.select({
			id: passkey.credentialID,
			transports: passkey.transports,
			deviceType: passkey.deviceType,
			backedUp: passkey.backedUp,
		})
		.from(passkey)
		.where(eq(passkey.userId, userId));
	const own = opts.keysOnly ? all.filter(deviceBoundPasskey) : all;
	if (own.length === 0) return null;
	const options = await generateAuthenticationOptions({
		rpID: SIGN_RP_ID,
		userVerification: "required",
		timeout: 120_000,
		allowCredentials: own.map((p) => ({
			id: p.id,
			transports: transportsOf(p.transports),
		})),
	});
	return { ...options, challenge: signChallenge(signText) };
}

export type SignedAssertion = {
	credentialId: string;
	publicKey: string;
	authenticatorData: string;
	clientDataJSON: string;
	signature: string;
	userVerified: boolean;
	backupEligible: boolean;
	backupState: boolean;
	signCount: number;
};

export async function verifyPasskeySignature(input: {
	userId: string;
	signText: string;
	response: AuthenticationResponseJSON;
	// nur gerätegebundene Sicherheitsschlüssel (AP9.1b)
	keysOnly?: boolean;
}): Promise<{ ok: true; assertion: SignedAssertion } | { ok: false }> {
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
	if (!pk) return { ok: false };
	if (input.keysOnly && !deviceBoundPasskey(pk)) return { ok: false };
	const publicKey = new Uint8Array(Buffer.from(pk.publicKey, "base64"));
	let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
	try {
		verified = await verifyAuthenticationResponse({
			response: input.response,
			expectedChallenge: signChallenge(input.signText),
			expectedOrigin: SIGN_ORIGIN,
			expectedRPID: SIGN_RP_ID,
			credential: {
				id: pk.credentialID,
				publicKey,
				counter: pk.counter,
				transports: transportsOf(pk.transports),
			},
			requireUserVerification: true,
		});
	} catch {
		return { ok: false };
	}
	if (!verified.verified || !verified.authenticationInfo.userVerified)
		return { ok: false };
	// Zähler nur fortschreiben, wenn unverändert (wie passkey-confirm)
	const bumped = await globalDb
		.update(passkey)
		.set({ counter: verified.authenticationInfo.newCounter })
		.where(and(eq(passkey.id, pk.id), eq(passkey.counter, pk.counter)))
		.returning({ id: passkey.id });
	if (bumped.length === 0) return { ok: false };
	const authData = Buffer.from(
		input.response.response.authenticatorData,
		"base64url",
	);
	const flags = authData[32] ?? 0;
	const backupEligible = (flags & 0x08) !== 0;
	const backupState = (flags & 0x10) !== 0;
	if (input.keysOnly && !assertionDeviceBound({ backupEligible, backupState }))
		return { ok: false };
	return {
		ok: true,
		assertion: {
			credentialId: pk.credentialID,
			publicKey: Buffer.from(publicKey).toString("base64url"),
			authenticatorData: input.response.response.authenticatorData,
			clientDataJSON: input.response.response.clientDataJSON,
			signature: input.response.response.signature,
			userVerified: (flags & 0x04) !== 0,
			backupEligible,
			backupState,
			signCount: verified.authenticationInfo.newCounter,
		},
	};
}
