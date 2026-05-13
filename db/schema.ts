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
	// Admin sperrt einen Account: kein Login mehr möglich, Match-Engine
	// blendet User aus. blockedReason ist Klartext für den Audit-Trail.
	blockedAt: timestamp("blocked_at", { mode: "date" }),
	blockedReason: text("blocked_reason"),
	// Markierung für Demo-/Seed-Daten — erlaubt einen sauberen Bulk-Purge
	// nachdem die Demo gezeigt wurde. Echte User haben das Feld auf null.
	demoBatchId: text("demo_batch_id"),
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

// Felder die bei Sprachwechsel übersetzt werden. Eigennamen (Firmen,
// Personennamen, Locations) bleiben gleich, ebenso Skills die feste
// Begriffe sind (ISO 27001, AWS, …) — die KI entscheidet das.
export type ProfileTranslationFields = {
	headline?: string;
	summary?: string;
	industries?: string[];
	languages?: string[];
	skills?: { name: string; level?: number }[];
	experience?: {
		role: string;
		description?: string;
	}[];
	education?: {
		degree: string;
		thesisTitle?: string;
		focus?: string;
	}[];
	awards?: string[];
	mobility?: string;
	projects?: {
		name: string;
		role?: string;
		description?: string;
	}[];
	publications?: {
		title: string;
		venue?: string;
	}[];
	volunteering?: {
		organization: string;
		role: string;
		description?: string;
	}[];
};
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
	// false wenn das Studium abgebrochen / ohne Abschluss beendet wurde.
	// undefined ⇒ als abgeschlossen behandeln (Default für Altdaten).
	completed?: boolean;
	// Strukturierte Anreicherung — werden separat von `degree` gespeichert,
	// damit Filter + Public-CV-View sauber rendern können.
	degreeType?:
		| "school"
		| "apprenticeship"
		| "bachelor"
		| "master"
		| "phd"
		| "mba"
		| "other";
	grade?: string; // "1.7", "summa cum laude", "Distinction"
	thesisTitle?: string;
	focus?: string; // Schwerpunkt / Vertiefung
};

// Veröffentlichungen, Vorträge, Patente — gemischt in eine Liste, da der
// Lebenslauf sie meist zusammen führt. `kind` macht Filter möglich.
export type ProfilePublication = {
	title: string;
	year?: string;
	kind?: "article" | "talk" | "patent" | "book" | "other";
	venue?: string;
	url?: string;
};

// Open-Source / Side Projects.
export type ProfileProject = {
	name: string;
	role?: string;
	url?: string;
	description?: string;
};

// Ehrenamt.
export type ProfileVolunteering = {
	organization: string;
	role: string;
	start?: string;
	end?: string;
	description?: string;
};

// Verfügbarkeit / Kündigungsfrist.
export type ProfileAvailability = {
	status: "immediate" | "notice" | "date" | "unknown";
	noticeWeeks?: number;
	availableFrom?: string; // ISO YYYY-MM-DD
};

// Social-/Portfolio-Links.
export type ProfileSocialLinks = {
	github?: string;
	linkedin?: string;
	xing?: string;
	website?: string;
	other?: string;
};

// Per-Sektion-Sichtbarkeit. Default = "matches_only" für jede Sektion. Nur
// Sektionen mit "public" tauchen in /p/[token] auf.
export type ProfileSectionVisibility = Partial<
	Record<ProfileSectionKey, "private" | "matches_only" | "public">
>;

// Gehalt-Erwartung in zusätzlichen Ländern. Maximal 2 Einträge zusätzlich zum
// Heimatland. Empfehlung kommt von der KI auf Knopfdruck.
export type ProfileSalaryByCountry = {
	// ISO-Country-Code (DE, AT, CH, GB, US, NL, …).
	country: string;
	// 3-Letter Currency (EUR, GBP, USD, CHF).
	currency: string;
	min?: number;
	desired?: number;
	recommendation?: {
		low: number;
		mid: number;
		high: number;
		rationale: string;
		generatedAt: string; // ISO date
	};
};

export type ProfileSectionKey =
	| "basics"
	| "summary"
	| "skills"
	| "experience"
	| "education"
	| "certifications"
	| "publications"
	| "projects"
	| "volunteering"
	| "awards"
	| "industries"
	| "availability"
	| "socialLinks"
	| "drivingLicenses"
	| "salary";

