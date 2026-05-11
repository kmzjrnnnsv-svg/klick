import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { db } from "@/db";
import {
	accounts,
	sessions,
	tenants,
	users,
	verificationTokens,
} from "@/db/schema";
import { sendTransactionalMail } from "@/lib/mail/send";
import { magicLinkEmail } from "@/lib/mail/templates";

// Optionaler Microsoft-SSO. Wird nur registriert wenn Client-ID +
// Secret + Tenant-ID per ENV gesetzt sind. Production-Setup:
//   AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID
// Im Azure Portal als Web-App registrieren mit Redirect-URL
//   https://<deine-domain>/api/auth/callback/microsoft-entra-id
export const isMicrosoftSsoEnabled = Boolean(
	process.env.AZURE_AD_CLIENT_ID &&
		process.env.AZURE_AD_CLIENT_SECRET &&
		process.env.AZURE_AD_TENANT_ID,
);

// Auth.js wirft eine generische "Server error"-Seite, wenn
// sendVerificationRequest throwt. Daher fangen wir hier alles ab —
// und vor allem schicken wir die Mail in `after()`, damit der Response
// SOFORT auf die /login/check-email-Seite redirected. Davor blockierte
// jede Magic-Link-Anforderung bis zu 35s (SMTP/Resend-Timeouts), was
// als "lange Ladezeit" sichtbar wurde.
async function sendMagicLinkEmail(identifier: string, url: string) {
	const host = (() => {
		try {
			return new URL(url).host;
		} catch {
			return "Klick";
		}
	})();
	const tpl = magicLinkEmail({ url, host });

	// 1) Sofort in die Konsole — Diagnostik in journalctl + Notfall-Zugang
	console.log(
		`\n┌──── Magic Link ────────────────────────────────────\n│ to:  ${identifier}\n│ url: ${url}\n└────────────────────────────────────────────────────\n`,
	);

	// 2) Mail im Hintergrund schicken — Response geht sofort weiter.
	after(async () => {
		try {
			const outcome = await sendTransactionalMail({
				to: identifier,
				subject: tpl.subject,
				text: tpl.text,
				html: tpl.html,
			});
			console.log(`[auth] magic-link mail dispatched via ${outcome.path}`);
		} catch (e) {
			console.error("[auth] sendMagicLinkEmail unexpected failure:", e);
		}
	});
}

const emailProvider = {
	id: "email",
	type: "email" as const,
	name: "Email",
	from: process.env.MAIL_FROM ?? "noreply@klick.local",
	maxAge: 60 * 60 * 24, // 24 hours
	options: {},
	async sendVerificationRequest({
		identifier,
		url,
	}: {
		identifier: string;
		url: string;
	}) {
		await sendMagicLinkEmail(identifier, url);
	},
};

export const authConfig = {
	adapter: DrizzleAdapter(db, {
		usersTable: users,
		accountsTable: accounts,
		sessionsTable: sessions,
		verificationTokensTable: verificationTokens,
	}),
	session: { strategy: "database" },
	pages: {
		signIn: "/login",
		verifyRequest: "/login/check-email",
	},
	providers: isMicrosoftSsoEnabled
		? [
				emailProvider,
				MicrosoftEntraID({
					clientId: process.env.AZURE_AD_CLIENT_ID,
					clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
					issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
				}),
			]
		: [emailProvider],
	events: {
		// Attach the default tenant to newly created users in dev.
		// Production: read x-tenant-slug from the request context (proxy.ts).
		async createUser({ user }) {
			if (!user.id) return;
			const slug = process.env.DEFAULT_TENANT_SLUG ?? "default";
			const [tenant] = await db
				.select()
				.from(tenants)
				.where(eq(tenants.slug, slug))
				.limit(1);
			if (tenant) {
				await db
					.update(users)
					.set({ tenantId: tenant.id })
					.where(eq(users.id, user.id));
			}
		},
	},
	callbacks: {
		// Allow-list-Modus: in der Testphase darf NICHT jeder mit beliebiger
		// E-Mail einen Magic-Link anfordern und damit ein Konto anlegen.
		// Stattdessen muss der Admin den User vorher per `pnpm upsert-user`
		// (oder Admin-UI) anlegen. Nur existierende User bekommen den Link.
		// Override via env: AUTH_ALLOW_SIGNUP=true erlaubt offene Registrierung.
		async signIn({ user, email }) {
			if (process.env.AUTH_ALLOW_SIGNUP === "true") return true;
			// Bei email-Provider: `email.verificationRequest` ist true beim
			// initialen Anforder-Schritt. Bei einem späteren Klick auf den Link
			// existiert der User schon und wir lassen durch.
			const isInitialEmailRequest = email?.verificationRequest === true;
			if (!isInitialEmailRequest) return true;
			const addr = (user?.email ?? "").trim().toLowerCase();
			if (!addr) return false;
			const [existing] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, addr))
				.limit(1);
			if (!existing) {
				console.warn(
					`[auth] signin blocked — no account for ${addr} (allow-list mode)`,
				);
				return false;
			}
			return true;
		},
		async session({ session, user }) {
			if (session.user) {
				// Surface custom fields to the client session.
				const u = user as typeof user & {
					role?: "candidate" | "employer" | "admin";
					locale?: "de" | "en";
					tenantId?: string;
				};
				session.user.id = user.id;
				(
					session.user as typeof session.user & {
						role: string;
						locale: string;
						tenantId: string;
					}
				).role = u.role ?? "candidate";
				(
					session.user as typeof session.user & {
						role: string;
						locale: string;
						tenantId: string;
					}
				).locale = u.locale ?? "de";
				(
					session.user as typeof session.user & {
						role: string;
						locale: string;
						tenantId: string;
					}
				).tenantId = u.tenantId ?? "";
			}
			return session;
		},
	},
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
