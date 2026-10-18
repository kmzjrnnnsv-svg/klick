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
import { and, eq } from "drizzle-orm";
import { globalDb, schema } from "../../db";
import { member, session as sessionTable, user } from "../../db/auth-schema";
import { memberAccess, roleAssignments } from "../../db/schema";
import { auditPlatform } from "../audit";
import { withOrg } from "../db/with-org";
import { sendTransactionalMail } from "../mail/send";
import {
	invitationEmail,
	magicLinkEmail,
	transactionalEmail,
} from "../mail/templates";
import { syncTrainingAssignments } from "../trainings/assignments";
import { mayReceiveMagicLink, pendingInvitationId } from "./allow-list";
import { authAfterHook } from "./audit-events";
import { authBeforeHook } from "./endpoint-guard";
import { confirmLinkUrl } from "./magic-link";
import {
	accessDaysFor,
	isConsultant,
	membershipAllowed,
	pickActiveMembership,
	primaryMembershipCount,
} from "./memberships";
import { expireStepUp, listUserMemberships } from "./org";
import { completeLinkRegistration, linkRegistrationUser } from "./passkey-link";
import { ac, roles } from "./permissions";
import {
	inviteDelivery,
	issueRegistrationLink,
	REG_COOKIE,
	resolveRegistration,
} from "./registration-link";

// Bewusst keine env()-Validierung beim Import: Better Auth liest
// BETTER_AUTH_SECRET/BETTER_AUTH_URL selbst aus der Umgebung, und die CLI
// (`pnpm auth:generate`) muss diese Datei ohne laufende App laden können.
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production";
const allowSignup = process.env.AUTH_ALLOW_SIGNUP === "true";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

// Notfall-Login (`pnpm auth:link`, scripts/login-link.ts): der Befehl fängt
// den Link im eigenen Prozess ab und zeigt ihn im Terminal — keine Mail,
// nichts im Journal. Über HTTP nicht erreichbar; der Server setzt das nie.
let linkSink: ((url: string) => void) | null = null;
export function captureMagicLink(sink: ((url: string) => void) | null): void {
	linkSink = sink;
}

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

