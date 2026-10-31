import { DOMAINS, type Domain } from "@/db/schema/enums";

// Eigene Rahmenwerke (R4), reine Regeln: Kurzname und Slug im Katalog,
// Grenzen, CSV-Zeilen in Anforderungen übersetzen. Kein DB-Zugriff.

export const CUSTOM_SLUG_PREFIX = "x-";
export const MAX_CUSTOM_FRAMEWORKS = 20;
export const MAX_CUSTOM_REQUIREMENTS = 3000;
export const MAX_CONTROLS_PER_REQUIREMENT = 8;

const KEY_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;

export function isCustomSlug(slug: string): boolean {
	return slug.startsWith(CUSTOM_SLUG_PREFIX);
}

export function customSlug(key: string): string {
	return `${CUSTOM_SLUG_PREFIX}${key}`;
}

export function keyFromSlug(slug: string): string | null {
	return isCustomSlug(slug) ? slug.slice(CUSTOM_SLUG_PREFIX.length) : null;
}

export function validKey(key: string): boolean {
	return KEY_RE.test(key);
}

const UMLAUT: Record<string, string> = {
	ä: "ae",
	ö: "oe",
	ü: "ue",
	ß: "ss",
};

// Kurzname (≤ 30 Zeichen, Slug `x-<key>` bleibt unter der Grenze von
// frameworkSlugs) aus dem Namen: klein, Umlaute ausgeschrieben, nur a–z, 0–9, „-“
export function suggestKey(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[äöüß]/g, (c) => UMLAUT[c] ?? c)
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 30)
		.replace(/-+$/g, "");
	return base.length >= 1 ? base : "rahmenwerk";
}

// Freien Kurznamen finden (key, key-2, key-3 …)
export function uniqueKey(wanted: string, taken: ReadonlySet<string>): string {
	if (!taken.has(wanted)) return wanted;
	for (let i = 2; i < 1000; i++) {
		const suffix = `-${i}`;
		const candidate = `${wanted.slice(0, 30 - suffix.length)}${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${wanted.slice(0, 21)}-${Date.now().toString(36)}`;
}

// ── CSV ────────────────────────────────────────────────────────────────

export type CsvRequirement = {
	sectionCode: string;
	sectionTitle?: string;
	code: string;
	title: string;
	text: string;
	domain: Domain;
	controls: { code: string; coverage: "full" | "partial" }[];
};

export type CsvRowError = { row: number; error: string };

// Spaltennamen (deutsch und englisch, klein, ohne Leerzeichen)
const COLUMNS: Record<keyof CsvRaw, readonly string[]> = {
	section: ["abschnitt", "section", "kapitel", "chapter"],
	sectionTitle: [
		"abschnitt_titel",
		"abschnittstitel",
		"section_title",
		"kapitel_titel",
	],
	code: ["code", "nummer", "nr", "id", "ref"],
	title: ["titel", "title", "name"],
	text: ["text", "anforderung", "requirement", "beschreibung", "description"],
	domain: ["bereich", "domain", "domaene"],
	controls: ["controls", "control", "massnahmen", "maßnahmen", "mapping"],
	coverage: ["abdeckung", "coverage"],
};

type CsvRaw = {
	section: string;
	sectionTitle: string;
	code: string;
	title: string;
	text: string;
	domain: string;
	controls: string;
	coverage: string;
};

function pick(row: Record<string, string>, names: readonly string[]): string {
	for (const [k, v] of Object.entries(row)) {
		const key = k
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, "_");
		if (names.includes(key)) return (v ?? "").trim();
	}
	return "";
}

