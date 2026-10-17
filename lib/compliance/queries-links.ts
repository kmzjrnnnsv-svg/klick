import { and, eq } from "drizzle-orm";
import {
	assets,
	auditFindings,
	documentControls,
	documentProcesses,
	documents,
	exceptions,
	incidentAssets,
	incidentProcesses,
	incidentProviders,
	incidents,
	milestoneControls,
	milestones,
	nonconformities,
	processAssets,
	processControls,
	processes,
	processProviders,
	processRisks,
	providers,
	riskAssets,
	riskControls,
	risks,
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

// ── Rückverknüpfungen je Detailseite ───────────────────────────────────────
// Gepflegt wird jede Kante an einer Stelle (Prozess, Risiko, Dokument,
// Vorfall); die Gegenseite zeigt sie lesend mit Link.

export type RiskRef = { id: string; code: string; title: string };
export type DocumentRef = { docNumber: string; title: string };
export type IncidentRef = { id: string; code: string; title: string };

// Control-Seite „Verwendet in“ (Katalog-Control-ID, nicht Implementation).
export async function controlUsage(
	tx: OrgTx,
	orgId: string,
	controlId: string,
) {
	const [r, d, p, m, e, f] = await Promise.all([
		tx
			.select({ id: risks.id, code: risks.code, title: risks.title })
			.from(riskControls)
			.innerJoin(risks, eq(risks.id, riskControls.riskId))
			.where(
				and(
					eq(riskControls.organizationId, orgId),
					eq(riskControls.controlId, controlId),
				),
			),
		tx
			.select({ docNumber: documents.docNumber, title: documents.title })
			.from(documentControls)
			.innerJoin(documents, eq(documents.id, documentControls.documentId))
			.where(
				and(
					eq(documentControls.organizationId, orgId),
					eq(documentControls.controlId, controlId),
				),
			),
		tx
			.select({ code: processes.code, name: processes.name })
			.from(processControls)
			.innerJoin(processes, eq(processes.id, processControls.processId))
			.where(
				and(
					eq(processControls.organizationId, orgId),
					eq(processControls.controlId, controlId),
				),
			),
		tx
			.select({ id: milestones.id, title: milestones.title })
			.from(milestoneControls)
			.innerJoin(milestones, eq(milestones.id, milestoneControls.milestoneId))
			.where(
				and(
					eq(milestoneControls.organizationId, orgId),
					eq(milestoneControls.controlId, controlId),
				),
			),
		tx
			.select({ id: exceptions.id, title: exceptions.title })
			.from(exceptions)
			.where(
				and(
					eq(exceptions.organizationId, orgId),
					eq(exceptions.controlId, controlId),
				),
			),
		tx
			.select({
				id: auditFindings.id,
				auditId: auditFindings.auditId,
				title: auditFindings.title,
			})
			.from(auditFindings)
			.where(
				and(
					eq(auditFindings.organizationId, orgId),
					eq(auditFindings.controlId, controlId),
				),
			),
	]);
	return {
		risks: r,
		documents: d,
		processes: p,
		milestones: m,
		exceptions: e,
		findings: f,
	};
}

export async function processesForRisk(
	tx: OrgTx,
	orgId: string,
	riskId: string,
) {
	return tx
		.select({ code: processes.code, name: processes.name })
		.from(processRisks)
		.innerJoin(processes, eq(processes.id, processRisks.processId))
		.where(
			and(
				eq(processRisks.organizationId, orgId),
				eq(processRisks.riskId, riskId),
			),
		);
}

export async function processesForDocument(
	tx: OrgTx,
	orgId: string,
	documentId: string,
) {
	return tx
		.select({ code: processes.code, name: processes.name })
		.from(documentProcesses)
		.innerJoin(processes, eq(processes.id, documentProcesses.processId))
		.where(
			and(
				eq(documentProcesses.organizationId, orgId),
				eq(documentProcesses.documentId, documentId),
			),
		);
}

// Register-Spalten: Risiken je Asset, Vorfälle je Asset bzw. Dienstleister.
export async function riskAndIncidentIndex(tx: OrgTx, orgId: string) {
	const [ra, ia, ip] = await Promise.all([
		tx
			.select({
				assetId: riskAssets.assetId,
				id: risks.id,
				code: risks.code,
				title: risks.title,
			})
			.from(riskAssets)
			.innerJoin(risks, eq(risks.id, riskAssets.riskId))
			.where(eq(riskAssets.organizationId, orgId)),
		tx
			.select({
				assetId: incidentAssets.assetId,
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
			})
			.from(incidentAssets)
			.innerJoin(incidents, eq(incidents.id, incidentAssets.incidentId))
			.where(eq(incidentAssets.organizationId, orgId)),
		tx
			.select({
				providerId: incidentProviders.providerId,
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
			})
			.from(incidentProviders)
			.innerJoin(incidents, eq(incidents.id, incidentProviders.incidentId))
			.where(eq(incidentProviders.organizationId, orgId)),
	]);
	const group = <K extends string, R extends Record<K, string>>(
		rows: readonly R[],
		key: K,
	) => {
		const m = new Map<string, Omit<R, K>[]>();
		for (const r of rows) {
			const { [key]: k, ...rest } = r;
			const list = m.get(k) ?? [];
			list.push(rest);
			m.set(k, list);
		}
		return m;
	};
	return {
		risksByAsset: group(ra, "assetId"),
		incidentsByAsset: group(ia, "assetId"),
		incidentsByProvider: group(ip, "providerId"),
	};
}

// Vorfall-Seite: betroffene Assets/Dienstleister/Prozesse und die daraus
// entstandenen Abweichungen.
export async function incidentLinks(
	tx: OrgTx,
	orgId: string,
	incidentId: string,
) {
	const [a, p, pr, nc] = await Promise.all([
		tx
			.select({ id: assets.id, name: assets.name })
			.from(incidentAssets)
			.innerJoin(assets, eq(assets.id, incidentAssets.assetId))
			.where(
				and(
					eq(incidentAssets.organizationId, orgId),
					eq(incidentAssets.incidentId, incidentId),
				),
			),
		tx
			.select({ id: providers.id, name: providers.name })
			.from(incidentProviders)
			.innerJoin(providers, eq(providers.id, incidentProviders.providerId))
			.where(
				and(
					eq(incidentProviders.organizationId, orgId),
					eq(incidentProviders.incidentId, incidentId),
				),
			),
		tx
			.select({ id: processes.id, code: processes.code, name: processes.name })
			.from(incidentProcesses)
			.innerJoin(processes, eq(processes.id, incidentProcesses.processId))
			.where(
				and(
					eq(incidentProcesses.organizationId, orgId),
					eq(incidentProcesses.incidentId, incidentId),
				),
			),
		tx
			.select({
				id: nonconformities.id,
				code: nonconformities.code,
				title: nonconformities.title,
				status: nonconformities.status,
			})
			.from(nonconformities)
			.where(
				and(
					eq(nonconformities.organizationId, orgId),
					eq(nonconformities.source, "incident"),
					eq(nonconformities.sourceRefId, incidentId),
				),
			),
	]);
	return { assets: a, providers: p, processes: pr, nonconformities: nc };
}

// Gegenrichtung für Prozess- und Dienstleister-Seite.
export async function incidentsFor(
	tx: OrgTx,
	orgId: string,
	ref: { processId: string } | { providerId: string },
): Promise<IncidentRef[]> {
	const sel = {
		id: incidents.id,
		code: incidents.code,
		title: incidents.title,
	};
	if ("processId" in ref)
		return tx
			.select(sel)
			.from(incidentProcesses)
			.innerJoin(incidents, eq(incidents.id, incidentProcesses.incidentId))
			.where(
				and(
					eq(incidentProcesses.organizationId, orgId),
					eq(incidentProcesses.processId, ref.processId),
				),
			);
	return tx
		.select(sel)
		.from(incidentProviders)
		.innerJoin(incidents, eq(incidents.id, incidentProviders.incidentId))
		.where(
			and(
				eq(incidentProviders.organizationId, orgId),
				eq(incidentProviders.providerId, ref.providerId),
			),
		);
}
