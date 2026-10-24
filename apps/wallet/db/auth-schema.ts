import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// Better-Auth-Tabellen von both.money (von Hand gepflegt, Felder wie
// `better-auth/minimal` + Passkey-Plugin + additionalFields in
// lib/auth/server.ts). Keine Org-Spalte, kein RLS — der Adapter liest ohne
// Org-Kontext; Fachcode filtert explizit (wie ADR-009 bei Klick).

const uid = () =>
	uuid("id")
		.default(sql`pg_catalog.gen_random_uuid()`)
		.primaryKey();

export const user = pgTable("user", {
	id: uid(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	// Plattform-Rolle: "admin" = Betrieb von both.money (wallet:admin)
	role: text("role"),
});

export const session = pgTable(
	"session",
	{
		id: uid(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		activeOrgId: text("active_org_id"),
		mfaVerifiedAt: timestamp("mfa_verified_at"),
		lastActiveAt: timestamp("last_active_at"),
		stepUpAt: timestamp("step_up_at"),
		// Entsperrt per Passkey (15 min ab Bestätigung, nur in dieser Org)
		unlockedAt: timestamp("unlocked_at"),
		unlockOrgId: text("unlock_org_id"),
	},
	(t) => [index("session_userId_idx").on(t.userId)],
);

export const account = pgTable(
	"account",
	{
		id: uid(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: uid(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const passkey = pgTable(
	"passkey",
	{
		id: uid(),
		name: text("name"),
		publicKey: text("public_key").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("device_type").notNull(),
		backedUp: boolean("backed_up").notNull(),
		transports: text("transports"),
		createdAt: timestamp("created_at"),
		aaguid: text("aaguid"),
	},
	(t) => [
		index("passkey_userId_idx").on(t.userId),
		index("passkey_credentialID_idx").on(t.credentialID),
	],
);

export const rateLimit = pgTable("rate_limit", {
	id: uid(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
