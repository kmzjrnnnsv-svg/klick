import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { documentVersions, evidence } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { listControlRows, listEvidence } from "@/lib/compliance/queries";
import {
	listDocuments,
	listIncidents,
	listProviders,
} from "@/lib/compliance/queries-p2";
import { listProcesses } from "@/lib/compliance/queries-p3";
import { listInsurancePolicies } from "@/lib/compliance/queries-p5";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildSupplierPack } from "@/lib/export/supplier-pack";
import { buildZip, withManifest } from "@/lib/export/zip";
import { getOrgSettings } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

const INSURANCE_LABEL: Record<string, string> = {
	do: "D&O",
	cyber: "Cyber",
	crime: "Vertrauensschaden (Crime)",
	crypto_custody: "Krypto-Verwahrung",
	liability: "Haftpflicht",
};

const SECTOR_SERVICE: Record<string, string> = {
	casp: "Kryptowerte-Dienstleistungen und Zahlungsinfrastruktur (Stablecoin-Zahlungen, Verwahrung, Tausch) für Händler und Finanzpartner.",
	payment: "Zahlungsdienste nach ZAG/PSD2 für Händler und Partnerbanken.",
	emi: "E-Geld-Geschäft und Zahlungsdienste nach ZAG.",
	bank: "Bankgeschäft nach KWG/CRR.",
	other:
		"Compliance-/GRC-Software (SaaS) für regulierte Unternehmen: Common Controls, Nachweise, Register, Prüfungspakete.",
};

// DORA-Lieferantenpaket der eigenen Organisation für Banken und Finanzkunden
// (Businessplan 14.5): Registerdatenblatt, Art.-30-Anhang, Ausstiegs- und
// Notfallplan (freigegebene Versionen), Testate, Versicherungen, Sub-
// unternehmer, Vorfallmeldung. Step-up Pflicht, Export im Audit-Log.
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	const generatedAt = new Date();
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [
			settings,
			documents,
			versions,
			evidenceRows,
			insurance,
			providers,
			functions,
			incidents,
			controls,
		] = await Promise.all([
			getOrgSettings(tx, ctx.orgId),
			listDocuments(tx, ctx.orgId),
			tx
				.select()
				.from(documentVersions)
				.where(eq(documentVersions.organizationId, ctx.orgId))
				.orderBy(asc(documentVersions.createdAt)),
			listEvidence(tx, ctx.orgId),
			listInsurancePolicies(tx, ctx.orgId),
			listProviders(tx, ctx.orgId),
			listProcesses(tx, ctx.orgId),
			listIncidents(tx, ctx.orgId),
			listControlRows(tx, ctx.orgId),
		]);
		const fileEvidence = await tx
			.select({
				id: evidence.id,
				fileName: evidence.fileName,
				sha256: evidence.sha256,
			})
			.from(evidence)
			.where(eq(evidence.organizationId, ctx.orgId));
		return {
			settings,
			documents,
			versions,
			evidenceRows,
			insurance,
			providers,
			functions,
			incidents,
			controls,
			fileEvidence,
		};
	});

	const profile = data.settings?.entityProfile ?? {};
	const fileById = new Map(data.fileEvidence.map((f) => [f.id, f]));
	const latestPublishedByDoc = new Map<
		string,
		(typeof data.versions)[number]
	>();
	for (const v of data.versions) {
		if (!v.publishedAt) continue;
		const prev = latestPublishedByDoc.get(v.documentId);
		if (!prev || (prev.publishedAt?.getTime() ?? 0) < v.publishedAt.getTime())
			latestPublishedByDoc.set(v.documentId, v);
	}
	const yearAgo = new Date(generatedAt.getTime() - 365 * 86_400_000);
	const recent = data.incidents.filter((i) => i.awareAt >= yearAgo);
	const reported = recent.filter((i) => i.initialReportedAt);
	const avgHours =
		reported.length === 0
			? null
			: Math.round(
					(reported.reduce(
						(s, i) =>
							s +
							((i.initialReportedAt as Date).getTime() - i.awareAt.getTime()) /
								3_600_000,
						0,
					) /
						reported.length) *
						10,
				) / 10;

	const entriesRaw = buildSupplierPack({
		org: {
			name: org.name,
			lei: profile.lei ?? null,
			country: profile.country ?? "DE",
			legalForm: profile.legalForm ?? null,
			registerNumber: profile.registerNumber ?? null,
			sector: data.settings?.sector ?? "other",
			licenceStage: data.settings?.licenceStage ?? "0_vorbereitung",
			caspServices: data.settings?.caspServices ?? [],
			serviceDescription:
				SECTOR_SERVICE[data.settings?.sector ?? "other"] ??
				SECTOR_SERVICE.other,
		},
		generatedAt,
		documents: data.documents.map((d) => {
			const v = latestPublishedByDoc.get(d.id);
			const f = v?.fileEvidenceId ? fileById.get(v.fileEvidenceId) : null;
			return {
				templateCode: d.templateCode,
				docNumber: d.docNumber,
				title: d.title,
				status: d.status,
				version: v?.version ?? d.version,
				classification: d.classification,
				publishedAt: v?.publishedAt ?? null,
				bodyMarkdown: v?.bodyMarkdown ?? null,
				fileName: f?.fileName ?? null,
				fileSha256: f?.sha256 ?? null,
			};
		}),
		evidence: data.evidenceRows.map((e) => ({
			id: e.id,
			title: e.title,
			type: e.type,
			classification: e.classification,
			fileName: e.fileName,
			sha256: e.sha256,
			validUntil: e.validUntil,
			createdAt: e.createdAt,
		})),
		insurance: data.insurance.map((p) => ({
			type: p.type,
			insurer: p.insurer,
			policyRef: p.policyRef,
			coverageLimit: p.coverageLimit,
			subLimits: p.subLimits,
			exclusions: p.exclusions,
			validFrom: p.validFrom,
			validUntil: p.validUntil,
			hasEvidence: Boolean(p.evidenceId),
		})),
		subcontractors: data.providers
			.filter((p) => p.isIct && p.status !== "terminated")
			.map((p) => ({
				name: p.name,
				country: p.country,
				serviceType: p.serviceType,
				serviceDescription: p.serviceDescription,
				criticality: p.criticality,
				dataLocations: p.dataLocations,
				processesPersonalData: p.processesPersonalData,
				contractEnd: p.contractEnd,
			})),
		functions: data.functions
			.filter((f) => f.status !== "retired")
			.map((f) => ({
				code: f.code,
				name: f.name,
				criticality: f.criticality,
				rtoHours: f.rtoHours,
				rpoHours: f.rpoHours,
			})),
		incidents: {
			last12Months: recent.length,
			major: recent.filter((i) => i.classification === "major").length,
			avgInitialReportHours: avgHours,
		},
		controlsImplemented: {
			total: data.controls.length,
			implemented: data.controls.filter((c) => c.status === "implemented")
				.length,
		},
		insuranceTypeLabel: INSURANCE_LABEL,
	});

	const { entries, manifest } = withManifest(entriesRaw, {
		title: "DORA-Lieferantenpaket",
		generatedAt,
		organization: { id: org.id, name: org.name },
	});
	const zip = buildZip(entries);
	await auditExport(ctx, "supplier_pack_zip", manifest.files.length, {
		bytes: zip.byteLength,
	});
	return zipResponse(`lieferantenpaket-${org.slug}-${stamp()}.zip`, zip);
}
