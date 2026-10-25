import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { evidenceSignatures, roleAssignments } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { effectiveAssignment } from "./appointments";

// Annahme einer Bestellung: die bestellte Person hat das
// Bestellungsschreiben unterschrieben. Wirksam ist die Bestellung schon mit
// der Geschäftsleitung; die Unterschrift ist der Nachweis — bis dahin zeigt
// Klick „Annahme offen“ und erinnert (Tick).
export async function openAcceptances(
	tx: OrgTx,
	orgId: string,
): Promise<
	{
		id: string;
		userId: string;
		evidenceId: string;
		appointedAt: string | null;
	}[]
> {
	const rows = await tx
		.select({
			id: roleAssignments.id,
			userId: roleAssignments.userId,
			evidenceId: roleAssignments.evidenceId,
			appointedAt: roleAssignments.appointedAt,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				effectiveAssignment(),
				isNotNull(roleAssignments.userId),
				isNotNull(roleAssignments.evidenceId),
			),
		);
	const withLetter = rows.filter(
		(r): r is typeof r & { userId: string; evidenceId: string } =>
			Boolean(r.userId && r.evidenceId),
	);
	if (withLetter.length === 0) return [];
	const signed = await tx
		.select({
			evidenceId: evidenceSignatures.evidenceId,
			userId: evidenceSignatures.signerUserId,
		})
		.from(evidenceSignatures)
		.where(
			and(
				eq(evidenceSignatures.organizationId, orgId),
				inArray(
					evidenceSignatures.evidenceId,
					withLetter.map((r) => r.evidenceId),
				),
			),
		);
	const done = new Set(signed.map((s) => `${s.evidenceId}:${s.userId}`));
	return withLetter
		.filter((r) => !done.has(`${r.evidenceId}:${r.userId}`))
		.map((r) => ({
			id: r.id,
			userId: r.userId,
			evidenceId: r.evidenceId,
			appointedAt: r.appointedAt,
		}));
}
