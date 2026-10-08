"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assets, providers, risks } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nextRiskCode } from "@/lib/compliance/risk";
import { parseCsv, toBool } from "@/lib/csv";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	assetSchema,
	createRiskSchema,
	providerSchema,
} from "@/lib/validation/registers";

// CSV-Import für Register (Risiken, Assets, Dienstleister). Jede Zeile läuft
// durch dasselbe Zod-Schema wie das Formular; organization_id-Spalten werden
// ignoriert; Fehler werden je Zeile gesammelt, gültige Zeilen importiert.

const schema = z.object({ csv: z.string().min(5).max(2_000_000) });
const MAX_ROWS = 2000;

type Result = { imported: number; errors: string[] };

function rowErrors(i: number, err: z.ZodError): string {
	return `Zeile ${i + 2}: ${err.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`;
}

const num = (v: string | undefined) =>
	v === undefined || v.trim() === "" ? undefined : v.trim();

async function importRisksCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const c = await requireOrg({ risk: ["create"] });
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const table = parseCsv(parsed.data.csv);
	if (table.rows.length > MAX_ROWS) return { ok: false, error: "tooManyRows" };
	const errors: string[] = [];
	const valid: z.output<typeof createRiskSchema>[] = [];
	table.rows.forEach((r, i) => {
		const res = createRiskSchema.safeParse({
			title: r.title ?? r.titel,
			description: r.description ?? r.beschreibung ?? undefined,
			category: num(r.category ?? r.kategorie) ?? "operational",
			likelihood: num(r.likelihood ?? r.eintrittswahrscheinlichkeit) ?? 3,
			impact: num(r.impact ?? r.auswirkung) ?? 3,
		});
		if (res.success) valid.push(res.data);
		else errors.push(rowErrors(i, res.error));
	});
	const imported = await mutateOrg(toOrgCtx(c), async (tx) => {
		const existing = (
			await tx
				.select({ code: risks.code })
				.from(risks)
				.where(eq(risks.organizationId, c.orgId))
		).map((x) => x.code);
		const audits: AuditInput[] = [];
		let n = 0;
		for (const d of valid) {
			const code = nextRiskCode(existing);
			existing.push(code);
			const [row] = await tx
				.insert(risks)
				.values({
					organizationId: c.orgId,
					code,
					title: d.title,
					description: d.description ?? null,
					category: d.category,
					likelihood: d.likelihood,
					impact: d.impact,
					ownerUserId: c.userId,
				})
				.returning({ id: risks.id });
			if (row) {
				n += 1;
				audits.push({
					action: "risk.create",
					target: `risk:${row.id}`,
					after: { code, title: d.title, via: "csv" },
				});
			}
		}
		audits.push({
			action: "import.risks",
			target: `organization:${c.orgId}`,
			after: { rows: table.rows.length, imported: n, errors: errors.length },
		});
		return { result: n, audit: audits };
	});
	revalidatePath("/risiken");
	return { ok: true, data: { imported, errors } };
}

async function importAssetsCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const c = await requireOrg({ asset: ["create"] });
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const table = parseCsv(parsed.data.csv);
	if (table.rows.length > MAX_ROWS) return { ok: false, error: "tooManyRows" };
	const errors: string[] = [];
	const valid: z.output<typeof assetSchema>[] = [];
	table.rows.forEach((r, i) => {
		const res = assetSchema.safeParse({
			name: r.name,
			type: num(r.type ?? r.typ) ?? "system",
			classification: num(r.classification ?? r.klassifizierung) ?? "internal",
			location: num(r.location ?? r.standort),
			description: num(r.description ?? r.beschreibung),
			isLegacy: toBool(r.isLegacy ?? r.altsystem),
			custodian: num(r.custodian),
			backupLocation: num(r.backupLocation),
		});
		if (res.success) valid.push(res.data);
		else errors.push(rowErrors(i, res.error));
	});
	const imported = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audits: AuditInput[] = [];
		let n = 0;
		for (const d of valid) {
			const [row] = await tx
				.insert(assets)
				.values({
					organizationId: c.orgId,
					name: d.name,
					type: d.type,
					classification: d.classification,
					ownerUserId: c.userId,
					location: d.location ?? null,
					description: d.description ?? null,
					isLegacy: d.isLegacy,
					custodian: d.custodian ?? null,
					backupLocation: d.backupLocation ?? null,
				})
				.returning({ id: assets.id });
			if (row) {
				n += 1;
				audits.push({
					action: "asset.create",
					target: `asset:${row.id}`,
					after: { name: d.name, type: d.type, via: "csv" },
				});
			}
		}
		audits.push({
			action: "import.assets",
			target: `organization:${c.orgId}`,
			after: { rows: table.rows.length, imported: n, errors: errors.length },
		});
		return { result: n, audit: audits };
	});
	revalidatePath("/assets");
	return { ok: true, data: { imported, errors } };
}

