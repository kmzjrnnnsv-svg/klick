import {
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
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
// Standard Auth.js fields + Klick extensions: tenant scope, role, locale,
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
// One row per file in a candidate's encrypted vault. Two flavors:
//   1) File upload — ciphertext in S3 under `storageKey`; `nonce` set so the
//      server can decrypt using the user's DEK (unwrapped from
//      `users.encryptedDek` via KEK). `sourceUrl` / `badgeMeta` null.
//   2) Open Badge from URL — no S3 file. `sourceUrl` points at the public
//      JSON-LD endpoint (Credly etc.); `badgeMeta` caches the parsed metadata
//      for display. Storage fields stay null.
//
// `encryptedDek` is reserved for future per-file rewrap (sharing/disclosure
// flows in P5) — for now files use the user-level DEK directly.
export type BadgeMeta = {
	name?: string;
	description?: string;
	imageUrl?: string;
	issuerName?: string;
	issuedAt?: string;
	criteriaUrl?: string;
};

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
	mime: text("mime"),
	sizeBytes: integer("size_bytes"),
	storageKey: text("storage_key"),
	nonce: text("nonce"), // base64
	encryptedDek: text("encrypted_dek"), // optional per-file rewrap (P5)
	sha256: text("sha256"), // hex of ciphertext for integrity + audit
	sourceUrl: text("source_url"), // populated for URL-based items (Credly badges)
	badgeMeta: jsonb("badge_meta").$type<BadgeMeta>(),
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

// ─── Employers ────────────────────────────────────────────────────────────
// One row per company. 1:1 with the owning employer-role user for now;
// multi-recruiter teams come later.
export const employers = pgTable("employers", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	tenantId: text("tenant_id")
		.notNull()
		.references(() => tenants.id, { onDelete: "cascade" }),
	companyName: text("company_name").notNull(),
	website: text("website"),
	description: text("description"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type Employer = typeof employers.$inferSelect;

// ─── Jobs ─────────────────────────────────────────────────────────────────
// Requirements live inline as JSONB (per P4 we'll keep this and join via the
// skills lookup table for vector match). Status drives visibility in /matches.
export type JobRequirement = {
	name: string;
	weight: "must" | "nice";
	minLevel?: 1 | 2 | 3 | 4 | 5;
};

export const jobs = pgTable("jobs", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	employerId: text("employer_id")
		.notNull()
		.references(() => employers.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	description: text("description").notNull(),
	location: text("location"),
	remotePolicy: text("remote_policy", {
		enum: ["onsite", "hybrid", "remote"],
	})
		.notNull()
		.default("hybrid"),
	employmentType: text("employment_type", {
		enum: ["fulltime", "parttime", "contract", "internship"],
	})
		.notNull()
		.default("fulltime"),
	salaryMin: integer("salary_min"),
	salaryMax: integer("salary_max"),
	yearsExperienceMin: integer("years_experience_min").default(0),
	languages: text("languages").array(),
	requirements: jsonb("requirements").$type<JobRequirement[]>(),
	status: text("status", { enum: ["draft", "published", "archived"] })
		.notNull()
		.default("draft"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;

// ─── Matches ──────────────────────────────────────────────────────────────
// Computed by lib/match/engine.ts whenever a job is published or a profile is
// saved. Hard score is binary pass/fail (0|100). Soft score 0-100 ranks the
// passing candidates. Rationale is a short LLM text shown to both sides.
//
// Status drives the Interest flow (P5):
//   suggested → employer hasn't acted yet
//   interested → employer requested verification (Interest record exists)
//   approved   → candidate granted disclosure
//   rejected   → either side declined
export const matches = pgTable(
	"matches",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		jobId: text("job_id")
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		candidateUserId: text("candidate_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		hardScore: integer("hard_score").notNull(),
		softScore: integer("soft_score").notNull(),
		rationale: text("rationale"),
		hardReasons: jsonb("hard_reasons").$type<string[]>(),
		matchedSkills: jsonb("matched_skills").$type<string[]>(),
		missingSkills: jsonb("missing_skills").$type<string[]>(),
		status: text("status", {
			enum: ["suggested", "interested", "approved", "rejected"],
		})
			.notNull()
			.default("suggested"),
		computedAt: timestamp("computed_at", { mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("matches_job_candidate_unique").on(t.jobId, t.candidateUserId),
	],
);

export type Match = typeof matches.$inferSelect;

// ─── Interests + Disclosures ──────────────────────────────────────────────
// An interest is the employer asking "I want to talk to this candidate".
// The candidate decides via decidedAt + status. When approved, identity
// (name + email) becomes visible to the employer for that job. Per-field
// disclosure (vault items, individual profile fields) lives in `disclosures`
// and is granted/revoked by the candidate independently.
export const interests = pgTable("interests", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	matchId: text("match_id")
		.notNull()
		.references(() => matches.id, { onDelete: "cascade" }),
	jobId: text("job_id")
		.notNull()
		.references(() => jobs.id, { onDelete: "cascade" }),
	employerId: text("employer_id")
		.notNull()
		.references(() => employers.id, { onDelete: "cascade" }),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	verifyDepth: text("verify_depth", {
		enum: ["light", "standard", "deep"],
	})
		.notNull()
		.default("light"),
	message: text("message"),
	status: text("status", {
		enum: ["pending", "approved", "rejected", "expired"],
	})
		.notNull()
		.default("pending"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { mode: "date" }),
	decidedAt: timestamp("decided_at", { mode: "date" }),
});

export type Interest = typeof interests.$inferSelect;

// ─── Audit log ────────────────────────────────────────────────────────────
// Append-only record of important actions (interest created/approved/rejected,
// vault delete, etc). Kept even after row deletions for compliance.
export const auditLog = pgTable("audit_log", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	tenantId: text("tenant_id").references(() => tenants.id),
	actorUserId: text("actor_user_id"),
	action: text("action").notNull(),
	target: text("target"),
	payload: jsonb("payload"),
	at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;

// ─── Verifications ────────────────────────────────────────────────────────
// One row per individual check triggered by an Interest. The orchestrator
// (lib/verify/orchestrator.ts) decides which connectors run for each
// verifyDepth (light = none, standard = cert + badge, deep = + identity).
//
// Connector slug references lib/verify/registry. Evidence is connector-shaped
// JSON (e.g. IDnow returns a transaction id; Credly returns badge JSON-LD).
export type VerificationKind = "identity" | "cert" | "badge" | "employment";

export const verifications = pgTable("verifications", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	interestId: text("interest_id")
		.notNull()
		.references(() => interests.id, { onDelete: "cascade" }),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	vaultItemId: text("vault_item_id").references(() => vaultItems.id, {
		onDelete: "set null",
	}),
	connector: text("connector").notNull(),
	kind: text("kind", {
		enum: ["identity", "cert", "badge", "employment"],
	}).notNull(),
	status: text("status", { enum: ["pending", "passed", "failed"] })
		.notNull()
		.default("pending"),
	message: text("message"),
	evidence: jsonb("evidence"),
	startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
	completedAt: timestamp("completed_at", { mode: "date" }),
});

export type Verification = typeof verifications.$inferSelect;
