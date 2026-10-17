"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { assets, providers, risks } from "@/db/schema";
import { CLASSIFICATIONS, CRITICALITY } from "@/db/schema/enums";
import { RISK_CATEGORIES } from "@/db/schema/grc";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nextRiskCode } from "@/lib/compliance/risk";
import {
	type CsvTable,
	field,
	headerKey,
	parseCsv,
	toBool,
	toIsoDate,
} from "@/lib/csv";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	assetSchema,
	createRiskSchema,
	providerSchema,
} from "@/lib/validation/registers";

// CSV-Import für Register (Risiken, Assets, Dienstleister). Ablauf: erst
// Probelauf (dryRun) → Vorschau mit Fehlern je Zeile und Dubletten, dann
// Import der gültigen Zeilen. Jede Zeile läuft durch dasselbe Zod-Schema wie
// das Formular; organization_id-Spalten werden ignoriert; Einträge mit schon
// vorhandenem Namen/Titel werden übersprungen (kein Doppelt bei Wiederholung).

const schema = z.object({
	csv: z.string().min(5).max(2_000_000),
	dryRun: z.boolean().default(false),
});
const MAX_ROWS = 2000;

type Result = {
	dryRun: boolean;
	rows: number;
	valid: number;
	imported: number;
	duplicates: string[];
	errors: string[];
};

const num = (v: string | undefined) =>
	v === undefined || v.trim() === "" ? undefined : v.trim();

// Enum-Wert aus Tabelle: Schlüssel („critical“) oder deutsches Label
// („kritisch“) — Groß/Klein und Sonderzeichen egal.
function enumValue<T extends string>(
	raw: string | undefined,
	values: readonly T[],
	label: (v: T) => string,
): string | undefined {
	const v = num(raw);
	if (v === undefined) return undefined;
	const key = headerKey(v);
	for (const x of values) {
		if (headerKey(x) === key || headerKey(label(x)) === key) return x;
	}
	return v; // unbekannt → Schema meldet „unbekannter Wert“
}

// Zod-Fehler → ein deutscher Satz je Zeile mit echter Zeilennummer.
function rowErrors(line: number, err: z.ZodError): string {
	const parts = err.issues.map((x) => {
		const col = String(x.path[0] ?? "");
		switch (x.code) {
			case "invalid_value":
				return `„${col}“: unbekannter Wert (erlaubt: ${x.values.map(String).join(", ")})`;
			case "too_small":
				return `„${col}“ fehlt oder ist zu kurz`;
			case "too_big":
				return `„${col}“ ist zu lang bzw. zu groß`;
			case "invalid_format":
				return `„${col}“: Format passt nicht${x.format === "date" ? " (Datum als TT.MM.JJJJ)" : ""}`;
			case "invalid_type":
				return `„${col}“ fehlt oder ist ungültig`;
			default:
				return `„${col}“ ist ungültig`;
		}
	});
	return `Zeile ${line}: ${parts.join("; ")}`;
}

