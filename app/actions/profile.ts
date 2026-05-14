"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { recomputeInsights } from "@/app/actions/insights";
import { recomputeMatchesForCandidate } from "@/app/actions/matches";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type CandidateProfile,
	candidateProfiles,
	type ProfileAvailability,
	type ProfileEducation,
	type ProfileExperience,
	type ProfileProject,
	type ProfilePublication,
	type ProfileSalaryByCountry,
	type ProfileSectionKey,
	type ProfileSectionVisibility,
	type ProfileSkill,
	type ProfileSocialLinks,
	type ProfileVolunteering,
	users,
	vaultItems,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { recentAiEvaluations, recordAiEvaluation } from "@/lib/ai/evaluations";
import type { ExtractedProfile } from "@/lib/ai/types";
import { decryptBytes, unwrapDek } from "@/lib/crypto/envelope";
import { geocode } from "@/lib/geo/geocode";
import { ALL_SECTIONS } from "@/lib/profile/visibility";
import { getBytes } from "@/lib/storage/s3";

const skillSchema: z.ZodType<ProfileSkill> = z.object({
	name: z.string().min(1).max(80),
	level: z
		.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
			z.literal(5),
		])
		.optional(),
});
const experienceSchema: z.ZodType<ProfileExperience> = z.object({
	company: z.string().min(1).max(120),
	role: z.string().min(1).max(120),
	start: z.string().min(4).max(20),
	end: z.string().max(20).optional(),
	description: z.string().max(1000).optional(),
});
const educationSchema: z.ZodType<ProfileEducation> = z.object({
	institution: z.string().min(1).max(120),
	degree: z.string().min(1).max(120),
	start: z.string().max(20).optional(),
	end: z.string().max(20).optional(),
	completed: z.boolean().optional(),
	degreeType: z
		.enum([
			"school",
			"apprenticeship",
			"bachelor",
			"master",
			"phd",
			"mba",
			"other",
		])
		.optional(),
	grade: z.string().max(60).optional(),
	thesisTitle: z.string().max(300).optional(),
	focus: z.string().max(200).optional(),
});

const publicationSchema: z.ZodType<ProfilePublication> = z.object({
	title: z.string().min(1).max(300),
	year: z.string().max(10).optional(),
	kind: z.enum(["article", "talk", "patent", "book", "other"]).optional(),
	venue: z.string().max(200).optional(),
	url: z.string().url().max(500).optional(),
});

const projectSchema: z.ZodType<ProfileProject> = z.object({
	name: z.string().min(1).max(120),
	role: z.string().max(120).optional(),
	url: z.string().url().max(500).optional(),
	description: z.string().max(1000).optional(),
});

const volunteeringSchema: z.ZodType<ProfileVolunteering> = z.object({
	organization: z.string().min(1).max(160),
	role: z.string().min(1).max(120),
	start: z.string().max(20).optional(),
	end: z.string().max(20).optional(),
	description: z.string().max(1000).optional(),
});

const availabilitySchema: z.ZodType<ProfileAvailability> = z.object({
	status: z.enum(["immediate", "notice", "date", "unknown"]),
	noticeWeeks: z.coerce.number().int().min(0).max(52).optional(),
	availableFrom: z.string().max(20).optional(),
});

const socialLinksSchema: z.ZodType<ProfileSocialLinks> = z.object({
	github: z.string().url().max(300).optional(),
	linkedin: z.string().url().max(300).optional(),
	xing: z.string().url().max(300).optional(),
	website: z.string().url().max(300).optional(),
	other: z.string().url().max(300).optional(),
});

// Tolerant: lässt alle Strings als Keys durch und filtert ungültige
// Werte raus statt zu werfen. Form-State kann von älteren DB-Einträgen
// stammen die unbekannte Sections oder null-Werte enthalten — wir wollen
// den Save nicht killen, sondern silently bereinigen.
const sectionVisibilitySchema = z
	.record(z.string(), z.unknown())
	.optional()
	.transform((raw): ProfileSectionVisibility | undefined => {
		if (!raw) return undefined;
		const allowed = new Set(ALL_SECTIONS);
		const allowedVis = new Set(["private", "matches_only", "public"]);
		const out: ProfileSectionVisibility = {};
		for (const [k, v] of Object.entries(raw)) {
			if (!allowed.has(k as ProfileSectionKey)) continue;
			if (typeof v !== "string" || !allowedVis.has(v)) continue;
			out[k as ProfileSectionKey] = v as "private" | "matches_only" | "public";
		}
		return out;
	}) as unknown as z.ZodType<ProfileSectionVisibility | undefined>;