async function rolesOfUser(userId: string): Promise<string[]> {
	const rows = await globalDb
		.select({ role: member.role })
		.from(member)
		.where(eq(member.userId, userId));
	return rows.map((r) => r.role);
}

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
			// Passkey-Prüfung ist nicht zu erraten (Signatur); die Grenze bremst
			// nur Missbrauch. Großzügig, weil ein Büro hinter einer NAT-Adresse
			// morgens viele Anmeldungen hat.
			"/passkey/verify-authentication": { window: 15 * MINUTE, max: 100 },
			"/passkey/generate-register-options": { window: 15 * MINUTE, max: 20 },
			"/passkey/verify-registration": { window: 15 * MINUTE, max: 10 },
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
				async before(session, ctx) {
					// Aktive Org: die eigene Mitgliedschaft, sonst der zuletzt
					// begonnene gültige Berater-Zugang (ADR-018).
					const memberships = await listUserMemberships(session.userId);
					// Passkey-Anmeldung (Nutzerverifikation geprüft in
					// authentication.afterVerification) = zweiter Faktor erfüllt.
					const viaPasskey =
						ctx?.path === "/passkey/verify-authentication" ||
						ctx?.path === "/passkey/verify-registration";
					const now = new Date();
					return {
						data: {
							...session,
							activeOrganizationId: pickActiveMembership(memberships),
							...(viaPasskey ? { mfaVerifiedAt: now, lastActiveAt: now } : {}),
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
				// Allow-List-Modus: per Magic-Link entsteht ein Konto nur mit
				// offener Einladung (zweite Linie hinter sendMagicLink). Die
				// Ablehnung landet als ?error=new_user_signup_disabled auf /login.
				async before(newUser, ctx) {
					// Passkey-Registrierung über einen Einladungslink: nur für genau
					// die eingeladene Adresse (zweite Linie hinter passkey-link.ts).
					if (ctx?.path === "/passkey/verify-registration") {
						const r = await resolveRegistration(ctx.getCookie(REG_COOKIE));
						if (
							r.ok &&
							r.info.kind === "invite" &&
							r.info.email.toLowerCase() === newUser.email.toLowerCase()
						)
							return;
						throw new APIError("FORBIDDEN", {
							code: "new_user_signup_disabled",
							message: "Kein gültiger Einladungslink.",
						});
					}
					if (allowSignup || ctx?.path !== "/magic-link/verify") return;
					if (await pendingInvitationId(newUser.email)) return;
					throw new APIError("FORBIDDEN", {
						code: "new_user_signup_disabled",
						message: "Kein Konto und keine offene Einladung.",
					});
				},
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

	// before: Faktor-Endpunkte nur nach lib/auth/endpoint-policy.ts (sonst
	// Umgehung des zweiten Faktors über eine Mail-Link-Sitzung möglich)
	hooks: { before: authBeforeHook, after: authAfterHook },

	plugins: [
		magicLink({
			expiresIn: 15 * MINUTE,
			// Allow-List-Modus erzwingen wir selbst: Better Auth 1.7 verschickt
			// mit disableSignUp auch an unbekannte Adressen und scheitert erst
			// beim Klick (new_user_signup_disabled) — Eingeladene hätten so nie
			// ein Konto bekommen. Versand nur an Konten und offene Einladungen
			// (sendMagicLink), Konto-Anlage nur mit Einladung
			// (databaseHooks.user.create.before). Die Antwort ist in allen
			// Fällen identisch (kein User-Enumeration).
			disableSignUp: false,
			rateLimit: { window: 15 * MINUTE, max: 3 },
			storeToken: "hashed",
			async sendMagicLink({ email, url: verifyUrl }) {
				if (!allowSignup && !(await mayReceiveMagicLink(email))) {
					console.info(
						"[auth] Anmelde-Link nicht versendet: kein Konto und keine offene Einladung (AUTH_ALLOW_SIGNUP ist aus)",
					);
					return;
				}
				// Mail-Link zeigt auf die Bestätigungsseite, nicht auf den
				// Verify-Endpunkt (Link-Scanner verbrauchen sonst den Token).
				const url = confirmLinkUrl(verifyUrl);
				if (linkSink) {
					linkSink(url);
					return;
				}
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
			// Höchstens eine eigene Org je Konto; Berater-Zugänge (consultant)
			// zählen nicht (ADR-018, lib/auth/memberships.ts). Die Grenze beim
			// Beitritt prüft beforeAcceptInvitation.
			async organizationLimit(user) {
				return (await rolesOfUser(user.id)).some((r) => !isConsultant(r));
			},
			async allowUserToCreateOrganization(user) {
				return primaryMembershipCount(await rolesOfUser(user.id)) === 0;
			},
			creatorRole: "owner",
			membershipLimit: 250,
			invitationExpiresIn: 48 * HOUR,
			cancelPendingInvitationsOnReInvite: true,
			// Jede Einladung bekommt einen Passkey-Link (Token im Fragment, ADR-019);
			// das Team-Formular zeigt ihn zum Kopieren, die Mail ist optional
			// (inviteDelivery aus app/actions/team.ts).
			async sendInvitationEmail(data) {
				const delivery = inviteDelivery.getStore();
				const { url } = await issueRegistrationLink(
					{
						kind: "invite",
						invitationId: data.id,
						email: data.email,
						organizationId: data.organization.id,
					},
					new Date(data.invitation.expiresAt),
				);
				if (delivery) delivery.url = url;
				if (delivery && !delivery.mail) return;
				const tpl = invitationEmail({
					url,
					organization: data.organization.name,
					inviter: data.inviter.user.name || data.inviter.user.email,
					role: data.role,
				});
				const sent = await sendTransactionalMail({
					to: data.email,
					subject: tpl.subject,
					text: tpl.text,
					html: tpl.html,
				});
				if (delivery) delivery.mailed = sent.ok;
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
				async beforeAcceptInvitation({ invitation: inv, user }) {
					// Eine eigene Organisation je Konto, Berater-Zugänge beliebig viele.
					const rows = await globalDb
						.select({
							organizationId: member.organizationId,
							role: member.role,
						})
						.from(member)
						.where(eq(member.userId, user.id));
					if (rows.some((r) => r.organizationId === inv.organizationId)) {
						throw new APIError("FORBIDDEN", {
							message: "Du bist bereits Mitglied dieser Organisation.",
						});
					}
					const decision = membershipAllowed(
						rows.map((r) => r.role),
						inv.role,
					);
					if (!decision.ok) {
						throw new APIError("FORBIDDEN", {
							message:
								"Dieses Konto gehört bereits zu einer Organisation. Als Berater:in (extern) kannst du trotzdem eingeladen werden.",
						});
					}
				},
				async afterAcceptInvitation({ invitation, member: m, user }) {
					// Pflichtschulungen der Rolle sofort zuweisen.
					await withOrg(
						{ orgId: invitation.organizationId, userId: user.id },
						(tx) => syncTrainingAssignments(tx, invitation.organizationId),
					);
					// In der Einrichtung vorgemerkte Funktionen (pendingEmail) mit dem
					// neuen Konto verknüpfen (D1).
					await withOrg(
						{ orgId: invitation.organizationId, userId: user.id },
						(tx) =>
							tx
								.update(roleAssignments)
								.set({ userId: user.id, pendingEmail: null })
								.where(
									and(
										eq(
											roleAssignments.organizationId,
											invitation.organizationId,
										),
										eq(roleAssignments.pendingEmail, user.email.toLowerCase()),
									),
								),
					);
					// Externe (Prüfer:innen 6 Wochen, Berater:innen 90 Tage) bekommen
					// befristeten Zugang; Owner passt Ablauf und Grants auf /team an.
					const days = accessDaysFor(m.role);
					if (days) {
						await withOrg(
							{ orgId: invitation.organizationId, userId: user.id },
							(tx) =>
								tx
									.insert(memberAccess)
									.values({
										memberId: m.id,
										organizationId: invitation.organizationId,
										accessUntil: new Date(Date.now() + days * 86_400_000),
										grants: [],
										createdByUserId: invitation.inviterId,
									})
									.onConflictDoNothing(),
						);
					}
					// Better Auth aktiviert die neue Org sofort — ein Step-up aus der
					// bisherigen Org gilt dort nicht.
					await expireStepUp({ userId: user.id });
					await auditPlatform(
						{ userId: user.id },
						{
							action: "org.member_joined",
							target: `member:${m.id}`,
							organizationId: invitation.organizationId,
							after: {
								role: m.role,
								accessUntil: days ? `+${days}d` : null,
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
			// Passkey zuerst (ADR-019): auffindbar (Anmeldung ohne Adresse) und
			// mit Nutzerverifikation (Biometrie/PIN) — nur dann zählt er als
			// vollständiger zweiter Faktor.
			authenticatorSelection: {
				residentKey: "required",
				userVerification: "required",
			},
			// Registrierung ohne Sitzung nur über einen Einladungs- bzw.
			// Zurücksetz-Link (Token im httpOnly-Cookie, lib/auth/passkey-link.ts);
			// mit Sitzung gilt lib/auth/endpoint-policy.ts (MFA + Step-up).
			registration: {
				requireSession: false,
				resolveUser: ({ ctx, context }) =>
					linkRegistrationUser(ctx.getCookie(REG_COOKIE), context),
				afterVerification: ({ ctx, verification, user: u, context }) =>
					completeLinkRegistration({
						raw: ctx.getCookie(REG_COOKIE),
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
