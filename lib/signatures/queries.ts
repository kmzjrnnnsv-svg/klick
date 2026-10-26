import { and, eq } from "drizzle-orm";
import { evidence } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { signaturesFor } from "./service";

// Nachweis mit allen Unterschriften (Prüfseite, signaturen.json)
export async function evidenceWithSignatures(
	tx: OrgTx,
	orgId: string,
	id: string,
) {
	const [ev] = await tx
		.select({
			id: evidence.id,
			title: evidence.title,
			fileName: evidence.fileName,
			sha256: evidence.sha256,
			kindCode: evidence.kindCode,
			createdAt: evidence.createdAt,
		})
		// evidence:any-version — Prüfseite je Fassung per ID
		.from(evidence)
		.where(and(eq(evidence.id, id), eq(evidence.organizationId, orgId)))
		.limit(1);
	if (!ev) return null;
	return { evidence: ev, rows: await signaturesFor(tx, orgId, [id]) };
}