const salaryByCountrySchema: z.ZodType<ProfileSalaryByCountry> = z.object({
	country: z.string().min(2).max(3),
	currency: z.string().min(3).max(3),
	min: z.coerce.number().int().min(0).max(5_000_000).optional(),
	desired: z.coerce.number().int().min(0).max(5_000_000).optional(),
	recommendation: z
		.object({
			low: z.number().int().min(0),
			mid: z.number().int().min(0),
			high: z.number().int().min(0),
			rationale: z.string().max(500),
			generatedAt: z.string(),
		})
		.optional(),
});

const profileFormSchema = z.object({
	displayName: z.string().max(120).optional(),
	headline: z.string().max(200).optional(),
	location: z.string().max(120).optional(),
	yearsExperience: z.coerce.number().int().min(0).max(80).optional(),
	salaryMin: z.coerce.number().int().min(0).max(1_000_000).optional(),
	salaryDesired: z.coerce.number().int().min(0).max(1_000_000).optional(),
	canBeContactedBy: z.enum(["all", "employers_only", "none"]).default("all"),
	openToOffers: z.coerce.boolean().default(true),
	languages: z.array(z.string()).optional(),
	skills: z.array(skillSchema).optional(),
	experience: z.array(experienceSchema).optional(),
	education: z.array(educationSchema).optional(),
	summary: z.string().max(2000).optional(),
	visibility: z
		.enum(["private", "matches_only", "public"])
		.default("matches_only"),
	publications: z.array(publicationSchema).optional(),
	projects: z.array(projectSchema).optional(),
	volunteering: z.array(volunteeringSchema).optional(),
	drivingLicenses: z.array(z.string().max(8)).optional(),
	availability: availabilitySchema.optional(),
	socialLinks: socialLinksSchema.optional(),
	workPermitStatus: z
		.enum(["eu", "permit", "requires_sponsorship", "unknown"])
		.optional(),
	sectionVisibility: sectionVisibilitySchema,
	salaryByCountry: z.array(salaryByCountrySchema).max(2).optional(),
});

function parseList(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseSkills(raw: string): ProfileSkill[] {
	// Lines like "TypeScript", "TypeScript: 5", or "TypeScript :  5"
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line) => {
			const [name, levelRaw] = line.split(":").map((s) => s.trim());
			const level = levelRaw ? Number.parseInt(levelRaw, 10) : undefined;
			return level && level >= 1 && level <= 5
				? { name, level: level as 1 | 2 | 3 | 4 | 5 }
				: { name };
		});
}

export async function getProfile(): Promise<CandidateProfile | null> {
	try {
		const session = await auth();
		if (!session?.user?.id) return null;
		const [p] = await db
			.select()
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, session.user.id))
			.limit(1);
		if (!p) return null;
		// Lazy 30-day-reset: if openToOffers was set "until X" and that's past,
		// flip the flag off and notify the candidate so they can refresh.
		if (
			p.openToOffers &&
			p.openToOffersUntil &&
			p.openToOffersUntil < new Date()
		) {
			try {
				await db
					.update(candidateProfiles)
					.set({ openToOffers: false })
					.where(eq(candidateProfiles.userId, session.user.id));
				p.openToOffers = false;
			} catch (e) {
				console.warn("[profile] open-to-offers auto-reset failed", e);
			}
		}
		return p;
	} catch (e) {
		console.warn("[profile] getProfile failed, returning null", e);
		return null;
	}
}

export async function listCvVaultItems() {
	const session = await auth();
	if (!session?.user?.id) return [];
	const rows = await db
		.select({
			id: vaultItems.id,
			filename: vaultItems.filename,
			mime: vaultItems.mime,
			createdAt: vaultItems.createdAt,
		})
		.from(vaultItems)
		.where(
			and(eq(vaultItems.userId, session.user.id), eq(vaultItems.kind, "cv")),
		);
	// CV import only makes sense for items with a real file (have a mime type).
	return rows.filter(
		(r): r is { id: string; filename: string; mime: string; createdAt: Date } =>
			r.mime !== null,
	);
}

