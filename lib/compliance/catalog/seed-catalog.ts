import { eq } from "drizzle-orm";
import type { GlobalDb } from "@/db";
import { frameworks } from "@/db/schema";
import { FRAMEWORKS } from "./frameworks";

// Idempotent: upsertet Stammdaten, löscht nie. Anforderungen, Controls und
// Kanten folgen in P1/P4 an derselben Stelle.
export async function syncCatalog(
	db: GlobalDb,
): Promise<{ frameworks: number }> {
	for (const f of FRAMEWORKS) {
		await db
			.insert(frameworks)
			.values({
				slug: f.slug,
				name: f.name,
				version: f.version ?? null,
				authority: f.authority ?? null,
				jurisdiction: f.jurisdiction,
				legalBasis: f.legalBasis ?? null,
				legalBasisRefs: f.legalBasisRefs ?? [],
				description: f.description,
				recommendedApproach: f.recommendedApproach ?? null,
				sourceUrl: f.sourceUrl ?? null,
				sortOrder: f.sortOrder,
			})
			.onConflictDoUpdate({
				target: frameworks.slug,
				set: {
					name: f.name,
					version: f.version ?? null,
					authority: f.authority ?? null,
					jurisdiction: f.jurisdiction,
					legalBasis: f.legalBasis ?? null,
					legalBasisRefs: f.legalBasisRefs ?? [],
					description: f.description,
					recommendedApproach: f.recommendedApproach ?? null,
					sourceUrl: f.sourceUrl ?? null,
					sortOrder: f.sortOrder,
				},
			});
	}
	// Nachfolger-Verweise (GwG → AMLR) im zweiten Durchgang.
	for (const f of FRAMEWORKS) {
		if (!f.successorSlug) continue;
		const [succ] = await db
			.select({ id: frameworks.id })
			.from(frameworks)
			.where(eq(frameworks.slug, f.successorSlug))
			.limit(1);
		if (succ) {
			await db
				.update(frameworks)
				.set({ successorFrameworkId: succ.id })
				.where(eq(frameworks.slug, f.slug));
		}
	}
	return { frameworks: FRAMEWORKS.length };
}