// Gemeinsamer Ablauf: parsen, je Zeile validieren, Dubletten erkennen,
// im Probelauf nur berichten, sonst gültige Zeilen schreiben.
async function runImport<T>(opts: {
	input: unknown;
	permission: Parameters<typeof requireOrg>[0];
	kind: "risks" | "assets" | "providers";
	parseRow: (row: Record<string, string>) => z.ZodSafeParseResult<T>;
	keyOf: (d: T) => string;
	existingKeys: (
		tx: Parameters<Parameters<typeof readOrg>[1]>[0],
		orgId: string,
	) => Promise<string[]>;
	insert: (
		tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
		ctx: { orgId: string; userId: string },
		rows: T[],
	) => Promise<AuditInput[]>;
	revalidate: string;
}): Promise<ActionResult<Result>> {
	const c = await requireOrg(opts.permission);
	const parsed = schema.safeParse(opts.input);
	if (!parsed.success) return fromZod(parsed.error);
	const table: CsvTable = parseCsv(parsed.data.csv);
	if (table.rows.length > MAX_ROWS)
		return {
			ok: false,
			error: "tooManyRows",
			detail: { max: String(MAX_ROWS) },
		};
	const errors: string[] = [];
	const candidates: T[] = [];
	table.rows.forEach((r, i) => {
		const res = opts.parseRow(r);
		if (res.success) candidates.push(res.data);
		else errors.push(rowErrors(table.lines[i] ?? i + 2, res.error));
	});
	const existing = new Set(
		(await readOrg(toOrgCtx(c), (tx) => opts.existingKeys(tx, c.orgId))).map(
			(k) => k.trim().toLowerCase(),
		),
	);
	const duplicates: string[] = [];
	const valid: T[] = [];
	for (const d of candidates) {
		const key = opts.keyOf(d).trim().toLowerCase();
		if (existing.has(key)) {
			duplicates.push(opts.keyOf(d));
			continue;
		}
		existing.add(key);
		valid.push(d);
	}
	const base = {
		dryRun: parsed.data.dryRun,
		rows: table.rows.length,
		valid: valid.length,
		duplicates: duplicates.slice(0, 50),
		errors: errors.slice(0, 100),
	};
	if (parsed.data.dryRun || valid.length === 0)
		return { ok: true, data: { ...base, imported: 0 } };
	const imported = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audits = await opts.insert(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			valid,
		);
		audits.push({
			action: `import.${opts.kind}`,
			target: `organization:${c.orgId}`,
			after: {
				rows: table.rows.length,
				imported: audits.length,
				errors: errors.length,
				duplicates: duplicates.length,
			},
		});
		return { result: audits.length - 1, audit: audits };
	});
	revalidatePath(opts.revalidate);
	return { ok: true, data: { ...base, imported } };
}

async function importRisksCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const tr = await getTranslations("Risks");
	return runImport({
		input,
		permission: { risk: ["create"] },
		kind: "risks",
		revalidate: "/risiken",
		parseRow: (r) =>
			createRiskSchema.safeParse({
				title: field(r, "title", "titel", "risiko", "name"),
				description: field(r, "description", "beschreibung"),
				category:
					enumValue(field(r, "category", "kategorie"), RISK_CATEGORIES, (v) =>
						tr(`category_${v}`),
					) ?? "operational",
				likelihood:
					num(
						field(
							r,
							"likelihood",
							"eintrittswahrscheinlichkeit",
							"wahrscheinlichkeit",
						),
					) ?? 3,
				impact: num(field(r, "impact", "auswirkung", "schaden")) ?? 3,
			}),
		keyOf: (d) => d.title,
		existingKeys: async (tx, orgId) =>
			(
				await tx
					.select({ k: risks.title })
					.from(risks)
					.where(eq(risks.organizationId, orgId))
			).map((x) => x.k),
		insert: async (tx, ctx, rows) => {
			const codes = (
				await tx
					.select({ code: risks.code })
					.from(risks)
					.where(eq(risks.organizationId, ctx.orgId))
			).map((x) => x.code);
			const audits: AuditInput[] = [];
			for (const d of rows) {
				const code = nextRiskCode(codes);
				codes.push(code);
				const [row] = await tx
					.insert(risks)
					.values({
						organizationId: ctx.orgId,
						code,
						title: d.title,
						description: d.description ?? null,
						category: d.category,
						likelihood: d.likelihood,
						impact: d.impact,
						ownerUserId: ctx.userId,
					})
					.returning({ id: risks.id });
				if (row)
					audits.push({
						action: "risk.create",
						target: `risk:${row.id}`,
						after: { code, title: d.title, via: "csv" },
					});
			}
			return audits;
		},
	});
}

