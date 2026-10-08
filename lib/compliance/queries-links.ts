import { eq } from "drizzle-orm";
import {
	assets,
	processAssets,
	processes,
	processProviders,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

export type ProcessRef = { code: string; name: string };
export type AssetRef = { id: string; name: string };

// Rückrichtungen der Verknüpfungen für Register: welche Prozesse nutzen ein
// Asset bzw. einen Dienstleister, welche Assets stellt ein Dienstleister.
// Gepflegt werden die Kanten am Prozess (Verknüpfungen) und am Asset
// (Dienstleister).
export async function linkIndex(tx: OrgTx, orgId: string) {
	const [pa, pp, as] = await Promise.all([
		tx
			.select({
				assetId: processAssets.assetId,
				code: processes.code,
				name: processes.name,
			})
			.from(processAssets)
			.innerJoin(processes, eq(processes.id, processAssets.processId))
			.where(eq(processAssets.organizationId, orgId)),
		tx
			.select({
				providerId: processProviders.providerId,
				code: processes.code,
				name: processes.name,
			})
			.from(processProviders)
			.innerJoin(processes, eq(processes.id, processProviders.processId))
			.where(eq(processProviders.organizationId, orgId)),
		tx
			.select({
				id: assets.id,
				name: assets.name,
				providerId: assets.providerId,
			})
			.from(assets)
			.where(eq(assets.organizationId, orgId)),
	]);
	const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
		const list = m.get(k) ?? [];
		list.push(v);
		m.set(k, list);
	};
	const processesByAsset = new Map<string, ProcessRef[]>();
	for (const r of pa)
		push(processesByAsset, r.assetId, { code: r.code, name: r.name });
	const processesByProvider = new Map<string, ProcessRef[]>();
	for (const r of pp)
		push(processesByProvider, r.providerId, { code: r.code, name: r.name });
	const assetsByProvider = new Map<string, AssetRef[]>();
	for (const r of as)
		if (r.providerId)
			push(assetsByProvider, r.providerId, { id: r.id, name: r.name });
	return { processesByAsset, processesByProvider, assetsByProvider };
}
