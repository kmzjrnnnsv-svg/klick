import { auditPlatform } from "@wallet/lib/audit";
import { APIError } from "better-auth/api";
import { consumeLink, LINK_CONTEXT, resolveLink } from "./links";

// Passkey-Registrierung über einen Link (passkey-Plugin, registration.
// resolveUser/afterVerification in server.ts). Ohne Sitzung zählt nur der
// Token aus dem Cookie. Die Einladung nimmt danach acceptInvitation an
// (eigene Transaktion, das Konto ist dann festgeschrieben).

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

export async function linkRegistrationUser(
	raw: string | null,
	context: string | null | undefined,
): Promise<{ id: string; name: string; displayName: string }> {
	if (context !== LINK_CONTEXT) throw invalid();
	const r = await resolveLink(raw);
	if (!r.ok) throw invalid();
	if (r.info.kind === "invite") {
		// Nie einen Passkey per Einladung an ein bestehendes Konto hängen
		if (r.info.accountExists) throw accountExists();
		// Platzhalter-ID bis zur Anlage: die Einladungs-ID (uuid)
		return {
			id: r.info.invitationId,
			name: r.info.email,
			displayName: r.payload.name?.trim() || r.info.email,
		};
	}
	if (r.payload.kind === "invite") throw invalid();
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
	if (!input.userVerified)
		throw new APIError("BAD_REQUEST", {
			code: "USER_VERIFICATION_REQUIRED",
			message: "user_verification_required",
		});
	// Weiterer Passkey zur eigenen Sitzung: nichts weiter zu tun
	if (input.context !== LINK_CONTEXT) return undefined;
	const r = await resolveLink(input.raw);
	if (!r.ok || !input.raw) throw invalid();
	let userId: string;
	if (r.info.kind === "invite") {
		if (input.user.id !== r.info.invitationId) throw invalid();
		if (r.info.accountExists) throw accountExists();
		const created = await input.createUser({
			email: r.info.email.toLowerCase(),
			name:
				r.payload.name?.trim() || r.info.email.split("@")[0] || r.info.email,
			emailVerified: false,
		});
		userId = created.id;
	} else {
		if (r.payload.kind === "invite" || input.user.id !== r.payload.userId)
			throw invalid();
		userId = r.payload.userId;
	}
	await consumeLink(input.raw);
	await auditPlatform(
		{ userId },
		{
			action:
				r.info.kind === "invite"
					? "auth.account_created"
					: r.info.kind === "activate"
						? "auth.account_activated"
						: "auth.access_recovered",
			target: `user:${userId}`,
		},
	);
	return { userId };
}