const DOMAIN_ALIASES: Record<string, Domain> = {
	steuerung: "governance",
	organisation: "governance",
	risiko: "risk",
	werte: "asset",
	zugriff: "access",
	zugang: "access",
	kryptografie: "crypto",
	verschluesselung: "crypto",
	physisch: "physical",
	betrieb: "operations",
	netz: "network",
	netzwerk: "network",
	entwicklung: "development",
	lieferanten: "supplier",
	dienstleister: "supplier",
	vorfall: "incident",
	vorfaelle: "incident",
	notfall: "continuity",
	compliance: "compliance",
	datenschutz: "compliance",
	personal: "hr",
	geldwaesche: "aml",
	verhalten: "conduct",
	zahlungen: "payments",
	verwahrung: "custody",
	betrug: "fraud",
};

export function parseDomain(value: string, fallback: Domain): Domain {
	const v = value
		.trim()
		.toLowerCase()
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue");
	if (!v) return fallback;
	if ((DOMAINS as readonly string[]).includes(v)) return v as Domain;
	return DOMAIN_ALIASES[v] ?? fallback;
}

// Codes mit Komma, Semikolon oder Leerzeichen getrennt; Abdeckung je Code
// mit „:teilweise“/„:partial“ oder für alle aus der Spalte abdeckung
export function parseControls(
	value: string,
	coverage: string,
	known: (code: string) => boolean,
): { controls: CsvRequirement["controls"]; unknown: string[] } {
	const all = /^(teil|partial)/i.test(coverage.trim()) ? "partial" : "full";
	const controls: CsvRequirement["controls"] = [];
	const unknown: string[] = [];
	for (const part of value.split(/[\s,;|]+/).filter(Boolean)) {
		const [raw = "", cov] = part.split(":");
		const code = raw.toUpperCase();
		if (!known(code)) {
			unknown.push(raw);
			continue;
		}
		if (controls.some((c) => c.code === code)) continue;
		controls.push({
			code,
			coverage: cov ? (/^(teil|partial)/i.test(cov) ? "partial" : "full") : all,
		});
	}
	return {
		controls: controls.slice(0, MAX_CONTROLS_PER_REQUIREMENT),
		unknown,
	};
}

export function mapCsvRows(
	rows: readonly Record<string, string>[],
	known: (code: string) => boolean,
	fallbackDomain: Domain = "governance",
): { items: CsvRequirement[]; errors: CsvRowError[] } {
	const items: CsvRequirement[] = [];
	const errors: CsvRowError[] = [];
	const seen = new Set<string>();
	for (const [i, row] of rows.entries()) {
		const n = i + 2; // Kopfzeile = 1
		const raw: CsvRaw = {
			section: pick(row, COLUMNS.section),
			sectionTitle: pick(row, COLUMNS.sectionTitle),
			code: pick(row, COLUMNS.code),
			title: pick(row, COLUMNS.title),
			text: pick(row, COLUMNS.text),
			domain: pick(row, COLUMNS.domain),
			controls: pick(row, COLUMNS.controls),
			coverage: pick(row, COLUMNS.coverage),
		};
		if (!raw.code) {
			errors.push({ row: n, error: "code_missing" });
			continue;
		}
		if (raw.code.length > 40) {
			errors.push({ row: n, error: "code_too_long" });
			continue;
		}
		if (seen.has(raw.code)) {
			errors.push({ row: n, error: "code_duplicate" });
			continue;
		}
		if (!raw.title && !raw.text) {
			errors.push({ row: n, error: "text_missing" });
			continue;
		}
		seen.add(raw.code);
		const { controls, unknown } = parseControls(
			raw.controls,
			raw.coverage,
			known,
		);
		if (unknown.length > 0)
			errors.push({ row: n, error: `control_unknown:${unknown.join(",")}` });
		items.push({
			sectionCode: (raw.section || "A").slice(0, 40),
			...(raw.sectionTitle
				? { sectionTitle: raw.sectionTitle.slice(0, 200) }
				: {}),
			code: raw.code,
			title: (raw.title || raw.text).slice(0, 300),
			text: (raw.text || raw.title).slice(0, 5000),
			domain: parseDomain(raw.domain, fallbackDomain),
			controls,
		});
	}
	return { items, errors };
}

// Sortierung „natürlich“: 3.1.2 vor 3.1.10
export function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
}
