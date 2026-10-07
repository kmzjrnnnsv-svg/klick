import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { processes, processProviders } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { listProviders } from "@/lib/compliance/queries-p2";
import { listProcesses } from "@/lib/compliance/queries-p3";
import { toCsv } from "@/lib/csv";
import { readOrg } from "@/lib/db/with-org";
import {
	buildInformationRegister,
	registerReadme,
} from "@/lib/export/information-register";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest, type ZipEntry } from "@/lib/export/zip";
import { getOrgSettings } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

// Informationsregister (DORA Art. 28(3)) nach ITS 2024/2956: je Meldebogen
// eine CSV mit den Spaltencodes, README mit Legende und offenen Punkten,
// Manifest. ?stichtag=YYYY-MM-DD setzt das Meldedatum (Default heute).
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	const stichtag = new URL(req.url).searchParams.get("stichtag");
	if (stichtag && !/^\d{4}-\d{2}-\d{2}$/.test(stichtag))
		return new NextResponse("ungültiger Stichtag", { status: 400 });
	const generatedAt = new Date();
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [settings, providers, functions, links] = await Promise.all([
			getOrgSettings(tx, ctx.orgId),
			listProviders(tx, ctx.orgId),
			listProcesses(tx, ctx.orgId),
			tx
				.select({
					providerId: processProviders.providerId,
					processCode: processes.code,
				})
				.from(processProviders)
				.innerJoin(processes, eq(processes.id, processProviders.processId))
				.where(eq(processProviders.organizationId, ctx.orgId)),
		]);
		return { settings, providers, functions, links };
	});
	const profile = data.settings?.entityProfile ?? {};
	const out = buildInformationRegister({
		entity: {
			name: org.name,
			lei: profile.lei ?? null,
			country: profile.country ?? "DE",
			sector: data.settings?.sector ?? "other",
			competentAuthority: profile.competentAuthority ?? null,
			currency: "EUR",
			totalAssets: profile.totalAssetsEur ?? null,
			reportingDate: stichtag ?? stamp(),
		},
		providers: data.providers.map((p) => ({
			id: p.id,
			name: p.name,
			lei: p.lei,
			country: p.country,
			isIct: p.isIct,
			isIntraGroup: p.isIntraGroup,
			status: p.status,
			serviceType: p.serviceType,
			serviceDescription: p.serviceDescription,
			criticality: p.criticality,
			substitutability: p.substitutability,
			dataLocations: p.dataLocations,
			subcontractors: p.subcontractors ?? [],
			contractRef: p.contractRef,
			contractStart: p.contractStart,
			contractEnd: p.contractEnd,
			noticePeriodDays: p.noticePeriodDays,
			exitStrategy: p.exitStrategy,
			lastAssessmentAt: p.lastAssessmentAt,
			processesPersonalData: p.processesPersonalData,
		})),
		functions: data.functions.map((f) => ({
			code: f.code,
			name: f.name,
			status: f.status,
			criticality: f.criticality,
			rtoHours: f.rtoHours,
			rpoHours: f.rpoHours,
			impactNotes: f.impactNotes,
			reviewAt: f.reviewAt,
			updatedAt: f.updatedAt,
		})),
		links: data.links,
	});

	const files: ZipEntry[] = [
		{
			name: "README.md",
			data: registerReadme(out, org.name),
			mtime: generatedAt,
		},
		...out.templates.map((t) => ({
			name: `${t.code}.csv`,
			data: toCsv(
				t.columns.map((c) => c.code),
				t.rows,
			),
			mtime: generatedAt,
		})),
	];
	const { entries, manifest } = withManifest(files, {
		title: "Informationsregister ITS 2024/2956",
		generatedAt,
		organization: { id: org.id, name: org.name },
		period: { from: null, to: out.reportingDate },
		extra: {
			providers: out.providerCount,
			functions: out.functionCount,
			warnings: out.warnings.length,
		},
	});
	const zip = buildZip(entries);
	await auditExport(ctx, "information_register_zip", manifest.files.length, {
		providers: out.providerCount,
		functions: out.functionCount,
		warnings: out.warnings.length,
		reportingDate: out.reportingDate,
	});
	return zipResponse(
		`informationsregister-${org.slug}-${out.reportingDate}.zip`,
		zip,
	);
}
