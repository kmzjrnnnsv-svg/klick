"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	candidateProfiles,
	employers,
	type Favorite,
	favorites,
	jobs,
	users,
} from "@/db/schema";

async function requireEmployer() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "employer") throw new Error("forbidden");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer profile");
	return { userId: session.user.id, employerId: emp.id, employer: emp };
}

export async function toggleFavorite(input: {
	jobId: string;
	candidateUserId: string;
	notes?: string;
}): Promise<{ favorited: boolean }> {
	const { employerId } = await requireEmployer();

	const [job] = await db
		.select({ id: jobs.id, employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job || job.employerId !== employerId) throw new Error("job not yours");

	const [existing] = await db
		.select()
		.from(favorites)
		.where(
			and(
				eq(favorites.employerId, employerId),
				eq(favorites.jobId, input.jobId),
				eq(favorites.candidateUserId, input.candidateUserId),
			),
		)
		.limit(1);

	if (existing) {
		await db.delete(favorites).where(eq(favorites.id, existing.id));
		revalidatePath(`/jobs/${input.jobId}/candidates`);
		revalidatePath(`/jobs/${input.jobId}/favorites`);
		return { favorited: false };
	}
	await db.insert(favorites).values({
		employerId,
		jobId: input.jobId,
		candidateUserId: input.candidateUserId,
		notes: input.notes,
	});
	revalidatePath(`/jobs/${input.jobId}/candidates`);
	revalidatePath(`/jobs/${input.jobId}/favorites`);
	return { favorited: true };
}

export async function updateFavoriteNotes(input: {
	favoriteId: string;
	notes: string;
}): Promise<void> {
	const { employerId } = await requireEmployer();
	const [fav] = await db
		.select()
		.from(favorites)
		.where(eq(favorites.id, input.favoriteId))
		.limit(1);
	if (!fav || fav.employerId !== employerId) throw new Error("not found");
	await db
		.update(favorites)
		.set({ notes: input.notes })
		.where(eq(favorites.id, input.favoriteId));
	revalidatePath(`/jobs/${fav.jobId}/favorites`);
}

export async function listFavoritesForJob(jobId: string): Promise<
	{
		favorite: Favorite;
		candidate: { userId: string; displayName: string | null };
	}[]
> {
	const { employerId } = await requireEmployer();
	const rows = await db
		.select({
			favorite: favorites,
			displayName: candidateProfiles.displayName,
		})
		.from(favorites)
		.leftJoin(
			candidateProfiles,
			eq(candidateProfiles.userId, favorites.candidateUserId),
		)
		.where(
			and(eq(favorites.employerId, employerId), eq(favorites.jobId, jobId)),
		)
		.orderBy(desc(favorites.createdAt));
	return rows.map((r) => ({
		favorite: r.favorite,
		candidate: {
			userId: r.favorite.candidateUserId,
			displayName: r.displayName,
		},
	}));
}

export async function isFavorited(input: {
	jobId: string;
	candidateUserId: string;
}): Promise<boolean> {
	const { employerId } = await requireEmployer();
	const [row] = await db
		.select({ id: favorites.id })
		.from(favorites)
		.where(
			and(
				eq(favorites.employerId, employerId),
				eq(favorites.jobId, input.jobId),
				eq(favorites.candidateUserId, input.candidateUserId),
			),
		)
		.limit(1);
	return !!row;
}

export async function listFavoritesByEmployer(): Promise<
	{ favorite: Favorite; jobTitle: string | null }[]
> {
	const { employerId } = await requireEmployer();
	const rows = await db
		.select({ favorite: favorites, jobTitle: jobs.title })
		.from(favorites)
		.leftJoin(jobs, eq(jobs.id, favorites.jobId))
		.where(eq(favorites.employerId, employerId))
		.orderBy(desc(favorites.createdAt));
	return rows;
}
