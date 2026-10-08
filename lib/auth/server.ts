import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { sso } from "@better-auth/sso";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { count, eq } from "drizzle-orm";
import { globalDb, schema } from "../../db";
import { member, session as sessionTable, user } from "../../db/auth-schema";
import { memberAccess } from "../../db/schema";
import { auditPlatform } from "../audit";
import { withOrg } from "../db/with-org";
import { sendTransactionalMail } from "../mail/send";
import {
	invitationEmail,
	magicLinkEmail,
	transactionalEmail,
} from "../mail/templates";
import { authAfterHook } from "./audit-events";
import { ac, roles } from "./permissions";

// Bewusst keine env()-Validierung beim Import: Better Auth liest
// BETTER_AUTH_SECRET/BETTER_AUTH_URL selbst aus der Umgebung, und die CLI
// (`pnpm auth:generate`) muss diese Datei ohne laufende App laden können.
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production";
const allowSignup = process.env.AUTH_ALLOW_SIGNUP === "true";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const microsoft =
	process.env.MICROSOFT_CLIENT_ID &&
	process.env.MICROSOFT_CLIENT_SECRET &&
	process.env.MICROSOFT_TENANT_ID
		? {
				microsoft: {
					clientId: process.env.MICROSOFT_CLIENT_ID,
					clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
					tenantId: process.env.MICROSOFT_TENANT_ID,
					prompt: "select_account" as const,
					disableSignUp: !allowSignup,
					disableProfilePhoto: true,
				},
			}
		: undefined;