async function importProvidersCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const c = await requireOrg({ provider: ["create"] });
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const table = parseCsv(parsed.data.csv);
	if (table.rows.length > MAX_ROWS) return { ok: false, error: "tooManyRows" };
	const errors: string[] = [];
	const valid: z.output<typeof providerSchema>[] = [];
	table.rows.forEach((r, i) => {
		const res = providerSchema.safeParse({
			name: r.name,
			partnerType: num(r.partnerType ?? r.art) ?? "ict",
			serviceType: num(r.serviceType ?? r.leistung),
			serviceDescription: num(r.serviceDescription ?? r.beschreibung),
			criticality: num(r.criticality ?? r.kritikalitaet) ?? "standard",
			isIct: toBool(r.isIct, true),
			isOutsourcing: toBool(r.isOutsourcing ?? r.auslagerung),
			isMaterial: toBool(r.isMaterial ?? r.wesentlich),
			country: num(r.country ?? r.land)
				?.toUpperCase()
				.slice(0, 2),
			processesPersonalData: toBool(
				r.processesPersonalData ?? r.personenbezogen,
			),
			contractRef: num(r.contractRef ?? r.vertrag),
			contractEnd: num(r.contractEnd ?? r.vertragsende) ?? null,
			noticePeriodDays: num(r.noticePeriodDays) ?? null,
		});
		if (res.success) valid.push(res.data);
		else errors.push(rowErrors(i, res.error));
	});
	const imported = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audits: AuditInput[] = [];
		let n = 0;
		for (const d of valid) {
			const [row] = await tx
				.insert(providers)
				.values({
					organizationId: c.orgId,
					name: d.name,
					partnerType: d.partnerType,
					serviceType: d.serviceType ?? null,
					serviceDescription: d.serviceDescription ?? null,
					criticality: d.criticality,
					isIct: d.isIct,
					isOutsourcing: d.isOutsourcing,
					isMaterial: d.isMaterial,
					country: d.country ?? null,
					dataLocations: [],
					processesPersonalData: d.processesPersonalData,
					contractRef: d.contractRef ?? null,
					contractEnd: d.contractEnd ?? null,
					noticePeriodDays: d.noticePeriodDays ?? null,
					ownerUserId: c.userId,
					notes: d.notes ?? null,
				})
				.returning({ id: providers.id });
			if (row) {
				n += 1;
				audits.push({
					action: "provider.create",
					target: `provider:${row.id}`,
					after: { name: d.name, partnerType: d.partnerType, via: "csv" },
				});
			}
		}
		audits.push({
			action: "import.providers",
			target: `organization:${c.orgId}`,
			after: { rows: table.rows.length, imported: n, errors: errors.length },
		});
		return { result: n, audit: audits };
	});
	revalidatePath("/dienstleister");
	return { ok: true, data: { imported, errors } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const importRisksCsv = safeAction("importRisksCsv", importRisksCsvImpl);
export const importAssetsCsv = safeAction(
	"importAssetsCsv",
	importAssetsCsvImpl,
);
export const importProvidersCsv = safeAction(
	"importProvidersCsv",
	importProvidersCsvImpl,
);
