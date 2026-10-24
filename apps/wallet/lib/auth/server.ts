import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { db, schema } from "@wallet/db";
import { auditPlatform } from "@wallet/lib/audit";
import { firstMembership } from "@wallet/lib/orgs/memberships";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { baseURL, isProd, rpID, rpName } from "./config";
import { authBeforeHook } from "./endpoint-guard";
import { LINK_COOKIE, resolveLink } from "./links";
import { completeLinkRegistration, linkRegistrationUser } from "./passkey-link";

// Anmeldung von both.money: nur Passkeys mit Nutzerverifikation (ein Passkey
// = beide Faktoren, ADR-019), Konten nur per Aktivierungs- oder
// Einladungslink, kein Mail-Login, kein Passwort. Absolute 12 h, Idle 30 min
// und Step-up prüfen die Guards (lib/auth/guards.ts).

const HOUR = 60 * 60;

export const auth = betterAuth({
	appName: "both.money",
	baseURL,
	secret: process.env.WALLET_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: "pg", schema }),
	trustedOrigins: [baseURL],

	user: {
		additionalFields: {
			role: { type: "string", required: false, input: false },
		},
	},

	session: {
		expiresIn: 12 * HOUR,
		updateAge: 1 * HOUR,
		cookieCache: { enabled: false },
		additionalFields: {
			activeOrgId: { type: "string", required: false, input: false },
			mfaVerifiedAt: { type: "date", required: false, input: false },
			lastActiveAt: { type: "date", required: false, input: false },
			stepUpAt: { type: "date", required: false, input: false },
			unlockedAt: { type: "date", required: false, input: false },
			unlockOrgId: { type: "string", required: false, input: false },
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
		window: 60,
		max: 100,
		customRules: {
			"/passkey/verify-authentication": { window: 15 * 60, max: 100 },
			"/passkey/generate-register-options": { window: 15 * 60, max: 20 },
			"/passkey/verify-registration": { window: 15 * 60, max: 10 },
		},
	},

	advanced: {
		database: { generateId: "uuid" },
		cookiePrefix: "both",
		useSecureCookies: isProd,
		defaultCookieAttributes: {
			sameSite: "lax",
			httpOnly: true,
			secure: isProd,
			path: "/",
		},
		ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
		trustedProxyHeaders: true,
	},

	databaseHooks: {
		session: {
			create: {
				// Jede Sitzung entsteht per Passkey (Anmeldung oder Registrierung):
				// zweiter Faktor erfüllt und entsperrt in der ersten Org.
				async before(session) {
					const orgId = await firstMembership(session.userId);
					const now = new Date();
					return {
						data: {
							...session,
							activeOrgId: orgId,
							mfaVerifiedAt: now,
							lastActiveAt: now,
							unlockedAt: orgId ? now : null,
							unlockOrgId: orgId,
						},
					};
				},
				async after(session) {
					await auditPlatform(
						{
							userId: session.userId,
							ip: session.ipAddress ?? null,
							userAgent: session.userAgent ?? null,
						},
						{ action: "auth.signin", target: `session:${session.id}` },
					);
				},
			},
		},
		user: {
			create: {
				// Neue Konten nur über einen gültigen Einladungslink — angelegte
				// Konten (wallet:admin) schreibt die CLI direkt in die Tabelle.
				async before(newUser, ctx) {
					if (ctx?.path === "/passkey/verify-registration") {
						const r = await resolveLink(ctx.getCookie(LINK_COOKIE));
						if (
							r.ok &&
							r.info.kind === "invite" &&
							r.info.email.toLowerCase() === newUser.email.toLowerCase()
						)
							return;
					}
					throw new APIError("FORBIDDEN", {
						code: "new_user_signup_disabled",
						message: "Konten nur per Einladung.",
					});
				},
			},
		},
	},

	hooks: { before: authBeforeHook },

	plugins: [
		passkey({
			rpID,
			rpName,
			origin: baseURL,
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "required",
			},
			registration: {
				requireSession: false,
				resolveUser: ({ ctx, context }) =>
					linkRegistrationUser(ctx.getCookie(LINK_COOKIE), context),
				afterVerification: ({ ctx, verification, user: u, context }) =>
					completeLinkRegistration({
						raw: ctx.getCookie(LINK_COOKIE),
						context,
						userVerified: Boolean(verification.registrationInfo?.userVerified),
						user: u,
						createUser: (data) =>
							ctx.context.internalAdapter.createUser(data, {
								method: "passkey-link",
							}),
					}),
			},
			authentication: {
				async afterVerification({ verification }) {
					if (!verification.authenticationInfo.userVerified)
						throw new APIError("UNAUTHORIZED", {
							code: "USER_VERIFICATION_REQUIRED",
							message: "user_verification_required",
						});
				},
			},
		}),
		// Muss der letzte Plugin-Eintrag sein (Cookies in Server Actions)
		nextCookies(),
	],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
