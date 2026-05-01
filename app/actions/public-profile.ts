"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";

// Generate a fresh share token for the candidate's public profile. Returns
// the token so the caller can build a link. Existing token is replaced.
export async function generatePublicShareToken(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const token = crypto.randomUUID().replace(/-/g, "");
	await db
		.update(candidateProfiles)
		.set({ publicShareToken: token })
		.where(eq(candidateProfiles.userId, session.user.id));
	revalidatePath("/profile");
	return token;
}

export async function revokePublicShareToken(): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	await db
		.update(candidateProfiles)
		.set({ publicShareToken: null })
		.where(eq(candidateProfiles.userId, session.user.id));
	revalidatePath("/profile");
}

export async function getMyShareToken(): Promise<string | null> {
	const session = await auth();
	if (!session?.user?.id) return null;
	const [p] = await db
		.select({ publicShareToken: candidateProfiles.publicShareToken })
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, session.user.id))
		.limit(1);
	return p?.publicShareToken ?? null;
}