export type CvParseResult =
	| { ok: true; profile: ExtractedProfile; ms: number }
	| { ok: false; error: string; code: string };

// Result-Pattern statt throw — Next.js wickelt jeden uncaught throw in eine
// generische "An error occurred in the Server Components render"-Message
// die der User nicht versteht. Mit { ok, error }-Tuples sieht der Client
// die echte Ursache und kann sie lokalisiert anzeigen.
export async function parseCvFromVault(
	vaultItemId: string,
): Promise<CvParseResult> {
	const startedAt = Date.now();
	console.info("[cv.parse] start", { vaultItemId });
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { ok: false, code: "unauthenticated", error: "Nicht angemeldet." };
		}
		const userId = session.user.id;

		const [item] = await db
			.select()
			.from(vaultItems)
			.where(and(eq(vaultItems.id, vaultItemId), eq(vaultItems.userId, userId)))
			.limit(1);
		if (!item) {
			return {
				ok: false,
				code: "not_found",
				error: "CV-Datei nicht gefunden im Vault.",
			};
		}

		const [user] = await db
			.select({ encryptedDek: users.encryptedDek })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user?.encryptedDek) {
			return {
				ok: false,
				code: "no_key",
				error: "Verschlüsselungs-Key fehlt. Bitte support@ kontaktieren.",
			};
		}
		if (!item.storageKey || !item.nonce || !item.mime) {
			return {
				ok: false,
				code: "no_payload",
				error: "Diese Datei hat keinen Inhalt zum Parsen.",
			};
		}

		const dek = await unwrapDek(user.encryptedDek);
		const ciphertext = await getBytes(item.storageKey);
		const nonce = Uint8Array.from(Buffer.from(item.nonce, "base64"));
		const plain = await decryptBytes(ciphertext, nonce, dek);

		const profile = await getAIProvider().parseCv(plain, item.mime);
		const ms = Date.now() - startedAt;
		console.info(`[cv.parse] ok in ${ms}ms`);
		return { ok: true, profile, ms };
	} catch (e) {
		console.error(
			`[cv.parse] failed after ${Date.now() - startedAt}ms`,
			{ vaultItemId },
			e,
		);
		const raw = e instanceof Error ? e.message : String(e);
		// Erkennt typische Fehler-Klassen und gibt sprechende Codes zurück,
		// damit der Client lokalisieren kann.
		let code = "ai_failed";
		let friendly = `CV konnte nicht ausgewertet werden: ${raw}`;
		if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(raw)) {
			code = "network";
			friendly = "KI-Server nicht erreichbar — bitte später nochmal versuchen.";
		} else if (/401|unauthorized|api[_-]?key/i.test(raw)) {
			code = "auth";
			friendly =
				"KI-Zugang abgelaufen — Admin: ANTHROPIC_API_KEY in .env.production prüfen.";
		} else if (/timeout/i.test(raw)) {
			code = "timeout";
			friendly = "KI-Auswertung dauerte zu lang. Bitte nochmal versuchen.";
		} else if (/decrypt|cipher|nonce/i.test(raw)) {
			code = "decrypt";
			friendly = "CV-Datei konnte nicht entschlüsselt werden.";
		}
		return { ok: false, code, error: friendly };
	}
}

export async function saveProfile(formData: FormData): Promise<void> {
	const startedAt = Date.now();
	console.info("[profile.save] start");
	try {
		await saveProfileImpl(formData);
		console.info(`[profile.save] ok in ${Date.now() - startedAt}ms`);
	} catch (e) {
		// Wandelt Zod-/DB-/Geocode-Errors in sprechende Messages um, damit der
		// Client nicht das generische "An error occurred in the Server
		// Components render"-Wall-of-Text sieht. Server-Logs bekommen die
		// volle Stack-Trace.
		console.error(`[profile.save] failed after ${Date.now() - startedAt}ms`, e);
		if (e instanceof z.ZodError) {
			const issues = e.issues
				.slice(0, 5)
				.map((i) => `${i.path.join(".") || "Feld"}: ${i.message}`)
				.join(" · ");
			throw new Error(`Profil-Daten ungültig — ${issues}`);
		}
		if (e instanceof Error) {
			throw new Error(`Speichern fehlgeschlagen: ${e.message}`);
		}
		throw new Error("Speichern fehlgeschlagen (unbekannter Fehler).");
	}
}

