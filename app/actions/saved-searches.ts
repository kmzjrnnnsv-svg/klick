"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	candidateProfiles,
	type jobs,
	type SavedSearch,
	savedSearches,
	users,
} from "@/db/schema";
import { pushNotification } from "./notifications";

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

export async function createSavedSearch(input: {
	name: string;
	criteria: SavedSearch["criteria"];
	notifyChannel?: SavedSearch["notifyChannel"];
}): Promise<{ id: string }> {
	const userId = await requireCandidate();
	if (!input.name.trim()) throw new Error("name required");
	const [created] = await db
		.insert(savedSearches)
		.values({
			userId,
			name: input.name.trim().slice(0, 80),
			criteria: input.criteria,
			notifyChannel: input.notifyChannel ?? "inapp",
		})
		.returning({ id: savedSearches.id });
	revalidatePath("/searches");
	return created;
}

export async function deleteSavedSearch(id: string): Promise<void> {
	const userId = await requireCandidate();
	await db
		.delete(savedSearches)
		.where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
	revalidatePath("/searches");
}

export async function listMySavedSearches(): Promise<SavedSearch[]> {
	const userId = await requireCandidate();
	return db
		.select()
		.from(savedSearches)
		.where(eq(savedSearches.userId, userId))
		.orderBy(desc(savedSearches.createdAt));
}

// Internal — used by computeMatchesForJob hook to fan-out alerts when a
// new published job matches existing saved searches. Best-effort.
function jobMatchesCriteria(
	job: typeof jobs.$inferSelect,
	c: SavedSearch["criteria"],
): boolean {
	if (c.remote === "remote_only" && job.remotePolicy !== "remote") return false;
	if (c.remote === "no_remote" && job.remotePolicy === "remote") return false;
	if (c.minSalary && (job.salaryMax ?? job.salaryMin ?? 0) < c.minSalary)
		return false;
	if (c.location) {
		const loc = (job.location ?? "").toLowerCase();
		if (!loc.includes(c.location.toLowerCase())) return false;
	}
	if (c.query) {
		const hay = `${job.title} ${job.description}`.toLowerCase();
		if (!hay.includes(c.query.toLowerCase())) return false;
	}
	if (c.skills && c.skills.length > 0) {
		const reqs = (job.requirements ?? []).map((r) => r.name.toLowerCase());
		const hits = c.skills.filter((s) => reqs.includes(s.toLowerCase())).length;
		if (hits === 0) return false;
	}
	return true;
}

export async function notifySavedSearchHits(
	job: typeof jobs.$inferSelect,
): Promise<void> {
	try {
		const all = await db.select().from(savedSearches);
		for (const s of all) {
			if (!jobMatchesCriteria(job, s.criteria)) continue;
			const [profile] = await db
				.select({
					openToOffers: candidateProfiles.openToOffers,
				})
				.from(candidateProfiles)
				.where(eq(candidateProfiles.userId, s.userId))
				.limit(1);
			if (!profile?.openToOffers) continue;

			await pushNotification({
				userId: s.userId,
				kind: "saved_search_hit",
				title: `Neue Stelle für „${s.name}"`,
				body: `${job.title}${job.location ? ` · ${job.location}` : ""}`,
				link: `/jobs/browse/${job.id}`,
				payload: { jobId: job.id, savedSearchId: s.id },
			});
			await db
				.update(savedSearches)
				.set({ lastNotifiedAt: new Date() })
				.where(eq(savedSearches.id, s.id));
		}
	} catch (e) {
		console.error("[saved-searches] notify failed", e);
	}
}
