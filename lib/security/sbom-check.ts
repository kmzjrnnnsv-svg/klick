import type { SbomSummary } from "@/db/schema/enums";

// SBOM-Prüfung (CRA Anhang I Teil II Nr. 1, BSI TR-03183-2): CycloneDX- oder
// SPDX-JSON einlesen und Pflichtfelder je Komponente zählen. Rein; die
// Komponenten selbst landen nur verschlüsselt im Nachweis, gespeichert wird
// die Zusammenfassung (products.sbomSummary).
//
// Blockierend (ok = false): keine Komponenten, kein Zeitstempel, Version oder
// eindeutige Kennung (purl/CPE/SWID) bei < 90 % der Komponenten, keine
// Abhängigkeitsbeziehungen. Hinweise ohne Blockade: Lizenz, Hash, Lieferant
// < 80 %, ältere Formatversion, kein Ersteller.

export type SbomComponent = {
	name: string;
	version: boolean;
	identifier: boolean;
	license: boolean;
	hash: boolean;
	supplier: boolean;
};

export type ParsedSbom = {
	format: "cyclonedx" | "spdx";
	specVersion: string | null;
	generatedAt: string | null;
	creator: boolean;
	primaryComponent: string | null;
	components: SbomComponent[];
	dependencies: boolean;
};

export type SbomParseError =
	| "invalid_json"
	| "unknown_format"
	| "unsupported_version";

const MAX_COMPONENTS = 200_000;
const MAX_DEPTH = 16;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
	typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const assertion = (v: unknown): string | null => {
	const s = str(v);
	return s && s !== "NOASSERTION" && s !== "NONE" ? s : null;
};

function cycloneComponent(c: Obj): SbomComponent {
	const licenses = arr(c.licenses).some(
		(l) =>
			isObj(l) &&
			(str(l.expression) !== null ||
				(isObj(l.license) &&
					(str(l.license.id) !== null || str(l.license.name) !== null))),
	);
	const supplier =
		(isObj(c.supplier) && str(c.supplier.name) !== null) ||
		str(c.author) !== null ||
		str(c.publisher) !== null ||
		(isObj(c.manufacturer) && str(c.manufacturer.name) !== null);
	return {
		name: str(c.name) ?? "?",
		version: str(c.version) !== null,
		identifier:
			str(c.purl) !== null ||
			str(c.cpe) !== null ||
			(isObj(c.swid) && str(c.swid.tagId) !== null),
		license: licenses,
		hash: arr(c.hashes).some((h) => isObj(h) && str(h.content) !== null),
		supplier,
	};
}

function parseCycloneDx(doc: Obj): ParsedSbom {
	const meta = isObj(doc.metadata) ? doc.metadata : {};
	const out: SbomComponent[] = [];
	const walk = (list: unknown[], depth: number) => {
		if (depth > MAX_DEPTH) return;
		for (const c of list) {
			if (out.length >= MAX_COMPONENTS) return;
			if (!isObj(c)) continue;
			out.push(cycloneComponent(c));
			walk(arr(c.components), depth + 1);
		}
	};
	walk(arr(doc.components), 0);
	const primary = isObj(meta.component)
		? [str(meta.component.name), str(meta.component.version)]
				.filter(Boolean)
				.join(" ") || null
		: null;
	const tools = meta.tools;
	const creator =
		arr(meta.authors).length > 0 ||
		(isObj(meta.manufacturer) && str(meta.manufacturer.name) !== null) ||
		(isObj(meta.manufacture) && str(meta.manufacture.name) !== null) ||
		(isObj(meta.supplier) && str(meta.supplier.name) !== null) ||
		arr(tools).length > 0 ||
		(isObj(tools) && arr(tools.components).length > 0);
	return {
		format: "cyclonedx",
		specVersion: str(doc.specVersion),
		generatedAt: str(meta.timestamp),
		creator,
		primaryComponent: primary,
		components: out,
		dependencies: arr(doc.dependencies).some(
			(d) => isObj(d) && arr(d.dependsOn).length > 0,
		),
	};
}