async function saveProfileImpl(formData: FormData): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const raw = {
		displayName: formData.get("displayName")?.toString() || undefined,
		headline: formData.get("headline")?.toString() || undefined,
		location: formData.get("location")?.toString() || undefined,
		yearsExperience: formData.get("yearsExperience")?.toString() || undefined,
		salaryMin: formData.get("salaryMin")?.toString() || undefined,
		salaryDesired: formData.get("salaryDesired")?.toString() || undefined,
		canBeContactedBy: formData.get("canBeContactedBy")?.toString() ?? "all",
		openToOffers: formData.get("openToOffers")?.toString() === "on",
		languages: parseList(formData.get("languages")?.toString() ?? ""),
		skills: parseSkills(formData.get("skills")?.toString() ?? ""),
		experience: tryParseJsonArray(formData.get("experience")?.toString()),
		education: tryParseJsonArray(formData.get("education")?.toString()),
		summary: formData.get("summary")?.toString() || undefined,
		visibility: formData.get("visibility")?.toString() ?? "matches_only",
		publications: tryParseJsonArray(formData.get("publications")?.toString()),
		projects: tryParseJsonArray(formData.get("projects")?.toString()),
		volunteering: tryParseJsonArray(formData.get("volunteering")?.toString()),
		drivingLicenses: parseList(
			formData.get("drivingLicenses")?.toString() ?? "",
		),
		availability: tryParseJsonObject(formData.get("availability")?.toString()),
		socialLinks: tryParseJsonObject(formData.get("socialLinks")?.toString()),
		workPermitStatus: formData.get("workPermitStatus")?.toString() || undefined,
		sectionVisibility: tryParseJsonObject(
			formData.get("sectionVisibility")?.toString(),
		),
		salaryByCountry: tryParseJsonArray(
			formData.get("salaryByCountry")?.toString(),
		),
	};

	const parsed = profileFormSchema.parse(raw);

	// Commute-related fields (separate from the zod schema for now — pure
	// optionals that bypass legacy form payload).
	const maxCommuteMinutesRaw = formData
		.get("maxCommuteMinutes")
		?.toString()
		.trim();
	const maxCommuteMinutes = maxCommuteMinutesRaw
		? Math.max(0, Math.min(240, Number.parseInt(maxCommuteMinutesRaw, 10) || 0))
		: undefined;
	const transportModeRaw = formData.get("transportMode")?.toString();
	const transportMode: "car" | "transit" | "bike" | "walk" | undefined =
		transportModeRaw === "car" ||
		transportModeRaw === "transit" ||
		transportModeRaw === "bike" ||
		transportModeRaw === "walk"
			? transportModeRaw
			: undefined;

	// When candidate ticks "open to offers", grant a 30-day window —
	// after that the lazy reset in getProfile() flips it back to false.
	const openToOffersUntil = parsed.openToOffers
		? (() => {
				const d = new Date();
				d.setDate(d.getDate() + 30);
				return d;
			})()
		: null;

	// Editiert der Kandidat in einer anderen UI-Sprache als bisher die Quelle?
	// Dann wird genau diese Sprache zur neuen `profileLanguageOrigin` und der
	// nachfolgende `translateProfileFields()`-Aufruf füllt die andere Seite neu.
	const editLocaleRaw = formData.get("editLocale")?.toString();
	const editLocale: "de" | "en" | null =
		editLocaleRaw === "de" || editLocaleRaw === "en" ? editLocaleRaw : null;

	// Prüfen ob sich die Location geändert hat — wenn nicht, gar nicht neu
	// geocoden. Wenn doch, alte Koords erstmal behalten (besser stale als
	// missing) und das echte Geocoding in after() schieben.
	const [existing] = await db
		.select({
			location: candidateProfiles.location,
			addressLat: candidateProfiles.addressLat,
			addressLng: candidateProfiles.addressLng,
		})
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	const locationChanged =
		!!parsed.location && parsed.location !== existing?.location;

	const values = {
		userId,
		...parsed,
		openToOffersUntil,
		...(maxCommuteMinutes !== undefined ? { maxCommuteMinutes } : {}),
		...(transportMode !== undefined ? { transportMode } : {}),
		...(editLocale ? { profileLanguageOrigin: editLocale } : {}),
		// Bestehende Koords behalten falls Location unverändert; sonst auf
		// null setzen damit klar ist "noch nicht geocoded". after() füllt
		// sie binnen Sekunden auf.
		addressLat: locationChanged ? null : (existing?.addressLat ?? null),
		addressLng: locationChanged ? null : (existing?.addressLng ?? null),
		updatedAt: new Date(),
	};

	await db.insert(candidateProfiles).values(values).onConflictDoUpdate({
		target: candidateProfiles.userId,
		set: values,
	});

	revalidatePath("/profile");

	// Geocode jetzt async im Hintergrund — Nominatim kann 1-3s brauchen,
	// das soll den User-sichtbaren Save nicht blockieren.
	if (locationChanged && parsed.location) {
		const locationToGeocode = parsed.location;
		after(async () => {
			try {
				const geo = await geocode(locationToGeocode);
				if (geo) {
					await db
						.update(candidateProfiles)
						.set({ addressLat: geo.lat, addressLng: geo.lng })
						.where(eq(candidateProfiles.userId, userId));
				}
			} catch (e) {
				console.warn("[profile.save] background geocode failed", e);
			}
		});
	}
	after(async () => {
		await recomputeInsights(userId);
		await recomputeMatchesForCandidate(userId);
		// force=true: jeder Save regeneriert die Gegensprache, damit beide
		// Sprachen IMMER parallel und aktuell vorliegen (Hybrid-Modell). So
		// kann der Betrachter-Toggle ohne Wartezeit umschalten.
		await translateProfileFields(userId, true).catch((e) =>
			console.warn("[profile] translate failed", e),
		);
	});
}

