import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
	assets,
	auditFindings,
	controls,
	frameworks,
	incidents,
	kpiMeasurements,
	nonconformities,
	objectives,
	orgSettings,
	processes,
	processRisks,
	products,
	providerRatings,
	providers,
	requirements,
	riskAssets,
	risks,
	securityFindings,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { assetLifecycle } from "./assets";
import { valueState } from "./indicators";
import { shortFrameworkName } from "./page-data";
import { type RiskProposal, riskProposals } from "./risk-proposals";
import type { RiskSourceData, RiskSourceKind } from "./risk-sources";

// Herkunft eines Risikos laden (B1) — nur im Org-Kontext (RLS); null, wenn
// die Quelle nicht zur Org gehört oder nicht existiert.
export async function loadRiskSource(
	tx: OrgTx,
	orgId: string,
	kind: RiskSourceKind,
	id: string,
	today = new Date(),
): Promise<RiskSourceData | null> {
	const base = { kind, id };
	switch (kind) {
		case "provider": {
			const [p] = await tx
				.select({ name: providers.name, criticality: providers.criticality })
				.from(providers)
				.where(and(eq(providers.id, id), eq(providers.organizationId, orgId)));
			if (!p) return null;
			return {
				...base,
				name: p.name,
				label: `Dienstleister „${p.name}“`,
				href: `/dienstleister/${id}`,
				providerCritical: p.criticality !== "standard",
				providerId: id,
			};
		}
		case "provider_rating": {
			const [r] = await tx
				.select({
					code: providerRatings.code,
					providerId: providerRatings.providerId,
					traffic: providerRatings.traffic,
					name: providers.name,
					criticality: providers.criticality,
				})
				.from(providerRatings)
				.innerJoin(providers, eq(providers.id, providerRatings.providerId))
				.where(
					and(
						eq(providerRatings.id, id),
						eq(providerRatings.organizationId, orgId),
					),
				);
			if (!r) return null;
			const traffic =
				r.traffic === "red" ? "rot" : r.traffic === "amber" ? "gelb" : "grün";
			return {
				...base,
				name: r.name,
				label: `Bewertung ${r.code} („${r.name}“)`,
				href: `/dienstleister/${r.providerId}/bewertung/${id}`,
				ratingTraffic: r.traffic ?? null,
				providerCritical: r.criticality !== "standard",
				providerId: r.providerId,
				detail: r.traffic ? `Ergebnis ${traffic}` : undefined,
			};
		}
		case "asset": {
			const [a] = await tx
				.select()
				.from(assets)
				.where(and(eq(assets.id, id), eq(assets.organizationId, orgId)));
			if (!a) return null;
			const lc = assetLifecycle(a, today);
			return {
				...base,
				name: a.name,
				label: `Asset „${a.name}“`,
				href: `/assets?asset=${id}`,
				assetType: a.type,
				lifecycle: lc.state === "unknown" ? null : lc.state,
				detail: lc.reasons.join(", ") || undefined,
				assetId: id,
			};
		}
		case "process": {
			const [p] = await tx
				.select({ code: processes.code, name: processes.name })
				.from(processes)
				.where(and(eq(processes.id, id), eq(processes.organizationId, orgId)));
			if (!p) return null;
			return {
				...base,
				name: `${p.code} ${p.name}`,
				label: `Prozess ${p.code} „${p.name}“`,
				href: `/prozesse/${p.code}`,
				processId: id,
			};
		}
		case "incident": {
			const [i] = await tx
				.select({
					code: incidents.code,
					title: incidents.title,
					regimes: incidents.regimes,
					affectsPayments: incidents.affectsPayments,
					classification: incidents.classification,
				})
				.from(incidents)
				.where(and(eq(incidents.id, id), eq(incidents.organizationId, orgId)));
			if (!i) return null;
			return {
				...base,
				name: i.title,
				label: `Vorfall ${i.code} „${i.title}“`,
				href: `/vorfaelle/${id}`,
				incidentPersonalData: (i.regimes ?? []).includes("dsgvo"),
				incidentPayments: i.affectsPayments,
			};
		}
		case "requirement": {
			const [r] = await tx
				.select({
					code: requirements.code,
					title: requirements.title,
					slug: frameworks.slug,
					fw: frameworks.name,
				})
				.from(requirements)
				.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
				.where(eq(requirements.id, id));
			if (!r) return null;
			return {
				...base,
				name: `${r.fw} ${r.code} ${r.title}`,
				label: `Anforderung ${r.fw} ${r.code}`,
				href: `/rahmenwerke/${r.slug}/${encodeURIComponent(r.code)}`,
				frameworkSlug: r.slug,
			};
		}
		case "control": {
			const [c] = await tx
				.select({ code: controls.code, title: controls.title })
				.from(controls)
				.where(eq(controls.id, id));
			if (!c) return null;
			return {
				...base,
				name: `${c.code} ${c.title}`,
				label: `Control ${c.code}`,
				href: `/controls/${c.code}`,
				controlCodes: [c.code],
			};
		}
		case "security_finding": {
			const [f] = await tx
				.select({
					title: securityFindings.title,
					severity: securityFindings.severity,
					category: securityFindings.category,
					productId: securityFindings.productId,
					controlCode: securityFindings.controlCode,
				})
				.from(securityFindings)
				.where(
					and(
						eq(securityFindings.id, id),
						eq(securityFindings.organizationId, orgId),
					),
				);
			if (!f) return null;
			return {
				...base,
				name: f.title,
				label: `Befund „${f.title}“`,
				href: `/sicherheit/befunde/${id}`,
				findingCategory: f.category,
				findingProduct: Boolean(f.productId),
				detail: `Schwere ${f.severity}`,
				controlCodes: f.controlCode ? [f.controlCode] : undefined,
			};
		}
		case "nonconformity": {
			const [n] = await tx
				.select({ code: nonconformities.code, title: nonconformities.title })
				.from(nonconformities)
				.where(
					and(
						eq(nonconformities.id, id),
						eq(nonconformities.organizationId, orgId),
					),
				);
			if (!n) return null;
			return {
				...base,
				name: n.title,
				label: `Abweichung ${n.code} „${n.title}“`,
				href: `/abweichungen/${id}`,
			};
		}
		case "audit_finding": {
			const [f] = await tx
				.select({
					title: auditFindings.title,
					severity: auditFindings.severity,
					auditId: auditFindings.auditId,
					controlCode: controls.code,
				})
				.from(auditFindings)
				.leftJoin(controls, eq(controls.id, auditFindings.controlId))
				.where(
					and(
						eq(auditFindings.id, id),
						eq(auditFindings.organizationId, orgId),
					),
				);
			if (!f) return null;
			return {
				...base,
				name: f.title,
				label: `Audit-Finding „${f.title}“`,
				href: `/audits/${f.auditId}`,
				detail: `Schwere ${f.severity}`,
				controlCodes: f.controlCode ? [f.controlCode] : undefined,
			};
		}
		case "product": {
			const [p] = await tx
				.select({ code: products.code, name: products.name })
				.from(products)
				.where(and(eq(products.id, id), eq(products.organizationId, orgId)));
			if (!p) return null;
			return {
				...base,
				name: p.name,
				label: `Produkt ${p.code} „${p.name}“`,
				href: `/produkte/${id}`,
			};
		}
		case "objective": {
			const [o] = await tx
				.select({
					title: objectives.title,
					indicatorType: objectives.indicatorType,
				})
				.from(objectives)
				.where(
					and(eq(objectives.id, id), eq(objectives.organizationId, orgId)),
				);
			if (!o) return null;
			return {
				...base,
				name: o.title,
				label: `Ziel „${o.title}“`,
				href: "/organisation?tab=ziele",
				indicatorType: o.indicatorType,
			};
		}
	}
}

