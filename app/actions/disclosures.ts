"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { disclosures, interests, vaultItems } from "@/db/schema";

// Candidate-side: grant or revoke disclosure of a single vault item to an
// approved interest. The employer only sees vault items they've been granted
// access to; nothing else from the vault is exposed.

async function requireCandidateOwnership(
	interestId: string,
	vaultItemId: string,
): Promise<{ candidateUserId: string }> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const [interest] = await db
		.select({ candidateUserId: interests.candidateUserId })
		.from(interests)
		.where(eq(interests.id, interestId))
		.limit(1);
	if (!interest || interest.candidateUserId !== userId) {
		throw new Error("forbidden");
	}
	const [item] = await db
		.select({ userId: vaultItems.userId })
		.from(vaultItems)
		.where(eq(vaultItems.id, vaultItemId))
		.limit(1);
	if (!item || item.userId !== userId) {
		throw new Error("forbidden: vault item not yours");
	}
	return { candidateUserId: userId };
}

export async function grantDisclosure(
	interestId: string,
	vaultItemId: string,
): Promise<void> {
	await requireCandidateOwnership(interestId, vaultItemId);
	await db
		.insert(disclosures)
		.values({ interestId, vaultItemId })
		.onConflictDoUpdate({
			target: [disclosures.interestId, disclosures.vaultItemId],
			set: { revokedAt: null, grantedAt: new Date() },
		});
	revalidatePath(`/requests/${interestId}`);
}

export async function revokeDisclosure(
	interestId: string,
	vaultItemId: string,
): Promise<void> {
	await requireCandidateOwnership(interestId, vaultItemId);
	await db
		.update(disclosures)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(disclosures.interestId, interestId),
				eq(disclosures.vaultItemId, vaultItemId),
			),
		);
	revalidatePath(`/requests/${interestId}`);
}

// List the active disclosures (granted, not revoked) for a given interest.
// Used by the employer detail view + the candidate's own request page.
export async function listActiveDisclosures(interestId: string) {
	return db
		.select({
			id: disclosures.id,
			vaultItemId: disclosures.vaultItemId,
			grantedAt: disclosures.grantedAt,
			filename: vaultItems.filename,
			kind: vaultItems.kind,
			mime: vaultItems.mime,
		})
		.from(disclosures)
		.innerJoin(vaultItems, eq(vaultItems.id, disclosures.vaultItemId))
		.where(
			and(
				eq(disclosures.interestId, interestId),
				isNull(disclosures.revokedAt),
			),
		);
}
