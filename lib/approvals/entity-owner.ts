import { and, eq, inArray } from "drizzle-orm";
import {
	amlRiskAnalyses,
	assets,
	documents,
	exceptions,
	incidents,
	nonconformities,
	objectives,
	processes,
	providerRatings,
	providers,
	risks,
	scopes,
} from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Verantwortliche:r einer Entität für Freigabestufen `owner_of_entity`.
// Wird beim Entscheiden, im Posteingang und im SLA-Lauf frisch gelesen —
// vorher kam der Owner nur beim Antrag mit, und `decide` sah ihn nie.

type OwnerTable =
	| typeof amlRiskAnalyses
	| typeof assets
	| typeof documents
	| typeof exceptions
	| typeof incidents
	| typeof nonconformities
	| typeof objectives
	| typeof processes
	| typeof providers
	| typeof risks
	| typeof scopes;

const OWNER_TABLES: Partial<Record<EntityKind, OwnerTable>> = {
	aml_risk_analysis: amlRiskAnalyses,
	asset: assets,
	document: documents,
	exception: exceptions,
	incident: incidents,
	nonconformity: nonconformities,
	objective: objectives,
	process: processes,
	provider: providers,
	risk: risks,
	scope: scopes,
};

const key = (entityType: EntityKind, entityId: string) =>
	`${entityType}:${entityId}`;

export async function entityOwnersOf(
	tx: OrgTx,
	orgId: string,
	refs: readonly { entityType: EntityKind; entityId: string }[],
): Promise<Map<string, string | null>> {
	const out = new Map<string, string | null>();
	const byType = new Map<EntityKind, Set<string>>();
	for (const r of refs) {
		const set = byType.get(r.entityType) ?? new Set<string>();
		set.add(r.entityId);
		byType.set(r.entityType, set);
	}
	for (const [entityType, idSet] of byType) {
		const ids = [...idSet];
		if (entityType === "provider_rating") {
			// Bewertung → Verantwortliche:r des Dienstleisters
			const rows = await tx
				.select({ id: providerRatings.id, owner: providers.ownerUserId })
				.from(providerRatings)
				.innerJoin(providers, eq(providers.id, providerRatings.providerId))
				.where(
					and(
						eq(providerRatings.organizationId, orgId),
						inArray(providerRatings.id, ids),
					),
				);
			for (const r of rows) out.set(key(entityType, r.id), r.owner);
			continue;
		}
		const t = OWNER_TABLES[entityType] as typeof risks | undefined;
		if (!t) continue;
		const rows = await tx
			.select({ id: t.id, owner: t.ownerUserId })
			.from(t)
			.where(and(eq(t.organizationId, orgId), inArray(t.id, ids)));
		for (const r of rows) out.set(key(entityType, r.id), r.owner);
	}
	return out;
}

export async function entityOwnerOf(
	tx: OrgTx,
	orgId: string,
	entityType: EntityKind,
	entityId: string,
): Promise<string | null> {
	const m = await entityOwnersOf(tx, orgId, [{ entityType, entityId }]);
	return m.get(key(entityType, entityId)) ?? null;
}

export function ownerKey(entityType: EntityKind, entityId: string): string {
	return key(entityType, entityId);
}
