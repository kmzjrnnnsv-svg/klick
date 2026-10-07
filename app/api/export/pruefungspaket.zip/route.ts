import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
	auditLog,
	controlTests,
	documentVersions,
	evidence,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { frameworkNameMap } from "@/lib/compliance/page-data";
import {
	listControlRows,
	listEvidenceWithControls,
	orgCoverage,
	userNames,
} from "@/lib/compliance/queries";
import {
	listDocuments,
	listIncidents,
	listRisks,
} from "@/lib/compliance/queries-p2";
import { getAudit } from "@/lib/compliance/queries-p3";
import { DEFAULT_RISK_APPETITE } from "@/lib/compliance/risk";
import { readOrg } from "@/lib/db/with-org";
import {
	type AuditPackageInput,
	buildAuditPackage,
	type PackagePeriod,
} from "@/lib/export/audit-package";
import {
	buildGapRows,
	buildRiskRows,
	buildSoaMarkdown,
	GAP_HEADER,
	RISK_HEADER,
} from "@/lib/export/builders";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest } from "@/lib/export/zip";
import { getOrgSettings } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

// Prüfungspaket als ZIP mit SHA-256-Manifest. ?audit=<id> übernimmt Zeitraum,
// Rahmenwerke, Findings und Nachweisanfragen des Audits; sonst ?von=&bis=
// (ISO-Daten) oder der gesamte Bestand. Step-up Pflicht; jeder Export steht
// im Audit-Log.
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	const sp = new URL(req.url).searchParams;
	const auditId = sp.get("audit");
	if (auditId && !UUID.test(auditId))
		return new NextResponse(null, { status: 404 });
	const von = sp.get("von");
	const bis = sp.get("bis");
	if ((von && !ISO_DATE.test(von)) || (bis && !ISO_DATE.test(bis)))
		return new NextResponse("ungültiger Zeitraum", { status: 400 });

	const generatedAt = new Date();
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const cov = await orgCoverage(tx, ctx.orgId);
		if (!cov) return null;
		const auditData = auditId ? await getAudit(tx, ctx.orgId, auditId) : null;
		if (auditId && !auditData) return null;
		const period: PackagePeriod | null = auditData
			? auditData.audit.periodStart || auditData.audit.periodEnd
				? {
						from: auditData.audit.periodStart,
						to: auditData.audit.periodEnd,
					}
				: null
			: von || bis
				? { from: von, to: bis }
				: null;
		const frameworks = auditData
			? auditData.audit.frameworkIds.filter((s) => cov.frameworks.includes(s))
			: cov.frameworks;

		const [
			settings,
			evidenceLinks,
			controls,
			risks,
			documents,
			incidents,
			tests,
		] = await Promise.all([
			getOrgSettings(tx, ctx.orgId),
			listEvidenceWithControls(tx, ctx.orgId),
			listControlRows(tx, ctx.orgId),
			listRisks(tx, ctx.orgId),
			listDocuments(tx, ctx.orgId),
			listIncidents(tx, ctx.orgId),
			tx
				.select({
					implementationId: controlTests.implementationId,
					testedAt: controlTests.testedAt,
					result: controlTests.result,
				})
				.from(controlTests)
				.where(eq(controlTests.organizationId, ctx.orgId)),
		]);
		const versions = await tx
			.select()
			.from(documentVersions)
			.where(eq(documentVersions.organizationId, ctx.orgId))
			.orderBy(asc(documentVersions.createdAt));
		const fileEvidence = await tx
			.select({
				id: evidence.id,
				fileName: evidence.fileName,
				sha256: evidence.sha256,
			})
			.from(evidence)
			.where(eq(evidence.organizationId, ctx.orgId));

		const logConditions = [eq(auditLog.organizationId, ctx.orgId)];
		if (period?.from)
			logConditions.push(
				gte(auditLog.at, new Date(`${period.from}T00:00:00Z`)),
			);
		if (period?.to)
			logConditions.push(
				lte(auditLog.at, new Date(`${period.to}T23:59:59.999Z`)),
			);
		const log = await tx
			.select({
				seq: auditLog.seq,
				at: auditLog.at,
				actorUserId: auditLog.actorUserId,
				action: auditLog.action,
				target: auditLog.target,
				outcome: auditLog.outcome,
				prevHash: auditLog.prevHash,
				hash: auditLog.hash,
			})
			.from(auditLog)
			.where(and(...logConditions))
			.orderBy(asc(auditLog.seq))
			.limit(50_000);
		const chain = await verifyAuditChain(tx, ctx.orgId);
		const names = await userNames(tx, [
			...log.map((l) => l.actorUserId),
			...versions.map((v) => v.approvedByUserId),
		]);
		return {
			cov,
			period,
			frameworks,
			appetite: settings?.riskAppetite ?? DEFAULT_RISK_APPETITE,
			evidenceLinks,
			controls,
			risks,
			documents,
			versions,
			fileEvidence,
			incidents,
			tests,
			log,
			chain,
			names,
			auditData,
		};
	});
	if (!data) return new NextResponse(null, { status: 404 });

	const evidenceByControl = new Map<string, number>();
	for (const e of data.evidenceLinks)
		for (const code of e.controlCodes)
			evidenceByControl.set(code, (evidenceByControl.get(code) ?? 0) + 1);
	const lastTest = new Map<string, { at: number; result: string | null }>();
	for (const t of data.tests) {
		if (!t.implementationId || !t.testedAt) continue;
		const prev = lastTest.get(t.implementationId);
		if (!prev || t.testedAt.getTime() > prev.at)
			lastTest.set(t.implementationId, {
				at: t.testedAt.getTime(),
				result: t.result,
			});
	}
	const fileById = new Map(data.fileEvidence.map((f) => [f.id, f]));
	const versionsByDoc = new Map<string, typeof data.versions>();
	for (const v of data.versions) {
		const list = versionsByDoc.get(v.documentId) ?? [];
		list.push(v);
		versionsByDoc.set(v.documentId, list);
	}
	const frameworkNames = frameworkNameMap();
	const soa = data.frameworks.includes("iso27001")
		? buildSoaMarkdown(data.cov, evidenceByControl, stamp())
		: null;

	const input: AuditPackageInput = {
		org: { id: org.id, name: org.name },
		generatedAt,
		period: data.period,
		frameworks: data.frameworks,
		frameworkNames,
		soaMarkdown: soa,
		gap: data.frameworks.map((slug) => ({
			slug,
			header: GAP_HEADER,
			rows: buildGapRows(data.cov, [slug]),
		})),
		controls: data.controls.map((c) => ({
			code: c.code,
			title: c.title,
			domain: c.domain,
			status: c.status,
			ownerName: c.ownerName,
			assigneeName: c.assigneeName,
			nextReviewAt: c.nextReviewAt,
			note: c.note,
			evidenceCount: evidenceByControl.get(c.code) ?? 0,
			lastTestResult: lastTest.get(c.implementationId)?.result ?? null,
		})),
		risks: {
			header: RISK_HEADER,
			rows: buildRiskRows(data.risks, data.appetite),
		},
		documents: data.documents.map((d) => ({
			docNumber: d.docNumber,
			title: d.title,
			type: d.type,
			status: d.status,
			classification: d.classification,
			version: d.version,
			ownerName: d.names.ownerUserId ?? null,
			nextReviewAt: d.nextReviewAt,
			versions: (versionsByDoc.get(d.id) ?? [])
				.filter((v) => v.publishedAt)
				.map((v) => {
					const f = v.fileEvidenceId ? fileById.get(v.fileEvidenceId) : null;
					return {
						version: v.version,
						publishedAt: v.publishedAt,
						approvedAt: v.approvedAt,
						approvedByName: v.approvedByUserId
							? (data.names.get(v.approvedByUserId) ?? null)
							: null,
						changeSummary: v.changeSummary,
						bodyMarkdown: v.bodyMarkdown,
						fileName: f?.fileName ?? null,
						fileSha256: f?.sha256 ?? null,
					};
				}),
		})),
		evidence: data.evidenceLinks.map((e) => ({
			id: e.id,
			title: e.title,
			type: e.type,
			classification: e.classification,
			fileName: e.fileName,
			mimeType: e.mimeType,
			sizeBytes: e.sizeBytes,
			sha256: e.sha256,
			url: e.url,
			validUntil: e.validUntil,
			createdAt: e.createdAt,
			createdByName: e.createdByName,
			controlCodes: e.controlCodes,
		})),
		incidents: data.incidents.map((i) => ({
			code: i.code,
			title: i.title,
			awareAt: i.awareAt,
			regimes: i.regimes,
			classification: i.classification,
			status: i.status,
			affectsPayments: i.affectsPayments,
			initialDueAt: i.initialDueAt,
			initialReportedAt: i.initialReportedAt,
			finalReportedAt: i.finalReportedAt,
			rootCause: i.rootCause,
			ownerName: i.names.ownerUserId ?? null,
		})),
		auditLog: data.log.map((l) => ({
			seq: String(l.seq),
			at: l.at,
			actorName: l.actorUserId ? (data.names.get(l.actorUserId) ?? null) : null,
			action: l.action,
			target: l.target,
			outcome: l.outcome,
			prevHash: l.prevHash,
			hash: l.hash,
		})),
		chain: data.chain.ok
			? { ok: true, checked: data.chain.checked }
			: {
					ok: false,
					checked: data.chain.checked,
					brokenAtSeq: data.chain.brokenAtSeq,
				},
		audit: data.auditData
			? {
					title: data.auditData.audit.title,
					type: data.auditData.audit.type,
					status: data.auditData.audit.status,
					auditors: [
						...data.auditData.audit.auditorMemberIds.map(
							(u) => data.auditData?.names.get(u) ?? u,
						),
						...(data.auditData.audit.externalAuditor
							? [data.auditData.audit.externalAuditor]
							: []),
					],
					findings: data.auditData.findings.map((f) => ({
						severity: f.severity,
						title: f.title,
						description: f.description,
						controlCode: f.controlCode,
						requirementCode: f.requirementCode,
						status: f.status,
						ncCode: f.ncCode,
						createdAt: f.createdAt,
					})),
					requests: data.auditData.requests.map((r) => ({
						title: r.title,
						status: r.status,
						controlCode: r.controlCode,
						requirementCode: r.requirementCode,
						assigneeName: r.assigneeUserId
							? (data.auditData?.names.get(r.assigneeUserId) ?? null)
							: null,
						dueAt: r.dueAt,
						answeredAt: r.answeredAt,
						decidedAt: r.decidedAt,
						evidenceCount: r.responseEvidenceIds.length,
					})),
				}
			: null,
	};

	const { entries, manifest } = withManifest(buildAuditPackage(input), {
		title: "Prüfungspaket",
		generatedAt,
		organization: { id: org.id, name: org.name },
		period: data.period,
		frameworks: data.frameworks,
		extra: auditId ? { auditId } : undefined,
	});
	const zip = buildZip(entries);
	await auditExport(ctx, "audit_package_zip", manifest.files.length, {
		auditId,
		period: data.period,
		frameworks: data.frameworks,
		bytes: zip.byteLength,
		chainOk: data.chain.ok,
	});
	return zipResponse(`pruefungspaket-${org.slug}-${stamp()}.zip`, zip);
}
