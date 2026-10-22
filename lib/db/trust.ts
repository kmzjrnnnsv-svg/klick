import { and, eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { type TrustSnapshot, trustCenters } from "@/db/schema";
import { slugValid } from "@/lib/trust/rules";

// Öffentliches Lesen des Trust Centers ohne Org-Kontext: Die Policy
// trust_centers_public gibt nur veröffentlichte Zeilen frei, die Transaktion
// ist READ ONLY und setzt keinen Kontext — andere Tabellen bleiben zu. Alles
// Weitere (Anfrage speichern, Dokument laden) läuft danach mit der Org der
// Zeile über withOrg/mutateOrg.

export type PublicTrustCenter = {
	organizationId: string;
	slug: string;
	snapshot: TrustSnapshot;
	publishedAt: Date | null;
};

export async function publicTrustCenter(
	slug: string,
): Promise<PublicTrustCenter | null> {
	if (!slugValid(slug)) return null;
	const row = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		const [r] = await tx
			.select({
				organizationId: trustCenters.organizationId,
				slug: trustCenters.slug,
				snapshot: trustCenters.snapshot,
				publishedAt: trustCenters.publishedAt,
			})
			.from(trustCenters)
			.where(and(eq(trustCenters.slug, slug), eq(trustCenters.published, true)))
			.limit(1);
		return r ?? null;
	});
	if (!row?.snapshot) return null;
	return { ...row, snapshot: row.snapshot };
}
