"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	candidateProfiles,
	type DiversityResponse,
	diversityResponses,
	users,
} from "@/db/schema";

async function requireCandidate(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "candidate") throw new Error("forbidden");
	return session.user.id;
}

export async function getMyDiversity(): Promise<DiversityResponse | null> {
	const userId = await requireCandidate();
	const [r] = await db
		.select()
		.from(diversityResponses)
		.where(eq(diversityResponses.userId, userId))
		.limit(1);
	return r ?? null;
}

export async function saveDiversity(input: {
	genderIdentity?: string;
	ethnicity?: string;
	hasDisability?: boolean | null;
	ageRange?: string;
}): Promise<void> {
	const userId = await requireCandidate();
	const values = {
		userId,
		genderIdentity: input.genderIdentity?.trim() || null,
		ethnicity: input.ethnicity?.trim() || null,
		hasDisability: input.hasDisability ?? null,
		ageRange: input.ageRange?.trim() || null,
		consentedAt: new Date(),
	};
	await db.insert(diversityResponses).values(values).onConflictDoUpdate({
		target: diversityResponses.userId,
		set: values,
	});
	revalidatePath("/profile");
}

export async function deleteMyDiversity(): Promise<void> {
	const userId = await requireCandidate();
	await db
		.delete(diversityResponses)
		.where(eq(diversityResponses.userId, userId));
	revalidatePath("/profile");
}

// Admin-only aggregated view. We never expose raw rows. Min-bucket-size = 5
// to prevent re-identification.
export async function aggregatedDiversityStats(): Promise<{
	totalConsented: number;
	totalCandidates: number;
	gender: Record<string, number>;
	ethnicity: Record<string, number>;
	disability: { yes: number; no: number };
	ageRange: Record<string, number>;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "admin") throw new Error("forbidden");

	const candidateRows = await db
		.select({ id: candidateProfiles.userId })
		.from(candidateProfiles);
	const totalCandidates = candidateRows.length;

	const all = await db.select().from(diversityResponses);
	const totalConsented = all.length;

	const gender: Record<string, number> = {};
	const ethnicity: Record<string, number> = {};
	const ageRange: Record<string, number> = {};
	let disYes = 0;
	let disNo = 0;
	for (const r of all) {
		if (r.genderIdentity)
			gender[r.genderIdentity] = (gender[r.genderIdentity] ?? 0) + 1;
		if (r.ethnicity) ethnicity[r.ethnicity] = (ethnicity[r.ethnicity] ?? 0) + 1;
		if (r.ageRange) ageRange[r.ageRange] = (ageRange[r.ageRange] ?? 0) + 1;
		if (r.hasDisability === true) disYes++;
		else if (r.hasDisability === false) disNo++;
	}

	// Suppress small buckets — under 5 we report as 0 to prevent
	// re-identification via small subgroups.
	const suppress = (rec: Record<string, number>) =>
		Object.fromEntries(
			Object.entries(rec).map(([k, v]) => [k, v >= 5 ? v : 0]),
		);

	return {
		totalConsented,
		totalCandidates,
		gender: suppress(gender),
		ethnicity: suppress(ethnicity),
		disability: {
			yes: disYes >= 5 ? disYes : 0,
			no: disNo >= 5 ? disNo : 0,
		},
		ageRange: suppress(ageRange),
	};
}
