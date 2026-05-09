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
	type ProfileEducation,
	type ProfileExperience,
	type ProfileSkill,
	users,
	vaultItems,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { ExtractedProfile } from "@/lib/ai/types";
import { decryptBytes, unwrapDek } from "@/lib/crypto/envelope";
import { geocode } from "@/lib/geo/geocode";
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
		await db
			.update(candidateProfiles)
			.set({ openToOffers: false })
			.where(eq(candidateProfiles.userId, session.user.id));
		p.openToOffers = false;
	}
	return p;
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

export async function parseCvFromVault(
	vaultItemId: string,
): Promise<ExtractedProfile> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const [item] = await db
		.select()
		.from(vaultItems)
		.where(and(eq(vaultItems.id, vaultItemId), eq(vaultItems.userId, userId)))
		.limit(1);
	if (!item) throw new Error("vault item not found");

	const [user] = await db
		.select({ encryptedDek: users.encryptedDek })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user?.encryptedDek) throw new Error("vault key missing");
	if (!item.storageKey || !item.nonce || !item.mime) {
		// URL-only items (e.g. Credly badges) carry no payload to parse.
		throw new Error("vault item has no file payload");
	}

	const dek = await unwrapDek(user.encryptedDek);
	const ciphertext = await getBytes(item.storageKey);
	const nonce = Uint8Array.from(Buffer.from(item.nonce, "base64"));
	const plain = await decryptBytes(ciphertext, nonce, dek);

	return getAIProvider().parseCv(plain, item.mime);
}

export async function saveProfile(formData: FormData): Promise<void> {
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

	// Geocode the location (cached in DB) so the match engine can compute
	// commute distance later. Failures degrade silently.
	const geo = parsed.location ? await geocode(parsed.location) : null;

	// When candidate ticks "open to offers", grant a 30-day window —
	// after that the lazy reset in getProfile() flips it back to false.
	const openToOffersUntil = parsed.openToOffers
		? (() => {
				const d = new Date();
				d.setDate(d.getDate() + 30);
				return d;
			})()
		: null;

	const values = {
		userId,
		...parsed,
		openToOffersUntil,
		...(maxCommuteMinutes !== undefined ? { maxCommuteMinutes } : {}),
		...(transportMode !== undefined ? { transportMode } : {}),
		addressLat: geo?.lat ?? null,
		addressLng: geo?.lng ?? null,
		updatedAt: new Date(),
	};

	await db.insert(candidateProfiles).values(values).onConflictDoUpdate({
		target: candidateProfiles.userId,
		set: values,
	});

	revalidatePath("/profile");
	after(async () => {
		await recomputeInsights(userId);
		await recomputeMatchesForCandidate(userId);
		await translateProfileFields(userId).catch((e) =>
			console.warn("[profile] translate failed", e),
		);
	});
}

// Übersetzt Profilfelder in die jeweils andere Sprache und speichert sie
// im `translations`-JSONB. Wird nach jedem Save im Hintergrund gerufen.
async function translateProfileFields(userId: string): Promise<void> {
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

	const ai = getAIProvider();
	const translation = await ai.translateProfile({
		from: origin,
		to: target,
		headline: profile.headline,
		summary: profile.summary,
		industries: profile.industries,
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
			? profile.education.map((e) => ({ degree: e.degree }))
			: null,
		awards: profile.awards,
		mobility: profile.mobility,
	});

	await db
		.update(candidateProfiles)
		.set({
			profileLanguageOrigin: origin,
			translations: { [target]: translation },
			translationsUpdatedAt: new Date(),
		})
		.where(eq(candidateProfiles.userId, userId));
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
