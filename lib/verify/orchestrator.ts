import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type Interest,
	interests,
	users,
	type VerificationKind,
	verifications,
} from "@/db/schema";
import { pickConnectorForKind } from "@/lib/verify/registry";
import type { ConnectorRequest } from "@/lib/verify/types";

const KINDS_BY_DEPTH: Record<Interest["verifyDepth"], VerificationKind[]> = {
	light: [],
	standard: ["cert", "badge"],
	deep: ["identity", "cert", "badge"],
};

/**
 * Triggered by `after()` from showInterest. Creates `verifications` rows for
 * every required kind, then runs each connector's `verify()`. Connectors
 * either complete synchronously (Mock) or stay `pending` for a webhook.
 */
export async function orchestrateVerifications(
	interestId: string,
): Promise<void> {
	const [interest] = await db
		.select()
		.from(interests)
		.where(eq(interests.id, interestId))
		.limit(1);
	if (!interest) return;

	const kinds = KINDS_BY_DEPTH[interest.verifyDepth];
	if (kinds.length === 0) return;

	const [user] = await db
		.select({ tenantId: users.tenantId })
		.from(users)
		.where(eq(users.id, interest.candidateUserId))
		.limit(1);
	if (!user?.tenantId) return;

	for (const kind of kinds) {
		const connector = pickConnectorForKind(kind);
		const [row] = await db
			.insert(verifications)
			.values({
				interestId,
				candidateUserId: interest.candidateUserId,
				connector: connector.slug,
				kind,
				status: "pending",
			})
			.returning({ id: verifications.id });

		const req: ConnectorRequest = {
			kind,
			context: {
				tenantId: user.tenantId,
				candidateUserId: interest.candidateUserId,
			},
		};

		try {
			const result = await connector.verify(req);
			await db
				.update(verifications)
				.set({
					status: result.status,
					message: result.message,
					evidence: result.evidence,
					completedAt: result.status === "pending" ? null : new Date(),
				})
				.where(eq(verifications.id, row.id));
		} catch (e) {
			await db
				.update(verifications)
				.set({
					status: "failed",
					message: e instanceof Error ? e.message : String(e),
					completedAt: new Date(),
				})
				.where(eq(verifications.id, row.id));
		}
	}
}

export async function listVerificationsForInterest(interestId: string) {
	return db
		.select()
		.from(verifications)
		.where(eq(verifications.interestId, interestId));
}
