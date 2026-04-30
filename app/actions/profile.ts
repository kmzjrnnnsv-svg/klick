"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
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
	return p ?? null;
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
		languages: parseList(formData.get("languages")?.toString() ?? ""),
		skills: parseSkills(formData.get("skills")?.toString() ?? ""),
		experience: tryParseJsonArray(formData.get("experience")?.toString()),
		education: tryParseJsonArray(formData.get("education")?.toString()),
		summary: formData.get("summary")?.toString() || undefined,
		visibility: formData.get("visibility")?.toString() ?? "matches_only",
	};

	const parsed = profileFormSchema.parse(raw);

	const values = {
		userId,
		...parsed,
		updatedAt: new Date(),
	};

	await db.insert(candidateProfiles).values(values).onConflictDoUpdate({
		target: candidateProfiles.userId,
		set: values,
	});

	revalidatePath("/profile");
	after(() => recomputeMatchesForCandidate(userId));
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