export type SourceRisk = {
	id: string;
	code: string;
	title: string;
	status: string;
	likelihood: number;
	impact: number;
};

// Risiken einer Quelle: über die Herkunft und die fachlichen Bezüge
// (Dienstleister, Asset, Prozess).
export async function listRisksBySource(
	tx: OrgTx,
	orgId: string,
	kind: RiskSourceKind,
	id: string,
): Promise<SourceRisk[]> {
	const cols = {
		id: risks.id,
		code: risks.code,
		title: risks.title,
		status: risks.status,
		likelihood: risks.likelihood,
		impact: risks.impact,
	};
	const bySource = and(
		eq(risks.sourceEntityType, kind),
		eq(risks.sourceEntityId, id),
	);
	let extraIds: string[] = [];
	if (kind === "asset")
		extraIds = (
			await tx
				.select({ id: riskAssets.riskId })
				.from(riskAssets)
				.where(eq(riskAssets.assetId, id))
		).map((r) => r.id);
	if (kind === "process")
		extraIds = (
			await tx
				.select({ id: processRisks.riskId })
				.from(processRisks)
				.where(eq(processRisks.processId, id))
		).map((r) => r.id);
	return tx
		.select(cols)
		.from(risks)
		.where(
			and(
				eq(risks.organizationId, orgId),
				or(
					bySource,
					kind === "provider" ? eq(risks.providerId, id) : undefined,
					extraIds.length > 0 ? inArray(risks.id, extraIds) : undefined,
				),
			),
		)
		.orderBy(asc(risks.code));
}

