import { and, eq, inArray } from "drizzle-orm";
import {
	frameworks,
	requirementApplicability,
	requirements,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { exclusionAllowedForKey } from "./exclusions";

// Anforderungen mit Begründung ausschließen (manuelle Anwendbarkeit), nur
// wo das Rahmenwerk Ausschlüsse kennt. Gemeinsam für „Nicht relevant“ in
// der Gap-Analyse und den Control-Status „nicht anwendbar“; der Schalter an
// der Anforderung schreibt direkt (setRequirementApplicability).
export async function excludeRequirements(
	tx: OrgTx,
	orgId: string,
	items: readonly { key: string; note: string }[],
	via: string,
): Promise<AuditInput[]> {
	const allowed = items.filter((i) => exclusionAllowedForKey(i.key));
	if (allowed.length === 0) return [];
	const slugs = [...new Set(allowed.map((i) => i.key.split(":")[0] ?? ""))];
	const rows = await tx
		.select({
			id: requirements.id,
			code: requirements.code,
			slug: frameworks.slug,
		})
		.from(requirements)
		.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
		.where(inArray(frameworks.slug, slugs));
	const idByKey = new Map(rows.map((r) => [`${r.slug}:${r.code}`, r.id]));
	const audits: AuditInput[] = [];
	for (const item of allowed) {
		const requirementId = idByKey.get(item.key);
		if (!requirementId) continue;
		const [before] = await tx
			.select({
				applicable: requirementApplicability.applicable,
				source: requirementApplicability.source,
			})
			.from(requirementApplicability)
			.where(
				and(
					eq(requirementApplicability.organizationId, orgId),
					eq(requirementApplicability.requirementId, requirementId),
				),
			)
			.limit(1);
		if (before?.source === "manual" && before.applicable === false) continue;
		const note = item.note.trim().slice(0, 2000);
		await tx
			.insert(requirementApplicability)
			.values({
				organizationId: orgId,
				requirementId,
				applicable: false,
				source: "manual",
				note,
			})
			.onConflictDoUpdate({
				target: [
					requirementApplicability.organizationId,
					requirementApplicability.requirementId,
				],
				set: { applicable: false, source: "manual", note },
			});
		audits.push({
			action: "requirement.applicability",
			target: `requirement:${item.key}`,
			before: before ?? { applicable: true, source: "default" },
			after: { applicable: false, source: "manual", note, via },
		});
	}
	return audits;
}
