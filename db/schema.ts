import {
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// ─── Tenants ──────────────────────────────────────────────────────────────
// One row per whitelabel customer. Subdomain = `slug`. Always present (default
// tenant seeded for local dev).
export const tenants = pgTable("tenants", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;

// ─── Users (extended Auth.js shape) ───────────────────────────────────────
// Standard Auth.js fields + TrustVault extensions: tenant scope, role, locale,
// envelope-encrypted DEK for vault crypto (added in P1).
export const users = pgTable("users", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	// Nullable so Auth.js can insert a fresh user during magic-link verification.
	// Populated by the `createUser` event in auth.ts (set to default tenant locally,
	// to subdomain-resolved tenant in production).
	tenantId: text("tenant_id").references(() => tenants.id, {
		onDelete: "cascade",
	}),
	email: text("email").notNull().unique(),
	emailVerified: timestamp("email_verified", { mode: "date" }),
	name: text("name"),
	image: text("image"),
	role: text("role", { enum: ["candidate", "employer", "admin"] })
		.notNull()
		.default("candidate"),
	locale: text("locale", { enum: ["de", "en"] })
		.notNull()
		.default("de"),
	encryptedDek: text("encrypted_dek"), // populated on first vault upload (P1)
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

// ─── Auth.js: accounts, sessions, verificationTokens ──────────────────────
// Accounts kept for future OAuth (Credly etc); empty for magic-link-only flows.
export const accounts = pgTable(
	"accounts",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		provider: text("provider").notNull(),
		providerAccountId: text("provider_account_id").notNull(),
		refresh_token: text("refresh_token"),
		access_token: text("access_token"),
		expires_at: integer("expires_at"),
		token_type: text("token_type"),
		scope: text("scope"),
		id_token: text("id_token"),
		session_state: text("session_state"),
	},
	(t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
	sessionToken: text("session_token").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
	"verification_tokens",
	{
		identifier: text("identifier").notNull(),
		token: text("token").notNull(),
		expires: timestamp("expires", { mode: "date" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ─── Vault items ──────────────────────────────────────────────────────────
// One row per file in a candidate's encrypted vault. Ciphertext lives in S3
// under `storageKey`; nonce is stored alongside so the server can decrypt
// using the user's DEK (unwrapped from `users.encryptedDek` via KEK).
//
// `encryptedDek` here is reserved for future per-file rewrap (sharing/disclosure
// flows in P5) — for now files use the user-level DEK directly.
export const vaultItems = pgTable("vault_items", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: ["cv", "certificate", "badge", "id_doc", "other"],
	})
		.notNull()
		.default("other"),
	filename: text("filename").notNull(),
	mime: text("mime").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	storageKey: text("storage_key").notNull(),
	nonce: text("nonce").notNull(), // base64
	encryptedDek: text("encrypted_dek"), // optional per-file rewrap (P5)
	sha256: text("sha256").notNull(), // hex of ciphertext for integrity + audit
	tags: text("tags").array(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type VaultItem = typeof vaultItems.$inferSelect;

// ─── Candidate profile ────────────────────────────────────────────────────
// Single row per candidate user. Skills + experience + education stored as
// JSONB for fast iteration in P2/P3; promoted to relational tables in P4
// when the match engine needs joins on skills.
export type ProfileSkill = { name: string; level?: 1 | 2 | 3 | 4 | 5 };
export type ProfileExperience = {
	company: string;
	role: string;
	start: string;
	end?: string;
	description?: string;
};
export type ProfileEducation = {
	institution: string;
	degree: string;
	start?: string;
	end?: string;
};

export const candidateProfiles = pgTable("candidate_profiles", {
	userId: text("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	displayName: text("display_name"),
	headline: text("headline"),
	location: text("location"),
	yearsExperience: integer("years_experience"),
	salaryMin: integer("salary_min"),
	languages: text("languages").array(),
	skills: jsonb("skills").$type<ProfileSkill[]>(),
	experience: jsonb("experience").$type<ProfileExperience[]>(),
	education: jsonb("education").$type<ProfileEducation[]>(),
	summary: text("summary"),
	visibility: text("visibility", {
		enum: ["private", "matches_only", "public"],
	})
		.notNull()
		.default("matches_only"),
	updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type CandidateProfile = typeof candidateProfiles.$inferSelect;