// Katalog-ID (controls bzw. requirements) aus Code bzw. Rahmenwerk + Code
export async function catalogId(
	tx: OrgTx,
	key: { controlCode: string } | { slug: string; code: string },
): Promise<string | null> {
	if ("controlCode" in key) {
		const [c] = await tx
			.select({ id: controls.id })
			.from(controls)
			.where(eq(controls.code, key.controlCode))
			.limit(1);
		return c?.id ?? null;
	}
	const [r] = await tx
		.select({ id: requirements.id })
		.from(requirements)
		.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
		.where(and(eq(frameworks.slug, key.slug), eq(requirements.code, key.code)))
		.limit(1);
	return r?.id ?? null;
}

// Vorschläge (B3): Daten für riskProposals — im Org-Kontext
export async function loadRiskProposals(
	tx: OrgTx,
	orgId: string,
	cov: { result: { byRequirement: ReadonlyMap<string, string> } } | null,
	now = new Date(),
): Promise<{ proposals: RiskProposal[]; moreGaps: number }> {
	const [
		assetRows,
		providerRows,
		ratingRows,
		incidentRows,
		findingRows,
		ncRows,
		riskRows,
		riskAssetRows,
		settingsRow,
	] = await Promise.all([
		tx
			.select()
			.from(assets)
			.where(
				and(eq(assets.organizationId, orgId), eq(assets.status, "active")),
			),
		tx
			.select({
				id: providers.id,
				name: providers.name,
				criticality: providers.criticality,
				nextAssessmentAt: providers.nextAssessmentAt,
				status: providers.status,
			})
			.from(providers)
			.where(eq(providers.organizationId, orgId)),
		tx
			.select({
				id: providerRatings.id,
				providerId: providerRatings.providerId,
				traffic: providerRatings.traffic,
				completedAt: providerRatings.completedAt,
			})
			.from(providerRatings)
			.where(
				and(
					eq(providerRatings.organizationId, orgId),
					eq(providerRatings.status, "completed"),
				),
			)
			.orderBy(desc(providerRatings.completedAt)),
		tx
			.select({
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
				classification: incidents.classification,
			})
			.from(incidents)
			.where(
				and(
					eq(incidents.organizationId, orgId),
					inArray(incidents.classification, ["major", "significant"]),
				),
			),
		tx
			.select({
				id: securityFindings.id,
				title: securityFindings.title,
				severity: securityFindings.severity,
				status: securityFindings.status,
				dueAt: securityFindings.dueAt,
			})
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.organizationId, orgId),
					inArray(securityFindings.status, ["open", "in_progress"]),
					inArray(securityFindings.severity, ["critical", "high"]),
				),
			),
		tx
			.select({
				id: nonconformities.id,
				code: nonconformities.code,
				title: nonconformities.title,
			})
			.from(nonconformities)
			.where(
				and(
					eq(nonconformities.organizationId, orgId),
					inArray(nonconformities.status, ["open", "in_progress"]),
				),
			),
		tx
			.select({
				type: risks.sourceEntityType,
				id: risks.sourceEntityId,
				providerId: risks.providerId,
			})
			.from(risks)
			.where(eq(risks.organizationId, orgId)),
		tx
			.select({ assetId: riskAssets.assetId })
			.from(riskAssets)
			.where(eq(riskAssets.organizationId, orgId)),
		tx
			.select({ dismissed: orgSettings.riskProposalDismissals })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1),
	]);

	// Risikokennzahlen (KRI) über der Alarmschwelle (B5)
	const kriRows = await tx
		.select({
			id: objectives.id,
			title: objectives.title,
			direction: objectives.direction,
			targetValue: objectives.targetValue,
			warnAt: objectives.warnAt,
			alertAt: objectives.alertAt,
			value: kpiMeasurements.numericValue,
			measuredAt: kpiMeasurements.measuredAt,
		})
		.from(objectives)
		.innerJoin(kpiMeasurements, eq(kpiMeasurements.objectiveId, objectives.id))
		.where(
			and(
				eq(objectives.organizationId, orgId),
				eq(objectives.indicatorType, "kri"),
				eq(objectives.approvalStatus, "approved"),
			),
		)
		.orderBy(desc(kpiMeasurements.measuredAt));
	const latestKri = new Map<string, (typeof kriRows)[number]>();
	for (const k of kriRows) if (!latestKri.has(k.id)) latestKri.set(k.id, k);
	const indicators = [...latestKri.values()].map((k) => ({
		id: k.id,
		title: k.title,
		state: k.value === null ? "no_data" : valueState(k.value, k),
	}));

	const covered = new Set<string>();
	for (const r of riskRows) {
		if (r.type && r.id) covered.add(`${r.type}:${r.id}`);
		if (r.providerId) covered.add(`provider:${r.providerId}`);
	}
	for (const a of riskAssetRows) covered.add(`asset:${a.assetId}`);

	// letzte abgeschlossene Bewertung je Dienstleister
	const latest = new Map<string, (typeof ratingRows)[number]>();
	for (const r of ratingRows)
		if (!latest.has(r.providerId)) latest.set(r.providerId, r);
	for (const [pid, r] of latest)
		if (covered.has(`provider:${pid}`)) covered.add(`provider_rating:${r.id}`);

	// Lücken: anwendbar und offen — höchstens zehn einzeln (Katalogreihenfolge)
	const openKeys = [...(cov?.result.byRequirement ?? new Map())]
		.filter(([, v]) => v === "open")
		.map(([k]) => k);
	const shown = openKeys.slice(0, 10);
	const reqRows =
		shown.length > 0
			? await tx
					.select({
						id: requirements.id,
						code: requirements.code,
						slug: frameworks.slug,
						fw: frameworks.name,
						title: requirements.title,
					})
					.from(requirements)
					.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
					.where(
						inArray(frameworks.slug, [
							...new Set(shown.map((k) => k.split(":")[0] ?? "")),
						]),
					)
			: [];
	const byKey = new Map(reqRows.map((r) => [`${r.slug}:${r.code}`, r]));
	const gaps = shown.flatMap((k) => {
		const r = byKey.get(k);
		return r
			? [
					{
						id: r.id,
						key: k,
						label: `${shortFrameworkName(r.slug)} ${r.code} ${r.title}`,
					},
				]
			: [];
	});

	const proposals = riskProposals({
		now,
		assets: assetRows.map((a) => {
			const lc = assetLifecycle(a, now);
			return { id: a.id, name: a.name, state: lc.state, reasons: lc.reasons };
		}),
		providers: providerRows.map((p) => {
			const r = latest.get(p.id);
			return {
				...p,
				traffic: r?.traffic ?? null,
				ratingId: r?.id ?? null,
			};
		}),
		incidents: incidentRows,
		gaps,
		moreGaps: Math.max(0, openKeys.length - shown.length),
		findings: findingRows.map((f) => ({ ...f, dueAt: f.dueAt ?? null })),
		nonconformities: ncRows,
		indicators,
		covered,
		dismissed: new Set(Object.keys(settingsRow[0]?.dismissed ?? {})),
	});
	return {
		proposals,
		moreGaps: Math.max(0, openKeys.length - shown.length),
	};
}
