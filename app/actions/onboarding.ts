"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { recomputeInsights } from "@/app/actions/insights";
import { recomputeMatchesForCandidate } from "@/app/actions/matches";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	candidateProfiles,
	type ProfileEducation,
	type ProfileExperience,
	type ProfileSkill,
} from "@/db/schema";
import { geocode } from "@/lib/geo/geocode";

async function requireUserId(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	return session.user.id;
}

// Upsert a partial set of profile fields without clobbering anything else.
// Onboarding steps each call this with their own slice — first step inserts a
// row, later steps update it.
async function upsertProfileFields(
	userId: string,
	patch: Partial<typeof candidateProfiles.$inferInsert>,
): Promise<void> {
	const values = { userId, ...patch, updatedAt: new Date() };
	await db
		.insert(candidateProfiles)
		.values(values)
		.onConflictDoUpdate({
			target: candidateProfiles.userId,
			set: { ...patch, updatedAt: new Date() },
		});
}

function parseList(raw: string | null): string[] | undefined {
	if (!raw) return undefined;
	const list = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return list.length > 0 ? list : undefined;
}

function parseSkills(raw: string | null): ProfileSkill[] | undefined {
	if (!raw) return undefined;
	const list = raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((line): ProfileSkill => {
			const [name, levelRaw] = line.split(":").map((s) => s.trim());
			const level = levelRaw ? Number.parseInt(levelRaw, 10) : Number.NaN;
			return level >= 1 && level <= 5
				? { name, level: level as 1 | 2 | 3 | 4 | 5 }
				: { name };
		});
	return list.length > 0 ? list : undefined;
}

function tryParseJsonArray<T>(raw: string | null): T[] | undefined {
	if (!raw) return undefined;
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? (v as T[]) : undefined;
	} catch {
		return undefined;
	}
}

export async function saveBasicsStep(formData: FormData): Promise<void> {
	const userId = await requireUserId();
	const location = formData.get("location")?.toString().trim() || null;
	const geo = location ? await geocode(location) : null;
	const maxCommuteMinutesRaw = formData
		.get("maxCommuteMinutes")
		?.toString()
		.trim();
	const maxCommuteMinutes = maxCommuteMinutesRaw
		? Math.max(0, Math.min(240, Number.parseInt(maxCommuteMinutesRaw, 10) || 0))
		: null;
	const transportModeRaw = formData.get("transportMode")?.toString();
	const transportMode =
		transportModeRaw === "car" ||
		transportModeRaw === "transit" ||
		transportModeRaw === "bike" ||
		transportModeRaw === "walk"
			? transportModeRaw
			: null;
	await upsertProfileFields(userId, {
		displayName: formData.get("displayName")?.toString().trim() || null,
		headline: formData.get("headline")?.toString().trim() || null,
		location,
		yearsExperience: (() => {
			const raw = formData.get("yearsExperience")?.toString().trim();
			if (!raw) return null;
			const n = Number.parseInt(raw, 10);
			return Number.isFinite(n) && n >= 0 ? n : null;
		})(),
		languages: parseList(formData.get("languages")?.toString() ?? null) ?? null,
		maxCommuteMinutes,
		transportMode,
		addressLat: geo?.lat ?? null,
		addressLng: geo?.lng ?? null,
	});
	redirect("/onboarding/upload");
}

// CV upload step has nothing to save into the profile itself — the file lands
// in vault via uploadVaultItem. This action just advances the wizard.
export async function skipUploadStep(): Promise<void> {
	await requireUserId();
	redirect("/onboarding/skills");
}

export async function saveSkillsStep(formData: FormData): Promise<void> {
	const userId = await requireUserId();
	await upsertProfileFields(userId, {
		skills: parseSkills(formData.get("skills")?.toString() ?? null) ?? null,
		experience:
			tryParseJsonArray<ProfileExperience>(
				formData.get("experience")?.toString() ?? null,
			) ?? null,
		education:
			tryParseJsonArray<ProfileEducation>(
				formData.get("education")?.toString() ?? null,
			) ?? null,
		summary: formData.get("summary")?.toString().trim() || null,
	});
	redirect("/onboarding/visibility");
}

export async function finishOnboarding(formData: FormData): Promise<void> {
	const userId = await requireUserId();
	const visibility = formData.get("visibility")?.toString();
	const safeVisibility =
		visibility === "private" ||
		visibility === "matches_only" ||
		visibility === "public"
			? visibility
			: "matches_only";

	await upsertProfileFields(userId, {
		visibility: safeVisibility,
		onboardingCompletedAt: new Date(),
	});
	revalidatePath("/profile");
	after(async () => {
		await recomputeInsights(userId);
		await recomputeMatchesForCandidate(userId);
	});
	redirect("/onboarding/done");
}

export async function getOnboardingProfile() {
	const userId = await requireUserId();
	const [p] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	return p ?? null;
}
