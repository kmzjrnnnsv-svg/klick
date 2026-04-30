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

const consoleEmailProvider = {
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
		// P0 dev mock: log the magic link instead of sending mail.
		// In production, swap for Brevo SMTP via Nodemailer provider.
		console.log(
			`\n┌──── Magic Link ────────────────────────────────────\n│ to:  ${identifier}\n│ url: ${url}\n└────────────────────────────────────────────────────\n`,
		);
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
	providers: [consoleEmailProvider],
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
