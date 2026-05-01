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
import { sendTransactionalMail } from "@/lib/mail/send";

// Auth.js wirft eine generische "Server error"-Seite, wenn
// sendVerificationRequest throwt. Daher fangen wir hier alles ab und
// loggen den Link notfalls in die Konsole — der Login-Flow kommt zur
// Bestätigungs-Seite, der Admin sieht in journalctl den Link.
async function sendMagicLinkEmail(identifier: string, url: string) {
	const host = (() => {
		try {
			return new URL(url).host;
		} catch {
			return "Klick";
		}
	})();
	const text =
		`Hier ist dein Anmelde-Link für ${host}:\n\n${url}\n\n` +
		`Gültig für 24 Stunden. Wenn du das nicht angefordert hast, ignoriere diese Mail.`;
	const html = `
		<div style="font-family:'Jost','Futura',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#211c14;background:#f7f3ec">
			<p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#6b5e4a;margin:0 0 24px 0">Maison Klick</p>
			<h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;margin:0 0 16px 0">Anmelden bei Klick</h1>
			<p style="margin:0 0 24px 0;font-size:14px;line-height:1.6">
				Klick auf den Button — du wirst direkt eingeloggt.
			</p>
			<p style="margin:0 0 24px 0">
				<a href="${url}" style="display:inline-block;background:#211c14;color:#f7f3ec;padding:14px 28px;border-radius:2px;text-decoration:none;font-size:11px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase">Bei ${host} anmelden</a>
			</p>
			<p style="margin:32px 0 0 0;font-size:12px;color:#6b5e4a;line-height:1.6">
				Oder kopiere den Link manuell:<br/>
				<span style="word-break:break-all">${url}</span>
			</p>
			<p style="margin:24px 0 0 0;font-size:11px;color:#a09478">
				Gültig 24 Stunden. Nicht angefordert? Ignoriere diese Mail.
			</p>
		</div>
	`;

	try {
		await sendTransactionalMail({
			to: identifier,
			subject: "Dein Anmelde-Link für Klick",
			text,
			html,
		});
	} catch (e) {
		console.error("[auth] sendMagicLinkEmail unexpected failure:", e);
	}
	// Immer zusätzlich in die Konsole loggen — als Diagnose-Hilfe und für
	// Dev/Demo-Setups, in denen Mail nicht zustellbar ist.
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