// Certifications mentioned in the CV body (distinct from vault-uploaded ones).
// `name` ist die offizielle Anbieter-Bezeichnung wo möglich; bei generischen
// Lehrgängen behalten wir den CV-Wortlaut. `verbatim` hält das Original.
export type ProfileCertificationMention = {
	name: string;
	issuer?: string;
	year?: string;
	status?: "obtained" | "in_preparation" | "course_completed" | "unknown";
	verbatim?: string;
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
	// Comprehensive career analysis from AI: salary band, primary +
	// adjacent industries, certification suggestions, hiring pros/cons,
	// market context. Shape: see lib/ai/types.ts (CareerAnalysis).
	careerAnalysis: jsonb("career_analysis"),
	careerAnalysisAt: timestamp("career_analysis_at", { mode: "date" }),
	// Opaque token candidate can share to expose a read-only public profile
	// at /p/<token>. Null = sharing disabled. Re-generated on revoke+enable.
	publicShareToken: text("public_share_token").unique(),
	// Original-Sprache des Profils — wird beim CV-Parse oder beim ersten
	// Speichern gesetzt. Wird gebraucht um zu wissen welches Feld die
	// "Quelle" ist und welches die Übersetzung.
	profileLanguageOrigin: text("profile_language_origin", {
		enum: ["de", "en"],
	}),
	// Übersetzte Felder in die "andere" Sprache. Wird im Hintergrund per
	// AI gefüllt nach jedem Save. Form: { de?: ProfileTranslationFields,
	// en?: ProfileTranslationFields }. Bei Anzeige in nicht-Origin-Locale
	// werden die Felder von hier gemerged.
	translations: jsonb("translations").$type<{
		de?: ProfileTranslationFields;
		en?: ProfileTranslationFields;
	}>(),
	translationsUpdatedAt: timestamp("translations_updated_at", {
		mode: "date",
	}),
	// Optionale Anreicherungs-Sektionen.
	publications: jsonb("publications").$type<ProfilePublication[]>(),
	projects: jsonb("projects").$type<ProfileProject[]>(),
	volunteering: jsonb("volunteering").$type<ProfileVolunteering[]>(),
	drivingLicenses: text("driving_licenses").array(), // ["B", "BE", "C1"]
	availability: jsonb("availability").$type<ProfileAvailability>(),
	socialLinks: jsonb("social_links").$type<ProfileSocialLinks>(),
	workPermitStatus: text("work_permit_status", {
		enum: ["eu", "permit", "requires_sponsorship", "unknown"],
	}),
	// Per-Sektion-Sichtbarkeit. Default = matches_only für alle Sektionen.
	// Nur "public" Sektionen erscheinen unter /p/<token>.
	sectionVisibility:
		jsonb("section_visibility").$type<ProfileSectionVisibility>(),
	// Bis zu 2 zusätzliche Länder mit eigenem Gehalt + KI-Empfehlung.
	salaryByCountry: jsonb("salary_by_country").$type<ProfileSalaryByCountry[]>(),
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
	// Admin sperrt das Unternehmen: keine neuen Stellen mehr, bestehende
	// werden im Browse versteckt.
	blockedAt: timestamp("blocked_at", { mode: "date" }),
	blockedReason: text("blocked_reason"),
	demoBatchId: text("demo_batch_id"),
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
	// Analytical metadata employers fill in to make the role legible to
	// candidates. All optional, but a posting with 0 of these gets a
	// quality penalty in the AI assessor.
	teamSize: integer("team_size"),
	growthStage: text("growth_stage", {
		enum: [
			"pre_seed",
			"seed",
			"series_a",
			"series_b",
			"series_c_plus",
			"profitable",
			"public",
			"non_profit",
			"agency",
		],
	}),
	techStackDetail: text("tech_stack_detail"),
	decisionProcess: text("decision_process"), // "1 Screening + 2 Tech-Interviews + Take-Home"
	remoteOnsiteRatio: integer("remote_onsite_ratio"), // 0-100, % remote
	mustReasoning: text("must_reasoning"), // why these are MUSTs
	first90DaysGoals: text("first_90_days_goals"),
	// Cached job-posting quality assessment from AI.
	postingQuality: jsonb("posting_quality"),
	// Hiring-Process-Template, das beim Veröffentlichen nach `job_stages`
	// kopiert wird. Null = Legacy-Pfad (klassische Status-Enum-Timeline).
	templateId: text("template_id"),
	// Ehrlichkeits-Flag aus dem Strategie-Plan: "open" = echte offene Stelle,
	// "internal_preferred" = interner Kandidat ist im Rennen, "compliance_only"
	// = Pflicht-Ausschreibung ohne realistische Chance. Wird Kandidaten als
	// Badge gezeigt.
	honestPostingFlag: text("honest_posting_flag", {
		enum: ["open", "internal_preferred", "compliance_only"],
	})
		.notNull()
		.default("open"),
	demoBatchId: text("demo_batch_id"),
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
	// Quelle des Interests:
	//   'match'          → klassisch via Match-Liste (matchId gesetzt)
	//   'direct'         → Employer hat Public-Share-Profil entdeckt
	//   'recommendation' → Recruiter hat Kandidat empfohlen
	source: text("source", {
		enum: ["match", "direct", "recommendation"],
	})
		.notNull()
		.default("match"),
	// Nur bei source='match' gefüllt. Bei direct/recommendation null.
	matchId: text("match_id").references(() => matches.id, {
		onDelete: "cascade",
	}),
	// Nur bei source='recommendation' gefüllt: der Recruiter-User.
	recommenderUserId: text("recommender_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	// Nullable: 'direct' kann auch "nur kennenlernen" ohne konkrete Stelle.
	// 'match' und 'recommendation' setzen es immer.
	jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
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

// ─── Skill Assessments ─────────────────────────────────────────────────────
// Optionales Mini-Assessment pro Stelle. Employer legt 3-7 Fragen an
// (Multiple-Choice mit gewichteten Antworten + offene Fragen). Kandidat
// beantwortet vor / während Disclosure. KI bewertet offene Antworten;
// MC wird gegen die `correctChoice` gerechnet. Score taucht im Match auf.
export type AssessmentChoice = { text: string; weight: number };

export const jobAssessments = pgTable("job_assessments", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	jobId: text("job_id")
		.notNull()
		.unique()
		.references(() => jobs.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type JobAssessment = typeof jobAssessments.$inferSelect;

export const jobAssessmentQuestions = pgTable("job_assessment_questions", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	assessmentId: text("assessment_id")
		.notNull()
		.references(() => jobAssessments.id, { onDelete: "cascade" }),
	position: integer("position").notNull().default(0),
	kind: text("kind", { enum: ["mc", "open"] }).notNull(),
	body: text("body").notNull(),
	// MC only — list of options with per-choice weight (0 - maxPoints).
	// `correctChoice` is the index that scores the full maxPoints; other
	// indices use their own weight as partial credit.
	choices: jsonb("choices").$type<AssessmentChoice[]>(),
	correctChoice: integer("correct_choice"),
	// For open questions, this is the rubric the AI uses to grade.
	rubric: text("rubric"),
	maxPoints: integer("max_points").notNull().default(1),
});

export type JobAssessmentQuestion = typeof jobAssessmentQuestions.$inferSelect;

export const assessmentResponses = pgTable(
	"assessment_responses",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		assessmentId: text("assessment_id")
			.notNull()
			.references(() => jobAssessments.id, { onDelete: "cascade" }),
		jobId: text("job_id")
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		candidateUserId: text("candidate_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["in_progress", "submitted", "graded"],
		})
			.notNull()
			.default("in_progress"),
		// Per-question entries with answer + grading. Keep inline for now —
		// 5-10 answers per response is comfortable JSONB.
		answers: jsonb("answers")
			.$type<
				Array<{
					questionId: string;
					kind: "mc" | "open";
					choiceIndex?: number;
					openText?: string;
					pointsEarned?: number;
					aiFeedback?: string;
				}>
			>()
			.notNull()
			.default([]),
		totalScore: integer("total_score"),
		maxScore: integer("max_score"),
		submittedAt: timestamp("submitted_at", { mode: "date" }),
		gradedAt: timestamp("graded_at", { mode: "date" }),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	},
	(t) => [
		unique("assessment_response_unique").on(t.assessmentId, t.candidateUserId),
	],
);

export type AssessmentResponse = typeof assessmentResponses.$inferSelect;

// ─── Outcomes ──────────────────────────────────────────────────────────────
// Feedback-Loop für Match-Qualität. Wird nach abgeschlossenem Offer-Flow
// gefragt: "Hat das zum Vertrag geführt?" Beide Seiten dürfen melden;
// die KI nutzt diese Daten später als Feedback (P5+).
export const outcomes = pgTable(
	"outcomes",
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
		employerId: text("employer_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		// Wer hat das Outcome eingetragen? Beide Seiten dürfen — wir
		// vergleichen die Aussagen falls inkonsistent.
		reportedByRole: text("reported_by_role", {
			enum: ["candidate", "employer"],
		}).notNull(),
		reportedByUserId: text("reported_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind", {
			enum: [
				"hired",
				"declined_by_candidate",
				"declined_by_employer",
				"in_negotiation",
				"no_response",
			],
		}).notNull(),
		notes: text("notes"),
		// Optional: Endgehalt, falls "hired". Hilft bei Salary-Benchmark-
		// Lernen.
		finalSalary: integer("final_salary"),
		reportedAt: timestamp("reported_at", { mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("outcome_per_role_unique").on(
			t.jobId,
			t.candidateUserId,
			t.reportedByRole,
		),
	],
);

export type Outcome = typeof outcomes.$inferSelect;

// ─── Diversity Self-ID ─────────────────────────────────────────────────────
// Strikt opt-in. Daten erscheinen NUR aggregiert (für Employer-Bias-
// Checks und interne Statistiken). Jeder Eintrag ist optional. Kandidat
// kann jederzeit löschen oder zurückziehen.
export const diversityResponses = pgTable("diversity_responses", {
	userId: text("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	genderIdentity: text("gender_identity"),
	ethnicity: text("ethnicity"),
	hasDisability: boolean("has_disability"),
	ageRange: text("age_range"),
	consentedAt: timestamp("consented_at", { mode: "date" })
		.notNull()
		.defaultNow(),
});

export type DiversityResponse = typeof diversityResponses.$inferSelect;

// ─── Reference Checks ──────────────────────────────────────────────────────
// Opt-in: Kandidat trägt einen alten Vorgesetzten ein, das System
// schickt eine Mail mit 3 Fragen + Token. Antworten landen verschlüsselt
// in der Tabelle. Anti-Phishing: nur per gültigem Token zugreifbar.
export const referenceChecks = pgTable("reference_checks", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	refereeName: text("referee_name").notNull(),
	refereeEmail: text("referee_email").notNull(),
	refereeRelation: text("referee_relation"), // "former manager", "peer", ...
	token: text("token").notNull().unique(),
	status: text("status", {
		enum: ["pending", "submitted", "expired"],
	})
		.notNull()
		.default("pending"),
	// Antworten — JSONB mit { question, answer } Paaren.
	answers: jsonb("answers").$type<{ question: string; answer: string }[]>(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
	submittedAt: timestamp("submitted_at", { mode: "date" }),
});

export type ReferenceCheck = typeof referenceChecks.$inferSelect;

// ─── Reference Disclosures ────────────────────────────────────────────────
// Per-Interest-Freigabe einer Referenz an genau einen Arbeitgeber. Solange
// kein Disclosure existiert, sieht der Employer nichts. Revoke setzt
// revokedAt — das blendet die Antwort sofort aus.
export const referenceDisclosures = pgTable(
	"reference_disclosures",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		interestId: text("interest_id")
			.notNull()
			.references(() => interests.id, { onDelete: "cascade" }),
		referenceCheckId: text("reference_check_id")
			.notNull()
			.references(() => referenceChecks.id, { onDelete: "cascade" }),
		grantedAt: timestamp("granted_at", { mode: "date" }).notNull().defaultNow(),
		revokedAt: timestamp("revoked_at", { mode: "date" }),
	},
	(t) => [
		unique("reference_disclosures_unique").on(t.interestId, t.referenceCheckId),
	],
);

export type ReferenceDisclosure = typeof referenceDisclosures.$inferSelect;

// ─── Agency Members ────────────────────────────────────────────────────────
// Mehrere Recruiter pro Employer/Agency. Owner kann andere User per E-Mail
// einladen (User wird beim ersten Login mit dem Token verknüpft). Rolle
// owner = Vollzugriff (inkl. Member-Verwaltung), recruiter = darf alles
// auf Stellen + Kandidaten, viewer = nur Lesen.
export const agencyMembers = pgTable(
	"agency_members",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		employerId: text("employer_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		// Null bis das Invite angenommen ist. inviteEmail bleibt das stabile
		// Identifier — wir ordnen den User beim Annahme-Flow zu.
		userId: text("user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		inviteEmail: text("invite_email").notNull(),
		inviteToken: text("invite_token").unique(),
		role: text("role", { enum: ["owner", "recruiter", "viewer"] })
			.notNull()
			.default("recruiter"),
		invitedAt: timestamp("invited_at", { mode: "date" }).notNull().defaultNow(),
		joinedAt: timestamp("joined_at", { mode: "date" }),
		invitedByUserId: text("invited_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(t) => [unique("agency_members_unique").on(t.employerId, t.inviteEmail)],
);

export type AgencyMember = typeof agencyMembers.$inferSelect;

// ─── Job Mandates ──────────────────────────────────────────────────────────
// Wenn eine Agency (employer.isAgency=true) eine Stelle im Auftrag eines
// Endkunden postet, dokumentiert sie hier das Mandat. Sichtbarkeit per
// `clientVisibility`: "private" (nur intern), "anonymous" (Kandidat sieht
// "im Auftrag eines Mittelständlers"), "named" (Klarname öffentlich).
export const jobMandates = pgTable("job_mandates", {
	jobId: text("job_id")
		.primaryKey()
		.references(() => jobs.id, { onDelete: "cascade" }),
	clientName: text("client_name").notNull(),
	clientWebsite: text("client_website"),
	clientIndustry: text("client_industry"),
	clientNote: text("client_note"),
	clientVisibility: text("client_visibility", {
		enum: ["private", "anonymous", "named"],
	})
		.notNull()
		.default("anonymous"),
	commissionPct: integer("commission_pct"), // optional, internal only
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type JobMandate = typeof jobMandates.$inferSelect;

// ─── Agency Collaborations ─────────────────────────────────────────────────
// Eine konkrete Zusammenarbeit zwischen zwei Agenturen für eine Stelle.
// Lead-Agency hält das Mandat, Partner-Agency liefert Kandidaten gegen
// Provisions-Anteil. Schema lehnt sich an docs/agency-collaborations.md an.
export const agencyCollaborations = pgTable(
	"agency_collaborations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		jobId: text("job_id")
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		leadAgencyId: text("lead_agency_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		// Bis zur Annahme nur per Email referenziert (Partner kann eine andere
		// registrierte Agency sein oder noch keinen Klick-Account haben).
		partnerAgencyId: text("partner_agency_id").references(() => employers.id, {
			onDelete: "set null",
		}),
		partnerEmail: text("partner_email").notNull(),
		partnerInviteToken: text("partner_invite_token").unique(),
		status: text("status", {
			enum: ["pending", "active", "ended", "rejected"],
		})
			.notNull()
			.default("pending"),
		leadCommissionPct: integer("lead_commission_pct").notNull().default(70),
		partnerCommissionPct: integer("partner_commission_pct")
			.notNull()
			.default(30),
		scope: text("scope"),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
		startedAt: timestamp("started_at", { mode: "date" }),
		endedAt: timestamp("ended_at", { mode: "date" }),
	},
	(t) => [unique("collab_unique").on(t.jobId, t.partnerEmail)],
);

export type AgencyCollaboration = typeof agencyCollaborations.$inferSelect;

// Welche Kandidaten hat der Partner für die Collab vorgeschlagen?
export const collaborationCandidateProposals = pgTable(
	"collaboration_candidate_proposals",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		collaborationId: text("collaboration_id")
			.notNull()
			.references(() => agencyCollaborations.id, { onDelete: "cascade" }),
		candidateUserId: text("candidate_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		proposedByUserId: text("proposed_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		note: text("note"),
		status: text("status", {
			enum: ["proposed", "shortlisted", "rejected", "hired"],
		})
			.notNull()
			.default("proposed"),
		proposedAt: timestamp("proposed_at", { mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("collab_proposal_unique").on(t.collaborationId, t.candidateUserId),
	],
);

export type CollaborationCandidateProposal =
	typeof collaborationCandidateProposals.$inferSelect;

// Provisions-Tracking: wenn ein Outcome `hired` für einen Partner-Vorschlag
// reportet wird, schreiben wir die Aufteilung als Audit-Trail. Auszahlung
// passiert weiter über die Buchhaltung der Agenturen.
export const commissionEvents = pgTable("commission_events", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	collaborationId: text("collaboration_id")
		.notNull()
		.references(() => agencyCollaborations.id, { onDelete: "cascade" }),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	totalCommissionEur: integer("total_commission_eur").notNull(),
	leadAmountEur: integer("lead_amount_eur").notNull(),
	partnerAmountEur: integer("partner_amount_eur").notNull(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	settledAt: timestamp("settled_at", { mode: "date" }),
});

export type CommissionEvent = typeof commissionEvents.$inferSelect;

// ─── Applications (Kandidat-initiiert) ─────────────────────────────────────
// Klassische Bewerbung: Kandidat findet Stelle, schickt Anschreiben + sein
// aktuelles Profil. Beide Seiten sehen einen Food-Delivery-Style-Status.
// Snapshots frieren Profil + Stelle + Match-Scoring zum Zeitpunkt der
// Bewerbung ein — der Kandidat kann später vergleichen "was hatte ich
// damals eingereicht vs. was bringe ich heute mit".
export type ApplicationStatus =
	| "submitted" // gerade abgeschickt
	| "seen" // Arbeitgeber hat sie geöffnet
	| "in_review" // wird intern besprochen
	| "shortlisted" // engere Auswahl
	| "interview" // Interview-Phase
	| "offer" // Angebot raus
	| "declined" // abgelehnt (egal welche Seite)
	| "withdrawn" // Kandidat hat zurückgezogen
	| "archived"; // archiviert nach offer/declined

export type ApplicationProfileSnapshot = {
	displayName?: string | null;
	headline?: string | null;
	location?: string | null;
	yearsExperience?: number | null;
	salaryDesired?: number | null;
	skills?: { name: string; level?: number }[];
	summary?: string | null;
	industries?: string[] | null;
};

export type ApplicationJobSnapshot = {
	title: string;
	description: string;
	location?: string | null;
	remotePolicy?: string;
	salaryMin?: number | null;
	salaryMax?: number | null;
	yearsExperienceMin?: number | null;
	requirements?: { name: string; weight: "must" | "nice"; minLevel?: number }[];
	languages?: string[] | null;
};

export type ApplicationMatchSnapshot = {
	hardScore: number;
	softScore: number;
	matchedSkills: string[];
	missingSkills: string[];
	adjacentSkills?: string[];
	rationale?: string | null;
};

export const applications = pgTable(
	"applications",
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
		employerId: text("employer_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		coverLetter: text("cover_letter"),
		status: text("status", {
			enum: [
				"submitted",
				"seen",
				"in_review",
				"shortlisted",
				"interview",
				"offer",
				"declined",
				"withdrawn",
				"archived",
			],
		})
			.notNull()
			.default("submitted"),
		// Aktueller Stage in `job_stages`. Null bei Legacy-Bewerbungen ohne
		// Template — dann fällt die UI auf den klassischen Status zurück.
		currentStageId: text("current_stage_id"),
		// Zeitpunkt zu dem die Bewerbung in den aktuellen Stage gewechselt
		// hat — Basis für den Drei-Zonen-Tracker.
		stageEnteredAt: timestamp("stage_entered_at", { mode: "date" }),
		// Forced-Closure-Deadline: nach 3 Monaten ohne Reaktion erscheint
		// der Pflicht-Dialog beim nächsten Login des Arbeitgebers.
		closureDeadlineAt: timestamp("closure_deadline_at", { mode: "date" }),
		// Pflicht beim Status `declined`. Aus festem Katalog (REJECT_REASONS).
		rejectReason: text("reject_reason"),
		rejectFreeText: text("reject_free_text"),
		profileSnapshot: jsonb("profile_snapshot")
			.$type<ApplicationProfileSnapshot>()
			.notNull(),
		jobSnapshot: jsonb("job_snapshot")
			.$type<ApplicationJobSnapshot>()
			.notNull(),
		matchSnapshot: jsonb("match_snapshot").$type<ApplicationMatchSnapshot>(),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
	},
	(t) => [unique("applications_unique").on(t.jobId, t.candidateUserId)],
);

export type Application = typeof applications.$inferSelect;

// Jeder Status-Wechsel + jede Notiz wird als Event geschrieben → ergibt
// die Food-Delivery-Style-Timeline. byRole sagt wer es gemacht hat
// ("system" für automatische Events wie "seen" beim ersten Öffnen).
export const applicationEvents = pgTable("application_events", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	applicationId: text("application_id")
		.notNull()
		.references(() => applications.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: ["status_change", "stage_change", "note", "system", "message"],
	}).notNull(),
	status: text("status"),
	// Bei stage_change: ID des Stages in den der Wechsel ging.
	stageId: text("stage_id"),
	// Pflicht-Outcome bei Stage-Wechsel ("advance" / "reject" / "on_hold").
	outcome: text("outcome"),
	rejectReason: text("reject_reason"),
	byRole: text("by_role", { enum: ["candidate", "employer", "system"] })
		.notNull()
		.default("system"),
	byUserId: text("by_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	note: text("note"),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Team-interne Notizen zu einer Bewerbung. Sichtbar nur für Employer-
// Members, NICHT für den/die Kandidat:in. Separate Tabelle (statt
// application_events) um klar abgegrenzt zu sein und einfacher Bulk-
// Queries zu erlauben.
export const applicationNotes = pgTable("application_notes", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	applicationId: text("application_id")
		.notNull()
		.references(() => applications.id, { onDelete: "cascade" }),
	authorUserId: text("author_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	body: text("body").notNull(),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type ApplicationNote = typeof applicationNotes.$inferSelect;

export type ApplicationEvent = typeof applicationEvents.$inferSelect;

// ─── Hiring Process Templates ──────────────────────────────────────────────
// Arbeitgeber definieren wiederverwendbare Stage-Templates ("Standard-DE",
// "Tech-Senior", "Sales-EU"). Jede Vorlage hat geordnete Stages aus einem
// festen Katalog (12 Typen). Beim Veröffentlichen einer Stelle wird die
// Vorlage als unveränderlicher Snapshot in `job_stages` kopiert — spätere
// Template-Änderungen rühren laufende Bewerbungen nicht an.
export type StageKind =
	| "application_received"
	| "automated_screening"
	| "recruiter_review"
	| "hiring_manager_review"
	| "phone_screen"
	| "technical_assessment"
	| "interview"
	| "assessment_center"
	| "reference_check"
	| "offer_preparation"
	| "offer_negotiation"
	| "final_decision";

export const STAGE_KINDS: StageKind[] = [
	"application_received",
	"automated_screening",
	"recruiter_review",
	"hiring_manager_review",
	"phone_screen",
	"technical_assessment",
	"interview",
	"assessment_center",
	"reference_check",
	"offer_preparation",
	"offer_negotiation",
	"final_decision",
];

// Pflicht-Outcomes pro Stage. "advance" = weiter zur nächsten Stage,
// "reject" = abgelehnt (mit Pflicht-Reason aus festem Katalog),
// "on_hold" = wartet auf Kandidat-Aktion / pausiert.
export const STAGE_OUTCOMES = ["advance", "reject", "on_hold"] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

// Fester Katalog von Ablehnungs-Gründen. Pflicht beim "reject"-Outcome.
// Verhindert Geister-Absagen und hält die Statistik vergleichbar.
export const REJECT_REASONS = [
	"not_qualified_skills",
	"not_qualified_experience",
	"salary_mismatch",
	"location_mismatch",
	"culture_mismatch",
	"position_filled",
	"position_canceled",
	"internal_candidate",
	"other",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const hiringProcessTemplates = pgTable(
	"hiring_process_templates",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		employerId: text("employer_id")
			.notNull()
			.references(() => employers.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		// Genau ein Default pro Employer — wird bei neuen Stellen vorausgewählt.
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
	},
	(t) => [
		unique("hiring_process_templates_employer_name_unique").on(
			t.employerId,
			t.name,
		),
	],
);

export type HiringProcessTemplate = typeof hiringProcessTemplates.$inferSelect;

// Blueprint-Stages eines Templates. Position bestimmt die Reihenfolge.
// expectedDays + zoneOverride steuern den Drei-Zonen-Antwortzeit-Tracker
// (angemessen / in_verzug / kritisch). Wenn null, gelten Branchen-Defaults.
export const templateStages = pgTable("template_stages", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	templateId: text("template_id")
		.notNull()
		.references(() => hiringProcessTemplates.id, { onDelete: "cascade" }),
	position: integer("position").notNull().default(0),
	kind: text("kind", {
		enum: [
			"application_received",
			"automated_screening",
			"recruiter_review",
			"hiring_manager_review",
			"phone_screen",
			"technical_assessment",
			"interview",
			"assessment_center",
			"reference_check",
			"offer_preparation",
			"offer_negotiation",
			"final_decision",
		],
	}).notNull(),
	name: text("name").notNull(),
	description: text("description"),
	expectedDays: integer("expected_days"), // null = Default für Stage-Typ
	responsibleRole: text("responsible_role", {
		enum: ["recruiter", "hiring_manager", "team", "system"],
	})
		.notNull()
		.default("recruiter"),
	required: boolean("required").notNull().default(true),
	materials: text("materials"), // freie Liste, eine Zeile pro Item
});

export type TemplateStage = typeof templateStages.$inferSelect;

// Per-Stelle eingefrorene Stages. Beim Veröffentlichen kopiert. Diese Zeile
// ist die "Source of Truth" für Bewerbungs-Status und die Timeline.
export const jobStages = pgTable(
	"job_stages",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		jobId: text("job_id")
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		position: integer("position").notNull().default(0),
		kind: text("kind", {
			enum: [
				"application_received",
				"automated_screening",
				"recruiter_review",
				"hiring_manager_review",
				"phone_screen",
				"technical_assessment",
				"interview",
				"assessment_center",
				"reference_check",
				"offer_preparation",
				"offer_negotiation",
				"final_decision",
			],
		}).notNull(),
		name: text("name").notNull(),
		description: text("description"),
		expectedDays: integer("expected_days"),
		responsibleRole: text("responsible_role", {
			enum: ["recruiter", "hiring_manager", "team", "system"],
		})
			.notNull()
			.default("recruiter"),
		required: boolean("required").notNull().default(true),
		materials: text("materials"),
	},
	(t) => [unique("job_stages_position_unique").on(t.jobId, t.position)],
);

export type JobStage = typeof jobStages.$inferSelect;

// Per-Stage-Bewerber-Bewertung. 4 Fragen (Klarheit / Respekt / Aufwand /
// Antwortzeit) auf einer 1-5-Skala. Optionaler Freitext. Aggregiert ergibt
// das öffentliche Company-Statistiken (ab Mindest-Bucket-Größe 10).
export const stageRatings = pgTable(
	"stage_ratings",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		applicationId: text("application_id")
			.notNull()
			.references(() => applications.id, { onDelete: "cascade" }),
		jobStageId: text("job_stage_id")
			.notNull()
			.references(() => jobStages.id, { onDelete: "cascade" }),
		candidateUserId: text("candidate_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// 1..5; null = übersprungen.
		clarity: integer("clarity"),
		respect: integer("respect"),
		effort: integer("effort"),
		responseTime: integer("response_time"),
		comment: text("comment"),
		createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
	},
	(t) => [unique("stage_ratings_unique").on(t.applicationId, t.jobStageId)],
);

export type StageRating = typeof stageRatings.$inferSelect;

// Pro Bewerbung ein In-App-Thread. Beide Seiten dürfen schreiben sobald die
// Bewerbung aktiv ist. Keine externen Mails, kein Lock-in beim Arbeitgeber.
export const applicationMessages = pgTable("application_messages", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	applicationId: text("application_id")
		.notNull()
		.references(() => applications.id, { onDelete: "cascade" }),
	byUserId: text("by_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	byRole: text("by_role", { enum: ["candidate", "employer"] }).notNull(),
	body: text("body").notNull(),
	readAt: timestamp("read_at", { mode: "date" }),
	createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type ApplicationMessage = typeof applicationMessages.$inferSelect;