function parseSpdx(doc: Obj): ParsedSbom {
	const info = isObj(doc.creationInfo) ? doc.creationInfo : {};
	const describes = new Set(
		arr(doc.documentDescribes).filter(
			(x): x is string => typeof x === "string",
		),
	);
	const rels = arr(doc.relationships).filter(isObj);
	for (const r of rels)
		if (
			r.relationshipType === "DESCRIBES" &&
			typeof r.relatedSpdxElement === "string"
		)
			describes.add(r.relatedSpdxElement);
	let primary: string | null = null;
	const out: SbomComponent[] = [];
	for (const p of arr(doc.packages)) {
		if (out.length >= MAX_COMPONENTS) break;
		if (!isObj(p)) continue;
		const name = str(p.name) ?? "?";
		if (typeof p.SPDXID === "string" && describes.has(p.SPDXID) && !primary) {
			primary = [name, str(p.versionInfo)].filter(Boolean).join(" ");
		}
		out.push({
			name,
			version: str(p.versionInfo) !== null,
			identifier: arr(p.externalRefs).some(
				(r) =>
					isObj(r) &&
					["purl", "cpe22Type", "cpe23Type", "swid"].includes(
						String(r.referenceType),
					) &&
					str(r.referenceLocator) !== null,
			),
			license:
				assertion(p.licenseConcluded) !== null ||
				assertion(p.licenseDeclared) !== null,
			hash: arr(p.checksums).some(
				(c) => isObj(c) && str(c.checksumValue) !== null,
			),
			supplier:
				assertion(p.supplier) !== null || assertion(p.originator) !== null,
		});
	}
	return {
		format: "spdx",
		specVersion: str(doc.spdxVersion)?.replace(/^SPDX-/, "") ?? null,
		generatedAt: str(info.created),
		creator: arr(info.creators).length > 0,
		primaryComponent: primary,
		components: out,
		dependencies: rels.some(
			(r) =>
				r.relationshipType === "DEPENDS_ON" ||
				r.relationshipType === "DEPENDENCY_OF" ||
				r.relationshipType === "CONTAINS",
		),
	};
}

export function parseSbom(
	text: string,
): { ok: true; sbom: ParsedSbom } | { ok: false; error: SbomParseError } {
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		return { ok: false, error: "invalid_json" };
	}
	if (!isObj(doc)) return { ok: false, error: "unknown_format" };
	if (doc.bomFormat === "CycloneDX")
		return { ok: true, sbom: parseCycloneDx(doc) };
	if (typeof doc.spdxVersion === "string") {
		if (!doc.spdxVersion.startsWith("SPDX-2"))
			return { ok: false, error: "unsupported_version" };
		return { ok: true, sbom: parseSpdx(doc) };
	}
	// SPDX 3 (JSON-LD) und andere Formate: noch nicht unterstützt
	if ("@context" in doc) return { ok: false, error: "unsupported_version" };
	return { ok: false, error: "unknown_format" };
}

function versionAtLeast(v: string | null, min: number[]): boolean {
	if (!v) return false;
	const parts = v.split(".").map((x) => Number.parseInt(x, 10) || 0);
	for (let i = 0; i < min.length; i++) {
		const a = parts[i] ?? 0;
		const b = min[i] ?? 0;
		if (a !== b) return a > b;
	}
	return true;
}

const pct = (n: number, total: number) =>
	total === 0 ? 0 : Math.round((n / total) * 100);

export function checkSbom(sbom: ParsedSbom, now: Date): SbomSummary {
	const n = sbom.components.length;
	const count = (k: keyof Omit<SbomComponent, "name">) =>
		pct(sbom.components.filter((c) => c[k]).length, n);
	const fields = {
		version: count("version"),
		identifier: count("identifier"),
		license: count("license"),
		hash: count("hash"),
		supplier: count("supplier"),
	};
	const blocking: string[] = [];
	const hints: string[] = [];
	if (n === 0) blocking.push("Keine Komponenten enthalten");
	if (!sbom.generatedAt) blocking.push("Kein Erstellungszeitpunkt");
	if (n > 0 && fields.version < 90)
		blocking.push(`Version nur bei ${fields.version} % der Komponenten`);
	if (n > 0 && fields.identifier < 90)
		blocking.push(
			`Eindeutige Kennung (purl/CPE) nur bei ${fields.identifier} % der Komponenten`,
		);
	if (n > 1 && !sbom.dependencies)
		blocking.push("Keine Abhängigkeitsbeziehungen");
	if (n > 0 && fields.license < 80)
		hints.push(`Lizenz nur bei ${fields.license} % der Komponenten`);
	if (n > 0 && fields.hash < 80)
		hints.push(
			`Hash nur bei ${fields.hash} % der Komponenten (TR-03183-2: SHA-512)`,
		);
	if (n > 0 && fields.supplier < 80)
		hints.push(
			`Hersteller/Lieferant nur bei ${fields.supplier} % der Komponenten`,
		);
	if (!sbom.creator) hints.push("Ersteller der SBOM nicht angegeben");
	const minVersion = sbom.format === "cyclonedx" ? [1, 5] : [2, 2, 1];
	if (!versionAtLeast(sbom.specVersion, minVersion))
		hints.push(
			`Formatversion ${sbom.specVersion ?? "?"} älter als ${sbom.format === "cyclonedx" ? "CycloneDX 1.5" : "SPDX 2.2.1"}`,
		);
	return {
		format: sbom.format,
		specVersion: sbom.specVersion,
		generatedAt: sbom.generatedAt,
		primaryComponent: sbom.primaryComponent,
		components: n,
		fields,
		dependencies: sbom.dependencies,
		issues: [...blocking, ...hints],
		ok: blocking.length === 0,
		checkedAt: now.toISOString(),
	};
}
