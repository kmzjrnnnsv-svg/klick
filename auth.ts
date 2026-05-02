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
import { magicLinkEmail } from "@/lib/mail/templates";

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
	const tpl = magicLinkEmail({ url, host });

	try {
		await sendTransactionalMail({
			to: identifier,
			subject: tpl.subject,
			text: tpl.text,
			html: tpl.html,
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
