import { and, eq, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
	amlRiskAnalyses,
	documents,
	exceptions,
	incidents,
	risks,
	scopes,
} from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Eigner:in einer Entität für die Freigabe-Regel owner_of_entity — immer
// serverseitig aus der Tabelle, nie aus der Anfrage des Browsers (sonst
// konnte niemand die Eigner-Stufe entscheiden: decide() bekam null).
// Entitäten ohne Owner-Spalte (Beschluss, Eigenmittelberechnung) → null.

type OwnerSource = {
	table: PgTable;
	id: PgColumn;
	org: PgColumn;
	owner: PgColumn;
};

export const ENTITY_OWNER_SOURCES: Partial<Record<EntityKind, OwnerSource>> = {
	document: {
		table: documents,
		id: documents.id,
		org: documents.organizationId,
		owner: documents.ownerUserId,
	},
	risk: {
		table: risks,
		id: risks.id,
		org: risks.organizationId,
		owner: risks.ownerUserId,
	},
	incident: {
		table: incidents,
		id: incidents.id,
		org: incidents.organizationId,
		owner: incidents.ownerUserId,
	},
	exception: {
		table: exceptions,
		id: exceptions.id,
		org: exceptions.organizationId,
		owner: exceptions.ownerUserId,
	},
	scope: {
		table: scopes,
		id: scopes.id,
		org: scopes.organizationId,
		owner: scopes.ownerUserId,
	},
	aml_risk_analysis: {
		table: amlRiskAnalyses,
		id: amlRiskAnalyses.id,
		org: amlRiskAnalyses.organizationId,
		owner: amlRiskAnalyses.ownerUserId,
	},
};

export type EntityRef = { entityType: EntityKind; entityId: string };

// Schlüssel "type:id" → Owner (oder null). Eine Abfrage je Entitätstyp.
export async function entityOwners(
	tx: OrgTx,
	orgId: string,
	refs: readonly EntityRef[],
): Promise<Map<string, string | null>> {
	const out = new Map<string, string | null>();
	const byType = new Map<EntityKind, string[]>();
	for (const r of refs) {
		out.set(`${r.entityType}:${r.entityId}`, null);
		const list = byType.get(r.entityType) ?? [];
		list.push(r.entityId);
		byType.set(r.entityType, list);
	}
	for (const [type, ids] of byType) {
		const src = ENTITY_OWNER_SOURCES[type];
		if (!src) continue;
		const rows = (await tx
			.select({ id: src.id, owner: src.owner })
			.from(src.table)
			.where(and(eq(src.org, orgId), inArray(src.id, ids)))) as {
			id: string;
			owner: string | null;
		}[];
		for (const row of rows) out.set(`${type}:${row.id}`, row.owner);
	}
	return out;
}

export async function entityOwner(
	tx: OrgTx,
	orgId: string,
	ref: EntityRef,
): Promise<string | null> {
	const map = await entityOwners(tx, orgId, [ref]);
	return map.get(`${ref.entityType}:${ref.entityId}`) ?? null;
}