// Übersetzt Profilfelder in die jeweils andere Sprache und speichert sie
// im `translations`-JSONB. Wird nach jedem Save im Hintergrund gerufen.
// `force=false` → übersetzt nur in die NICHT-Origin-Sprache wenn der Eintrag
// fehlt oder älter als das Profile-Update ist. `force=true` → immer neu.
async function translateProfileFields(
	userId: string,
	force = false,
): Promise<void> {
	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (!profile) return;

	// Origin = User-Locale wenn gesetzt, sonst Default 'de'.
	const [u] = await db
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const origin: "de" | "en" =
		(profile.profileLanguageOrigin as "de" | "en" | null) ??
		(u?.locale === "en" ? "en" : "de");
	const target: "de" | "en" = origin === "de" ? "en" : "de";

	// Skip wenn target-Übersetzung bereits existiert und nicht erzwungen
	const existingTranslations = profile.translations ?? {};
	if (!force && existingTranslations[target]) {
		return;
	}

	const ai = getAIProvider();
	const translation = await ai.translateProfile({
		from: origin,
		to: target,
		headline: profile.headline,
		summary: profile.summary,
		industries: profile.industries,
		languages: profile.languages,
		skills: (profile.skills ?? null) as
			| { name: string; level?: number }[]
			| null,
		experience: profile.experience
			? profile.experience.map((e) => ({
					role: e.role,
					description: e.description,
				}))
			: null,
		education: profile.education
			? profile.education.map((e) => ({
					degree: e.degree,
					thesisTitle: e.thesisTitle,
					focus: e.focus,
				}))
			: null,
		awards: profile.awards,
		mobility: profile.mobility,
		projects: profile.projects
			? profile.projects.map((p) => ({
					name: p.name,
					role: p.role,
					description: p.description,
				}))
			: null,
		publications: profile.publications
			? profile.publications.map((p) => ({
					title: p.title,
					venue: p.venue,
				}))
			: null,
		volunteering: profile.volunteering
			? profile.volunteering.map((v) => ({
					organization: v.organization,
					role: v.role,
					description: v.description,
				}))
			: null,
	});

	// MERGE statt overwrite — die andere Sprache (= origin selbst, falls
	// jemand mal eine "de"-Eigenübersetzung gespeichert hat) bleibt
	// erhalten.
	await db
		.update(candidateProfiles)
		.set({
			profileLanguageOrigin: origin,
			translations: { ...existingTranslations, [target]: translation },
			translationsUpdatedAt: new Date(),
		})
		.where(eq(candidateProfiles.userId, userId));
}

