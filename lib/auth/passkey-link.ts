import { APIError } from "better-auth/api";
import {
	consumeRegistrationToken,
	REG_CONTEXT,
	resolveRegistration,
} from "./registration-link";

// Passkey-Registrierung über einen Einladungs- bzw. Zurücksetz-Link
// (passkey-Plugin, registration.resolveUser/afterVerification in
// lib/auth/server.ts). Ohne Sitzung zählt nur der Token aus dem Cookie;
// mit Sitzung registriert das Plugin für die Sitzung (context ungenutzt).

const invalid = () =>
	new APIError("FORBIDDEN", {
		code: "REGISTRATION_LINK_INVALID",
		message: "registration_link_invalid",
	});
const accountExists = () =>
	new APIError("FORBIDDEN", {
		code: "ACCOUNT_EXISTS",
		message: "account_exists",
	});

// Platzhalter für ein Konto, das erst nach erfolgreicher Registrierung
// entsteht: die Einladungs-ID (eine uuid wie Konto-IDs — das Plugin sucht
// damit vorhandene Passkeys und findet keine).

export async function linkRegistrationUser(
	raw: string | null,
	context: string | null | undefined,
): Promise<{ id: string; name: string; displayName: string }> {
	if (context !== REG_CONTEXT) throw invalid();
	const r = await resolveRegistration(raw);
	if (!r.ok) throw invalid();
	if (r.info.kind === "invite") {
		// Nie einen Passkey an ein bestehendes Konto hängen — sonst wäre die
		// Einladung ein Übernahme-Link für fremde Konten.
		if (r.info.accountExists) throw accountExists();
		return {
			id: r.info.invitationId,
			name: r.info.email,
			displayName: r.payload.name?.trim() || r.info.email,
		};
	}
	if (r.payload.kind !== "recover") throw invalid();
	return {
		id: r.payload.userId,
		name: r.info.email,
		displayName: r.info.name || r.info.email,
	};
}

export async function completeLinkRegistration(input: {
	raw: string | null;
	context: string | null | undefined;
	userVerified: boolean;
	user: { id: string };
	createUser: (data: {
		email: string;
		name: string;
		emailVerified: boolean;
	}) => Promise<{ id: string }>;
}): Promise<{ userId: string } | undefined> {
	// Nur mit Nutzerverifikation zählt ein Passkey als zweiter Faktor —
	// auch beim Hinzufügen zur eigenen Sitzung.
	if (!input.userVerified)
		throw new APIError("BAD_REQUEST", {
			code: "USER_VERIFICATION_REQUIRED",
			message: "user_verification_required",
		});
	// Passkey zur eigenen Sitzung: sonst nichts zu tun
	if (input.context !== REG_CONTEXT) return undefined;
	const r = await resolveRegistration(input.raw);
	if (!r.ok || !input.raw) throw invalid();
	let userId: string;
	if (r.info.kind === "invite") {
		if (input.user.id !== r.info.invitationId) throw invalid();
		if (r.info.accountExists) throw accountExists();
		const name =
			r.payload.name?.trim() || r.info.email.split("@")[0] || r.info.email;
		const created = await input.createUser({
			email: r.info.email.toLowerCase(),
			name,
			emailVerified: false,
		});
		userId = created.id;
	} else {
		if (r.payload.kind !== "recover" || input.user.id !== r.payload.userId)
			throw invalid();
		userId = r.payload.userId;
	}
	await consumeRegistrationToken(input.raw);
	return { userId };
}