export const auth = betterAuth({
	appName: "Klick",
	baseURL,
	database: drizzleAdapter(globalDb, { provider: "pg", schema }),
	trustedOrigins: [baseURL],

	session: {
		// Gleitende Verlängerung durch Better Auth; die absolute 12-h-Grenze
		// und das 30-min-Idle-Fenster erzwingt lib/auth/guards.ts.
		expiresIn: 12 * HOUR,
		updateAge: 1 * HOUR,
		cookieCache: { enabled: false },
		additionalFields: {
			mfaVerifiedAt: { type: "date", required: false, input: false },
			lastActiveAt: { type: "date", required: false, input: false },
			stepUpAt: { type: "date", required: false, input: false },
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/magic-link": { window: 15 * MINUTE, max: 10 },
			"/magic-link/verify": { window: 15 * MINUTE, max: 20 },
			"/two-factor/verify-totp": { window: 15 * MINUTE, max: 10 },
			"/two-factor/verify-backup-code": { window: 15 * MINUTE, max: 5 },
			"/sign-in/passkey": { window: 15 * MINUTE, max: 20 },
		},
	},

	advanced: {
		database: { generateId: "uuid" },
		cookiePrefix: "klick",
		useSecureCookies: isProd,
		defaultCookieAttributes: {
			sameSite: "lax",
			httpOnly: true,
			secure: isProd,
			path: "/",
		},
		ipAddress: {
			ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
		},
		trustedProxyHeaders: true,
	},

	socialProviders: microsoft,

	// Datenbank-Hooks → Audit (zuverlässig für alle Login-Methoden) und
	// aktive Org beim Session-Start.
	databaseHooks: {
		session: {
			create: {
				async before(session) {
					const [m] = await globalDb
						.select({ organizationId: member.organizationId })
						.from(member)
						.where(eq(member.userId, session.userId))
						.limit(1);
					return {
						data: {
							...session,
							activeOrganizationId: m?.organizationId ?? null,
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
					await notifyNewDevice(session).catch((err) =>
						console.error("new-device notification failed", err),
					);
				},
			},
		},
		user: {
			create: {
				async after(user) {
					await auditPlatform(
						{ userId: user.id },
						{ action: "auth.user_created", target: `user:${user.id}` },
					);
				},
			},
			update: {
				async after(user) {
					const u = user as typeof user & {
						role?: string | null;
						banned?: boolean | null;
						banReason?: string | null;
					};
					await auditPlatform(
						{ userId: null },
						{
							action: "auth.user_updated",
							target: `user:${user.id}`,
							after: {
								role: u.role ?? undefined,
								banned: u.banned ?? undefined,
							},
						},
					);
				},
			},
		},
	},

	hooks: { after: authAfterHook },

	plugins: [
		magicLink({
			expiresIn: 15 * MINUTE,
			// Allow-List-Modus: nur bekannte Nutzer:innen erhalten einen Link.
			// Die Antwort ist in beiden Fällen identisch (kein User-Enumeration).
			disableSignUp: !allowSignup,
			rateLimit: { window: 15 * MINUTE, max: 3 },
			storeToken: "hashed",
			async sendMagicLink({ email, url }) {
				const host = new URL(url).host;
				const tpl = magicLinkEmail({ url, host });
				if (!isProd) {
					// Dev-Komfort: Link in der Konsole. In Production nie.
					console.log(
						`\n┌──── Magic Link ────────────────────────\n│ to:  ${email}\n│ url: ${url}\n└─────────────────────────────────────────\n`,
					);
				}
				// Nicht auf SMTP warten: Antwort kommt sofort (UX, gleiche Laufzeit
				// für bekannte/unbekannte Adressen). sendTransactionalMail wirft nie.
				void sendTransactionalMail({
					to: email,
					subject: tpl.subject,
					text: tpl.text,
					html: tpl.html,
				});
			},
		}),

		organization({
			ac,
			roles,
			// Ein User gehört in v1 zu genau einer Org. organizationLimit begrenzt
			// nur das Anlegen; die Mitgliedschafts-Grenze prüft lib/auth/guards.
			organizationLimit: 1,
			async allowUserToCreateOrganization(user) {
				const [row] = await globalDb
					.select({ n: count() })
					.from(member)
					.where(eq(member.userId, user.id));
				return Number(row?.n ?? 0) === 0;
			},
			creatorRole: "owner",
			membershipLimit: 250,
			invitationExpiresIn: 48 * HOUR,
			cancelPendingInvitationsOnReInvite: true,
			async sendInvitationEmail(data) {
				const tpl = invitationEmail({
					url: `${baseURL}/einladung/${data.id}`,
					organization: data.organization.name,
					inviter: data.inviter.user.name || data.inviter.user.email,
					role: data.role,
				});
				await sendTransactionalMail({
					to: data.email,
					subject: tpl.subject,
					text: tpl.text,
					html: tpl.html,
				});
			},
			organizationHooks: {
				async afterCreateOrganization({ organization: org, user }) {
					await auditPlatform(
						{ userId: user.id },
						{
							action: "org.created",
							target: `organization:${org.id}`,
							organizationId: org.id,
							after: { name: org.name, slug: org.slug },
						},
					);
				},
				async beforeAcceptInvitation({ user }) {
					// Ein User gehört zu genau einer Organisation (v1).
					const [row] = await globalDb
						.select({ n: count() })
						.from(member)
						.where(eq(member.userId, user.id));
					if (Number(row?.n ?? 0) > 0) {
						throw new APIError("FORBIDDEN", {
							message: "Dieses Konto gehört bereits zu einer Organisation.",
						});
					}
				},
				async afterAcceptInvitation({ invitation, member: m, user }) {
					// Prüfer:innen bekommen zeitlich begrenzten Zugang (Standard 6 Wochen);
					// Owner passt Ablauf und Grants auf /team an.
					if (m.role === "auditor") {
						await withOrg(
							{ orgId: invitation.organizationId, userId: user.id },
							(tx) =>
								tx
									.insert(memberAccess)
									.values({
										memberId: m.id,
										organizationId: invitation.organizationId,
										accessUntil: new Date(Date.now() + 42 * 86_400_000),
										grants: [],
										createdByUserId: invitation.inviterId,
									})
									.onConflictDoNothing(),
						);
					}
					await auditPlatform(
						{ userId: user.id },
						{
							action: "org.member_joined",
							target: `member:${m.id}`,
							organizationId: invitation.organizationId,
							after: {
								role: m.role,
								accessUntil: m.role === "auditor" ? "+42d" : null,
							},
						},
					);
				},
				async afterCreateInvitation({ invitation, inviter }) {
					// Better Auth 1.7: `inviter` ist der User selbst (kein { user, member }).
					await auditPlatform(
						{ userId: inviter.id },
						{
							action: "org.invitation_created",
							target: `invitation:${invitation.id}`,
							organizationId: invitation.organizationId,
							after: { role: invitation.role },
						},
					);
				},
				async afterUpdateMemberRole({ member: m, previousRole, user }) {
					await auditPlatform(
						{ userId: user.id },
						{
							action: "org.member_role_changed",
							target: `member:${m.id}`,
							organizationId: m.organizationId,
							before: { role: previousRole },
							after: { role: m.role },
						},
					);
				},
				async afterRemoveMember({ member: m, user }) {
					await auditPlatform(
						{ userId: user.id },
						{
							action: "org.member_removed",
							target: `member:${m.id}`,
							organizationId: m.organizationId,
						},
					);
				},
			},
		}),

		twoFactor({
			issuer: "Klick",
			// Magic-Link-/Passkey-User haben kein Passwort — ohne dieses Flag
			// könnten sie kein MFA einrichten.
			allowPasswordless: true,
			skipVerificationOnEnable: false,
			backupCodeOptions: { amount: 10, length: 10 },
			// Lockout nach 5 Fehlversuchen für 15 Minuten.
			accountLockout: {
				enabled: true,
				maxFailedAttempts: 5,
				durationSeconds: 15 * MINUTE,
			},
			// trustDevice wird nie gesetzt: jede Session verifiziert MFA neu.
		}),

		passkey({
			rpID: process.env.PASSKEY_RP_ID ?? new URL(baseURL).hostname,
			rpName: process.env.PASSKEY_RP_NAME ?? "Klick",
			origin: baseURL,
			authenticatorSelection: {
				residentKey: "preferred",
				userVerification: "preferred",
			},
		}),

		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
			impersonationSessionDuration: 30 * MINUTE,
		}),

		// SSO je Organisation (OIDC): Owner registrieren ihren IdP unter
		// /einstellungen?tab=sso, Domain wird per DNS-TXT verifiziert, Nutzer der
		// Domain werden als Mitglied provisioniert. MFA-Pflicht, Idle- und
		// Step-up-Regeln gelten unverändert (lib/auth/guards.ts).
		sso({
			disableImplicitSignUp: false,
			defaultOverrideUserInfo: false,
			organizationProvisioning: { disabled: false, defaultRole: "member" },
			domainVerification: { enabled: true, tokenPrefix: "klick-sso" },
		}),

		// Muss der letzte Plugin-Eintrag sein (setzt Cookies in Server Actions).
		nextCookies(),
	],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;

// Login-Benachrichtigung: erste Sitzung von einem neuen Gerät (User-Agent)
// oder einer neuen IP → Mail an den Nutzer. Vergleich gegen frühere Sitzungen
// desselben Users; die allererste Sitzung löst nichts aus.
async function notifyNewDevice(session: {
	id: string;
	userId: string;
	ipAddress?: string | null;
	userAgent?: string | null;
}): Promise<void> {
	const previous = await globalDb
		.select({
			id: sessionTable.id,
			ipAddress: sessionTable.ipAddress,
			userAgent: sessionTable.userAgent,
		})
		.from(sessionTable)
		.where(eq(sessionTable.userId, session.userId));
	const others = previous.filter((p) => p.id !== session.id);
	if (others.length === 0) return;
	const known = others.some(
		(p) =>
			(p.userAgent ?? "") === (session.userAgent ?? "") &&
			(p.ipAddress ?? "") === (session.ipAddress ?? ""),
	);
	if (known) return;
	const [u] = await globalDb
		.select({ email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, session.userId))
		.limit(1);
	if (!u) return;
	const when = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(new Date());
	const mail = transactionalEmail({
		subject: "Neue Anmeldung bei Klick",
		eyebrow: "Sicherheit",
		title: "Neue Anmeldung von einem unbekannten Gerät",
		body: `Hallo ${u.name || ""},\n\nam ${when} hat sich jemand mit deinem Konto angemeldet.\nIP: ${session.ipAddress ?? "unbekannt"}\nGerät: ${(session.userAgent ?? "unbekannt").slice(0, 120)}\n\nWarst das nicht du? Melde dich unter Einstellungen → Sicherheit überall ab und sprich mit deiner Organisation.`,
		cta: { label: "Sitzungen prüfen", url: `${baseURL}/einstellungen` },
	});
	await sendTransactionalMail({ to: u.email, ...mail });
	await auditPlatform(
		{
			userId: session.userId,
			ip: session.ipAddress ?? null,
			userAgent: session.userAgent ?? null,
		},
		{ action: "auth.new_device_notified", target: `session:${session.id}` },
	);
}
