import {
	boolean,
	doublePrecision,
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

// Result of running the AI extractor on an uploaded file. Shape varies by
// document kind — keep it loose so the AI module owns the strict types and
// the schema doesn't dictate them.
export type ExtractedDocumentMeta = {
	kind: "cv" | "certificate" | "id_doc" | "badge" | "other";
	data: Record<string, unknown>;
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
	// AI-extracted metadata + the kind the extractor settled on (may differ
	// from the user-supplied `kind` when auto-detection corrects it).
	// `extractedAt` is set even when extraction returns nothing — that way the
	// UI can distinguish "not yet processed" from "processed, no data".
	extractedKind: text("extracted_kind", {
		enum: ["cv", "certificate", "badge", "id_doc", "other"],
	}),
	extractedMeta: jsonb("extracted_meta").$type<ExtractedDocumentMeta>(),
	extractedAt: timestamp("extracted_at", { mode: "date" }),
	tags: text("tags").array(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type VaultItem = typeof vaultItems.$inferSelect;

// ─── Candidate profile ────────────────────────────────────────────────────
// Single row per candidate user. Skills + experience + education stored as
// JSONB for fast iteration in P2/P3; promoted to relational tables in P4
// when the match engine needs joins on skills.
export type ProfileSkill = { name: string; level?: 1 | 2 | 3 | 4 | 5 };
export type ProfileEmploymentType =
	| "employee"
	| "self_employed"
	| "freelance"
	| "founder"
	| "internship"
	| "other";

export type ProfileExperience = {
	company: string;
	role: string;
	start: string;
	end?: string;
	description?: string;
	// What kind of working relationship this row was. Inferred by the AI;
	// defaults to "employee" in display when missing.
	employmentType?: ProfileEmploymentType;
};
export type ProfileEducation = {
	institution: string;
	degree: string;
	start?: string;
	end?: string;
};

// Certifications mentioned in the CV body (distinct from vault-uploaded ones).
export type ProfileCertificationMention = {
	name: string;
	issuer?: string;
	year?: string;
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
	// Wunschgehalt — was der Kandidat aktiv anstrebt. salaryMin ist der
	// untere Akzeptanzwert ("darunter nicht"); salaryDesired ist die Ansage
	// nach oben ("das wäre für mich passend").
	salaryDesired: integer("salary_desired"),
	// Wer darf mich kontaktieren? Steuert sowohl die Match-Sichtbarkeit für
	// Headhunter-Employers (isAgency=true) als auch wer Angebote/Interessen
	// schicken darf. "none" = ich pausiere komplett.
	canBeContactedBy: text("can_be_contacted_by", {
		enum: ["all", "employers_only", "none"],
	})
		.notNull()
		.default("all"),
	// Aktiv auf Suche? Wird nach 30 Tagen automatisch auf false gesetzt; der
	// Kandidat bekommt eine Erinnerung. Off = Profil bleibt da, aber keine
	// neuen Anfragen/Angebote werden zugestellt.
	openToOffers: boolean("open_to_offers").notNull().default(true),
	openToOffersUntil: timestamp("open_to_offers_until", { mode: "date" }),
	languages: text("languages").array(),
	skills: jsonb("skills").$type<ProfileSkill[]>(),
	experience: jsonb("experience").$type<ProfileExperience[]>(),
	education: jsonb("education").$type<ProfileEducation[]>(),
	summary: text("summary"),
	// Richer fields the CV-extractor mines from the document body. All optional.
	industries: text("industries").array(), // e.g. ["Fintech", "Healthcare"]
	awards: text("awards").array(), // free-form short strings
	certificationsMentioned: jsonb("certifications_mentioned").$type<
		ProfileCertificationMention[]
	>(), // certs cited in the CV but not uploaded to vault
	mobility: text("mobility"), // "remote", "hybrid Berlin", "open to relocation"
	preferredRoleLevel: text("preferred_role_level", {
		enum: ["junior", "mid", "senior", "lead", "principal", "exec"],
	}),
	// Commute willingness — used by the match engine when the job is not remote.
	// Distance is computed via lat/lng (geocoded once and cached). Transport
	// mode is informational for now; minute-thresholds are an honest straight-
	// line + speed-class estimate until we wire a routing API.
	maxCommuteMinutes: integer("max_commute_minutes"), // null = no preference
	transportMode: text("transport_mode", {
		enum: ["car", "transit", "bike", "walk"],
	}),
	addressLat: doublePrecision("address_lat"),
	addressLng: doublePrecision("address_lng"),
	visibility: text("visibility", {
		enum: ["private", "matches_only", "public"],
	})
		.notNull()
		.default("matches_only"),
	// Set when the candidate completes the onboarding wizard (or skips to the
	// end). Drives /post-login routing — null = funnel them through the wizard,
	// timestamp = treat as a returning user and go straight to /vault.
	onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: "date" }),
	// Computed insights (tenure stats, cert analytics, narrative). Filled by
	// recomputeInsights() whenever profile or vault changes. Never touched by
	// user input. Shape: see lib/insights/types.ts (CandidateInsights).
	insights: jsonb("insights"),
	insightsUpdatedAt: timestamp("insights_updated_at", { mode: "date" }),
	// Opaque token candidate can share to expose a read-only public profile
	// at /p/<token>. Null = sharing disabled. Re-generated on revoke+enable.
	publicShareToken: text("public_share_token").unique(),
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
	// Headhunter / Personalberatung. Same access rights as a regular employer
	// for now; the flag drives onboarding copy + UI labels ("Im Auftrag von …").
	isAgency: boolean("is_agency").notNull().default(false),
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
	// Cached geocode of `location` — set when the job is saved.
	locationLat: doublePrecision("location_lat"),
	locationLng: doublePrecision("location_lng"),
	// AI-estimated market salary range for this role + location + level.
	// Computed on save; null if AI hasn't returned a guess.
	salaryBenchmarkLow: integer("salary_benchmark_low"),
	salaryBenchmarkHigh: integer("salary_benchmark_high"),
	// Verdict relative to declared salaryMin/Max. "under" → employer pays
	// less than market, "over" → above market, "fair" → within ±5%, null
	// when no declared salary or no benchmark.
	salaryFairness: text("salary_fairness", {
		enum: ["under", "fair", "over"],
	}),
	// Percentage delta vs midpoint of benchmark (negative = below market).
	salaryDeltaPct: integer("salary_delta_pct"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;

// Editorial pages (Impressum, Datenschutz, AGB, …) per tenant. Admin-only
// edit, public read. Keyed by slug so /imprint resolves to slug='imprint'.
export const cmsPages = pgTable(
	"cms_pages",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull().default(""),
		updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
		updatedByUserId: text("updated_by_user_id").references(() => users.id),
	},
	(t) => [unique("cms_pages_tenant_slug_unique").on(t.tenantId, t.slug)],
);

export type CmsPage = typeof cmsPages.$inferSelect;

// Geocode cache so we don't hammer Nominatim on every save. Key is the
// normalized location string (lowercased, trimmed); value is the resolved
// lat/lng or null when the geocoder couldn't place it.
export const geocodeCache = pgTable("geocode_cache", {
	query: text("query").primaryKey(),
	lat: doublePrecision("lat"),
	lng: doublePrecision("lng"),
	resolvedAt: timestamp("resolved_at", { mode: "date" }).notNull().defaultNow(),
});

// Per-file disclosure: which vault items has the candidate explicitly
// shared with a given interest? Empty = nothing shared, the employer just
// sees identity (after Interest is approved). Each row is a one-way grant.
export const disclosures = pgTable(
	"disclosures",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		interestId: text("interest_id")
			.notNull()
			.references(() => interests.id, { onDelete: "cascade" }),
		vaultItemId: text("vault_item_id")
			.notNull()
			.references(() => vaultItems.id, { onDelete: "cascade" }),
		grantedAt: timestamp("granted_at", { mode: "date" }).notNull().defaultNow(),
		revokedAt: timestamp("revoked_at", { mode: "date" }),
	},
	(t) => [
		unique("disclosures_interest_vault_unique").on(t.interestId, t.vaultItemId),
	],
);

export type Disclosure = typeof disclosures.$inferSelect;

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
		// Skills the candidate brings that aren't exact matches but live in
		// the same skill cluster as a required skill (Quereinstieg).
		adjacentSkills: jsonb("adjacent_skills").$type<string[]>(),
		// Cached commute computation for the employer view: km + minutes +
		// transport mode + whether it exceeds the candidate's preference.
		commute: jsonb("commute").$type<{
			km: number;
			minutes: number;
			mode: "car" | "transit" | "bike" | "walk";
			exceedsLimit: boolean;
		}>(),
		// Pro/Con bullet points produced by the AI matcher. Surfaced in the
		// detail view next to the rationale.
		pros: jsonb("pros").$type<string[]>(),
		cons: jsonb("cons").$type<string[]>(),
		// Years comparison: candidate vs required + tenure context. Short
		// string for the UI to display verbatim ("9 J. — 3 mehr als gefordert").
		experienceVerdict: text("experience_verdict"),
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

// ─── Favorites ────────────────────────────────────────────────────────────
// Per-Job-Shortlist eines Arbeitgebers. Favoriten bleiben anonym bis zur
// Approval — der Star ist nur die Notiz "den merke ich mir, evtl. Angebot".
export const favorites = pgTable(
	"favorites",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		employerId: text("employer_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		jobId: text("job_id")
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		candidateUserId: text("candidate_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Kurze interne Notiz, nur für den Employer sichtbar.
		notes: text("notes"),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	},
	(t) => [
		unique("favorites_unique").on(t.employerId, t.jobId, t.candidateUserId),
	],
);

export type Favorite = typeof favorites.$inferSelect;

// ─── Offers ───────────────────────────────────────────────────────────────
// FIFA-Karrieremode-Style "Transfer-Angebot" — der Arbeitgeber/Headhunter
// macht ein konkretes Angebot mit Gehalt + Startdatum + Position. Der
// Kandidat sieht das Angebot, kann das Unternehmen + die Stelle ansehen
// und annehmen/ablehnen/Gegenangebot abgeben (counter via parentOfferId).
export const offers = pgTable("offers", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	jobId: text("job_id")
		.notNull()
		.references(() => jobs.id, { onDelete: "cascade" }),
	employerId: text("employer_id")
		.notNull()
		.references(() => employers.id, { onDelete: "cascade" }),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// Falls Counter-Offer: zeigt auf das vorherige Angebot. So entsteht eine
	// Verhandlungs-Kette pro Job/Kandidat.
	parentOfferId: text("parent_offer_id"),
	roleTitle: text("role_title").notNull(),
	salaryProposed: integer("salary_proposed").notNull(),
	startDateProposed: timestamp("start_date_proposed", { mode: "date" }),
	message: text("message"),
	status: text("status", {
		enum: [
			"pending",
			"seen",
			"accepted",
			"declined",
			"countered",
			"withdrawn",
			"expired",
		],
	})
		.notNull()
		.default("pending"),
	// Wer hat das Angebot zuletzt verändert? "employer" = ursprüngliches
	// Angebot oder Counter vom Employer; "candidate" = Counter vom Kandidaten.
	lastActor: text("last_actor", {
		enum: ["employer", "candidate"],
	})
		.notNull()
		.default("employer"),
	decidedMessage: text("decided_message"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { mode: "date" }),
	decidedAt: timestamp("decided_at", { mode: "date" }),
});

export type Offer = typeof offers.$inferSelect;

// ─── Notifications ────────────────────────────────────────────────────────
// Generischer Activity-Feed pro User. UI rendert je nach `kind` einen
// passenden Link. Mail-Versand ist orthogonal — Notifications sind die
// In-App-Variante.
export const notifications = pgTable("notifications", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: [
			"new_match",
			"new_interest",
			"interest_decided",
			"new_offer",
			"offer_decided",
			"verification_done",
			"saved_search_hit",
			"system",
		],
	}).notNull(),
	title: text("title").notNull(),
	body: text("body"),
	link: text("link"),
	payload: jsonb("payload"),
	readAt: timestamp("read_at", { mode: "date" }),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;

