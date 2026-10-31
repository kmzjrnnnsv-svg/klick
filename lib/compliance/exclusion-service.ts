import { and, eq, inArray } from "drizzle-orm";
import {
	customRequirements,
	frameworks,
	requirementApplicability,
	requirements,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { isCustomSlug } from "@/lib/custom-frameworks/rules";
import type { OrgTx } from "@/lib/db/with-org";
import { exclusionAllowedForKey } from "./exclusions";
import type { OrgCatalog } from "./org-catalog";

// Anforderungen mit Begründung ausschließen (manuelle Anwendbarkeit), nur
// wo das Rahmenwerk Ausschlüsse kennt. Gemeinsam für „Nicht relevant“ in
// der Gap-Analyse und den Control-Status „nicht anwendbar“; der Schalter an
// der Anforderung schreibt direkt (setRequirementApplicability).
export async function excludeRequirements(
	tx: OrgTx,
	orgId: string,
	items: readonly { key: string; note: string }[],
	via: string,
	catalog?: OrgCatalog,
): Promise<AuditInput[]> {
	const permitted = items.filter((i) => exclusionAllowedForKey(i.key, catalog));
	// Eigene Rahmenwerke (R4) führen den Ausschluss an der Anforderung selbst
	const custom = catalog
		? permitted.filter((i) => isCustomSlug(i.key.split(":")[0] ?? ""))
		: [];
	const allowed = permitted.filter((i) => !custom.includes(i));
	const audits: AuditInput[] = catalog
		? await excludeCustom(tx, orgId, custom, via, catalog)
		: [];
	if (allowed.length === 0) return audits;
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

async function excludeCustom(
	tx: OrgTx,
	orgId: string,
	items: readonly { key: string; note: string }[],
	via: string,
	catalog: OrgCatalog,
): Promise<AuditInput[]> {
	const audits: AuditInput[] = [];
	for (const item of items) {
		const i = item.key.indexOf(":");
		const slug = item.key.slice(0, i);
		const code = item.key.slice(i + 1);
		const info = catalog.custom.get(slug);
		const id = info?.requirementIds.get(code);
		if (!info || !id || info.status === "retired" || info.excluded.has(code))
			continue;
		const note = item.note.trim().slice(0, 2000);
		await tx
			.update(customRequirements)
			.set({ excluded: true, exclusionReason: note, updatedAt: new Date() })
			.where(
				and(
					eq(customRequirements.organizationId, orgId),
					eq(customRequirements.id, id),
				),
			);
		audits.push({
			action: "custom_framework.requirement_excluded",
			target: `custom_framework:${info.id}`,
			after: { code, reason: note, via },
		});
	}
	return audits;
}
