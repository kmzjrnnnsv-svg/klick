import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import { db } from "@/db";
import {
	accounts,
	sessions,
	tenants,
	users,
	verificationTokens,
} from "@/db/schema";

async function sendMagicLinkEmail(identifier: string, url: string) {
	// Real SMTP path: when SMTP_HOST is set, send via Nodemailer.
	// Works with PrivateEmail (Namecheap), Brevo, Mailgun, your own server, etc.
	if (process.env.SMTP_HOST) {
		const nodemailer = await import("nodemailer");
		const port = Number(process.env.SMTP_PORT ?? 465);
		const transport = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port,
			// Port 465 = implicit TLS; 587 = STARTTLS upgrade.
			secure: port === 465,
			auth:
				process.env.SMTP_USER && process.env.SMTP_PASS
					? {
							user: process.env.SMTP_USER,
							pass: process.env.SMTP_PASS,
						}
					: undefined,
		});

		const from = process.env.MAIL_FROM ?? "noreply@klick.local";
		const host = new URL(url).host;
		await transport.sendMail({
			to: identifier,
			from,
			subject: "Dein Anmelde-Link für Klick",
			text:
				`Hier ist dein Anmelde-Link für ${host}:\n\n${url}\n\n` +
				`Gültig für 24 Stunden. Wenn du das nicht angefordert hast, ignoriere diese Mail.`,
			html: `
				<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
					<h1 style="font-size:18px;font-weight:600;margin:0 0 12px 0">Anmelden bei Klick</h1>
					<p style="margin:0 0 16px 0;font-size:14px;line-height:1.5">
						Klick auf den Button — du wirst direkt eingeloggt.
					</p>
					<p style="margin:0 0 16px 0">
						<a href="${url}" style="display:inline-block;background:#3B6FE4;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Bei ${host} anmelden</a>
					</p>
					<p style="margin:24px 0 0 0;font-size:12px;color:#666;line-height:1.5">
						Oder kopiere diesen Link manuell:<br/>
						<span style="word-break:break-all">${url}</span>
					</p>
					<p style="margin:24px 0 0 0;font-size:12px;color:#999">
						Gültig 24 Stunden. Nicht angefordert? Ignoriere diese Mail.
					</p>
				</div>
			`,
		});
		return;
	}

	// Dev fallback: log the magic link to the server console.
	console.log(
		`\n┌──── Magic Link ────────────────────────────────────\n│ to:  ${identifier}\n│ url: ${url}\n└────────────────────────────────────────────────────\n`,
	);
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
	providers: [emailProvider],
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