// Public-Share-Variante: triggert die Übersetzung für einen Profil-Owner
// per userId statt per Session. Anonymer Besucher kann damit indirekt
// eine Übersetzung anstoßen — Daten gehören dem Kandidaten, kein Risiko.
//
// Erkennt auch STALE Übersetzungen: wenn das Profil neuer ist als die
// gespeicherte Übersetzung (Profil-Update nach letzter Translation),
// wird neu generiert. Sonst sieht der User für immer alte deutsche
// Texte obwohl er die UI längst umgestellt hat.
export async function ensureTranslationForUser(
	userId: string,
	targetLocale: "de" | "en",
): Promise<{ alreadyHas: boolean; queued: boolean }> {
	try {
		const [profile] = await db
			.select({
				translations: candidateProfiles.translations,
				translationsUpdatedAt: candidateProfiles.translationsUpdatedAt,
				updatedAt: candidateProfiles.updatedAt,
				profileLanguageOrigin: candidateProfiles.profileLanguageOrigin,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		if (!profile) return { alreadyHas: false, queued: false };
		const origin =
			(profile.profileLanguageOrigin as "de" | "en" | null) ?? "de";
		if (origin === targetLocale) return { alreadyHas: true, queued: false };

		const hasTranslation = !!profile.translations?.[targetLocale];
		const isStale =
			!profile.translationsUpdatedAt ||
			(profile.updatedAt && profile.translationsUpdatedAt < profile.updatedAt);

		if (hasTranslation && !isStale) {
			return { alreadyHas: true, queued: false };
		}

		// Übersetzung fehlt ODER ist älter als das Profil → neu generieren.
		// force=true weil wir wissen dass die existierende Version stale ist.
		after(() =>
			translateProfileFields(userId, isStale).catch((e) =>
				console.warn("[profile] ensureTranslationForUser failed", e),
			),
		);
		return { alreadyHas: false, queued: true };
	} catch (e) {
		console.warn("[profile] ensureTranslationForUser failed", e);
		return { alreadyHas: false, queued: false };
	}
}

// User-getriggerte Persistierung einer einzelnen Übersetzung. Wird von
// den Per-Field-Translate-Buttons aufgerufen, sobald die KI fertig ist.
// Damit liegt die Übersetzung SOFORT in der DB und steht jedem späteren
// Reader (Recruiter / Employer / Public-Share) instant zur Verfügung —
// ohne dass auf ein nachträgliches Background-Translate gewartet werden
// muss.
//
// Merge-Semantik: bestehendes translations[locale] bleibt, neue Felder
// werden hinzugefügt/überschrieben. Andere Locales unberührt.
export async function persistTranslation(input: {
	targetLocale: "de" | "en";
	patch: Partial<{
		headline: string;
		summary: string;
		mobility: string;
		industries: string[];
		languages: string[];
		awards: string[];
		skills: { name: string; level?: number }[];
		experience: { role: string; description?: string }[];
		education: { degree: string; thesisTitle?: string; focus?: string }[];
		projects: { name: string; role?: string; description?: string }[];
		publications: { title: string; venue?: string }[];
		volunteering: {
			organization: string;
			role: string;
			description?: string;
		}[];
	}>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		const userId = session.user.id;

		const [row] = await db
			.select({
				translations: candidateProfiles.translations,
				origin: candidateProfiles.profileLanguageOrigin,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		if (!row) return { ok: false, error: "no_profile" };

		// Wenn noch keine Origin gesetzt ist, setzen wir die OPPOSITE Sprache
		// als Origin (User schreibt gerade die Übersetzung — die andere Sprache
		// ist also die Quell-Sprache).
		const origin =
			(row.origin as "de" | "en" | null) ??
			(input.targetLocale === "de" ? "en" : "de");

		const existing = row.translations ?? {};
		const existingForLocale = existing[input.targetLocale] ?? {};

		const merged = { ...existingForLocale, ...input.patch };

		await db
			.update(candidateProfiles)
			.set({
				profileLanguageOrigin: origin,
				translations: { ...existing, [input.targetLocale]: merged },
				translationsUpdatedAt: new Date(),
			})
			.where(eq(candidateProfiles.userId, userId));

		revalidatePath("/profile");
		return { ok: true };
	} catch (e) {
		console.error("[profile] persistTranslation failed", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// History der letzten Salary-Empfehlungen für den eingeloggten User +
// gegebenes Land. Wird in der UI als kleiner Trend angezeigt.
export async function getSalaryHistory(country: string): Promise<
	Array<{
		low: number;
		mid: number;
		high: number;
		currency: string;
		rationale: string;
		at: Date;
	}>
> {
	try {
		const session = await auth();
		if (!session?.user?.id) return [];
		const rows = await recentAiEvaluations<{
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		}>({
			userId: session.user.id,
			kind: "salary_country",
			key: country,
			limit: 5,
		});
		return rows.map((r) => ({ ...r.output, at: r.createdAt }));
	} catch (e) {
		console.warn("[profile] getSalaryHistory failed", e);
		return [];
	}
}

function tryParseJsonArray(raw: string | undefined): unknown[] | undefined {
	if (!raw) return undefined;
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v : undefined;
	} catch {
		return undefined;
	}
}

function tryParseJsonObject(raw: string | undefined): unknown | undefined {
	if (!raw) return undefined;
	try {
		const v = JSON.parse(raw);
		return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
	} catch {
		return undefined;
	}
}

// Holt eine KI-Gehaltsempfehlung für genau dieses Profil in einem Land.
// Persistiert NICHT — die Form-State entscheidet, ob der/die User:in das
// Ergebnis annimmt + speichert.
export type CountrySalaryResult =
	| {
			ok: true;
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
	  }
	| { ok: false; error: string };

export async function recommendSalaryForCountry(
	country: string,
	currency: string,
): Promise<CountrySalaryResult> {
	const session = await auth();
	if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
	if (!country || country.length < 2 || country.length > 3) {
		return { ok: false, error: "Ungültiger Country-Code" };
	}
	if (!currency || currency.length !== 3) {
		return { ok: false, error: "Ungültiger Currency-Code" };
	}
	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, session.user.id))
		.limit(1);
	if (!profile) {
		return {
			ok: false,
			error:
				"Bitte fülle erst dein Profil aus, bevor du Empfehlungen anforderst.",
		};
	}
	try {
		const ai = getAIProvider();
		// Hole die letzten 3 Salary-Empfehlungen für dieses Land — als Anker
		// gegen Flakiness ('jedes mal neue Werte'). Die KI bekommt sie als
		// Kontext: weiche nur bei signifikanten Profil-Änderungen davon ab.
		const priorEvals = await recentAiEvaluations<{
			low: number;
			mid: number;
			high: number;
			currency: string;
			rationale: string;
		}>({
			userId: session.user.id,
			kind: "salary_country",
			key: country,
			limit: 3,
		});
		const result = await ai.recommendCandidateSalary({
			profile: {
				headline: profile.headline ?? undefined,
				location: profile.location ?? undefined,
				yearsExperience: profile.yearsExperience ?? undefined,
				skills: profile.skills ?? undefined,
				experience: profile.experience ?? undefined,
				education: profile.education ?? undefined,
				summary: profile.summary ?? undefined,
				industries: profile.industries ?? undefined,
				preferredRoleLevel: profile.preferredRoleLevel ?? undefined,
			},
			country,
			currency,
			priorEvaluations: priorEvals.map((e) => e.output),
		});
		// Persistiert die neue Auswertung in der Historie — wird bei
		// nächsten Calls als Anker mitgezogen.
		await recordAiEvaluation({
			userId: session.user.id,
			kind: "salary_country",
			key: country,
			inputSnapshot: { country, currency, profileHash: profile.updatedAt },
			output: result,
			provider: ai.slug,
		});
		return { ok: true, ...result };
	} catch (e) {
		console.error("[profile] recommendSalaryForCountry", e);
		return {
			ok: false,
			error:
				e instanceof Error
					? `KI-Empfehlung fehlgeschlagen: ${e.message}`
					: "KI-Empfehlung fehlgeschlagen.",
		};
	}
}