async function importAssetsCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const ta = await getTranslations("Assets");
	const te = await getTranslations("Evidence");
	return runImport({
		input,
		permission: { asset: ["create"] },
		kind: "assets",
		revalidate: "/assets",
		parseRow: (r) =>
			assetSchema.safeParse({
				name: field(r, "name", "bezeichnung", "asset"),
				type:
					enumValue(
						field(r, "type", "typ", "art"),
						assetSchema.shape.type.removeDefault().options,
						(v) => (ta.has(`type_${v}`) ? ta(`type_${v}` as "type_system") : v),
					) ?? "system",
				classification:
					enumValue(
						field(r, "classification", "klassifizierung", "vertraulichkeit"),
						CLASSIFICATIONS,
						(v) => te(`class_${v}`),
					) ?? "internal",
				location: num(field(r, "location", "standort")),
				description: num(field(r, "description", "beschreibung")),
				isLegacy: toBool(field(r, "isLegacy", "altsystem")),
				custodian: num(field(r, "custodian", "verwahrer")),
				backupLocation: num(
					field(r, "backupLocation", "backupstandort", "backup"),
				),
			}),
		keyOf: (d) => d.name,
		existingKeys: async (tx, orgId) =>
			(
				await tx
					.select({ k: assets.name })
					.from(assets)
					.where(eq(assets.organizationId, orgId))
			).map((x) => x.k),
		insert: async (tx, ctx, rows) => {
			const audits: AuditInput[] = [];
			for (const d of rows) {
				const [row] = await tx
					.insert(assets)
					.values({
						organizationId: ctx.orgId,
						name: d.name,
						type: d.type,
						classification: d.classification,
						ownerUserId: ctx.userId,
						location: d.location ?? null,
						description: d.description ?? null,
						isLegacy: d.isLegacy,
						custodian: d.custodian ?? null,
						backupLocation: d.backupLocation ?? null,
					})
					.returning({ id: assets.id });
				if (row)
					audits.push({
						action: "asset.create",
						target: `asset:${row.id}`,
						after: { name: d.name, type: d.type, via: "csv" },
					});
			}
			return audits;
		},
	});
}

async function importProvidersCsvImpl(
	input: unknown,
): Promise<ActionResult<Result>> {
	const tp = await getTranslations("Providers");
	return runImport({
		input,
		permission: { provider: ["create"] },
		kind: "providers",
		revalidate: "/dienstleister",
		parseRow: (r) =>
			providerSchema.safeParse({
				name: field(r, "name", "dienstleister", "firma"),
				partnerType:
					enumValue(
						field(r, "partnerType", "art", "partnerart"),
						providerSchema.shape.partnerType.removeDefault().options,
						(v) => tp(`partner_${v}`),
					) ?? "ict",
				serviceType: enumValue(
					field(r, "serviceType", "leistung", "leistungsart"),
					providerSchema.shape.serviceType.unwrap().options,
					(v) => tp(`service_${v}`),
				),
				serviceDescription: num(field(r, "serviceDescription", "beschreibung")),
				criticality:
					enumValue(
						field(r, "criticality", "kritikalitaet", "kritikalität"),
						CRITICALITY,
						(v) => tp(`crit_${v}`),
					) ?? "standard",
				isIct: toBool(field(r, "isIct", "ikt"), true),
				isOutsourcing: toBool(field(r, "isOutsourcing", "auslagerung")),
				isMaterial: toBool(field(r, "isMaterial", "wesentlich")),
				country: num(field(r, "country", "land"))
					?.toUpperCase()
					.slice(0, 2),
				processesPersonalData: toBool(
					field(r, "processesPersonalData", "personenbezogen"),
				),
				contractRef: num(field(r, "contractRef", "vertrag", "vertragsnummer")),
				contractEnd:
					toIsoDate(field(r, "contractEnd", "vertragsende", "laufzeitende")) ??
					null,
				noticePeriodDays:
					num(field(r, "noticePeriodDays", "kuendigungsfrist")) ?? null,
			}),
		keyOf: (d) => d.name,
		existingKeys: async (tx, orgId) =>
			(
				await tx
					.select({ k: providers.name })
					.from(providers)
					.where(eq(providers.organizationId, orgId))
			).map((x) => x.k),
		insert: async (tx, ctx, rows) => {
			const audits: AuditInput[] = [];
			for (const d of rows) {
				const [row] = await tx
					.insert(providers)
					.values({
						organizationId: ctx.orgId,
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
						ownerUserId: ctx.userId,
						notes: d.notes ?? null,
					})
					.returning({ id: providers.id });
				if (row)
					audits.push({
						action: "provider.create",
						target: `provider:${row.id}`,
						after: { name: d.name, partnerType: d.partnerType, via: "csv" },
					});
			}
			return audits;
		},
	});
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