// ─── Saved Searches ───────────────────────────────────────────────────────
// Kandidat speichert einen Filtersatz (Skills, remote, salary, location).
// Ein Hintergrund-Job (P4) prüft täglich ob neue Jobs matchen und legt
// eine Notification + Mail an.
export const savedSearches = pgTable("saved_searches", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	criteria: jsonb("criteria")
		.$type<{
			query?: string;
			skills?: string[];
			remote?: "remote_only" | "no_remote" | "any";
			minSalary?: number;
			maxCommuteMinutes?: number;
			location?: string;
		}>()
		.notNull(),
	notifyChannel: text("notify_channel", {
		enum: ["inapp", "email", "both"],
	})
		.notNull()
		.default("inapp"),
	lastNotifiedAt: timestamp("last_notified_at", { mode: "date" }),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;

// ─── Job Questions (anonymous Q&A) ────────────────────────────────────────
// Vor der Identitäts-Freigabe darf der/die Kandidat:in dem Arbeitgeber
// Fragen stellen ("Wieviel Onsite?", "Welcher Tech-Stack im Backend?").
// Der Employer sieht den Klarnamen NICHT — nur den anonymen Bezug zur
// Stelle. Antworten können als "public" markiert werden — dann tauchen
// sie als FAQ auf der öffentlichen Stellen-Detailseite auf.
export const jobQuestions = pgTable("job_questions", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	jobId: text("job_id")
		.notNull()
		.references(() => jobs.id, { onDelete: "cascade" }),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	body: text("body").notNull(),
	answer: text("answer"),
	answeredAt: timestamp("answered_at", { mode: "date" }),
	answeredByUserId: text("answered_by_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	// Wenn true, ist die Antwort öffentlich auf /jobs/browse/[id] sichtbar.
	// Frage selbst wird anonymisiert. Default false → privater Q&A-Faden.
	isPublic: boolean("is_public").notNull().default(false),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type JobQuestion = typeof jobQuestions.$inferSelect;
