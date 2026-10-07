import { toCsv } from "@/lib/csv";
import type { ZipEntry } from "./zip";

// Prüfungspaket (ZIP) — reine Zusammenstellung aus bereits geladenen Daten:
// SoA, Gap-Listen, Controls, Risikoregister, freigegebene Dokumentversionen,
// Nachweis-Index mit Hashes, Vorfall-Log, Audit-Log-Auszug, bei Audit-Bezug
// Findings + Nachweisanfragen. Manifest/SHA-256 hängt die Route an (zip.ts).
// Klassifizierung „secret“ wird nur gezählt, nie exportiert.

export type PackagePeriod = { from: string | null; to: string | null };

export type PackageControl = {
	code: string;
	title: string;
	domain: string;
	status: string;
	ownerName: string | null;
	assigneeName: string | null;
	nextReviewAt: string | null;
	note: string | null;
	evidenceCount: number;
	lastTestResult: string | null;
};

export type PackageDocumentVersion = {
	version: string;
	publishedAt: Date | null;
	approvedAt: Date | null;
	approvedByName: string | null;
	changeSummary: string;
	bodyMarkdown: string | null;
	fileName: string | null;
	fileSha256: string | null;
};

export type PackageDocument = {
	docNumber: string;
	title: string;
	type: string;
	status: string;
	classification: string;
	version: string;
	ownerName: string | null;
	nextReviewAt: string | null;
	versions: PackageDocumentVersion[];
};

export type PackageEvidence = {
	id: string;
	title: string;
	type: string;
	classification: string;
	fileName: string | null;
	mimeType: string | null;
	sizeBytes: number | null;
	sha256: string | null;
	url: string | null;
	validUntil: string | null;
	createdAt: Date;
	createdByName: string | null;
	controlCodes: string[];
};

export type PackageIncident = {
	code: string;
	title: string;
	awareAt: Date;
	regimes: string[];
	classification: string;
	status: string;
	affectsPayments: boolean;
	initialDueAt: Date | null;
	initialReportedAt: Date | null;
	finalReportedAt: Date | null;
	rootCause: string | null;
	ownerName: string | null;
};

export type PackageAuditEntry = {
	seq: string;
	at: Date;
	actorName: string | null;
	action: string;
	target: string | null;
	outcome: string;
	prevHash: string | null;
	hash: string;
};

export type PackageAuditContext = {
	title: string;
	type: string;
	status: string;
	auditors: string[];
	findings: {
		severity: string;
		title: string;
		description: string | null;
		controlCode: string | null;
		requirementCode: string | null;
		status: string;
		ncCode: string | null;
		createdAt: Date;
	}[];
	requests: {
		title: string;
		status: string;
		controlCode: string | null;
		requirementCode: string | null;
		assigneeName: string | null;
		dueAt: string | null;
		answeredAt: Date | null;
		decidedAt: Date | null;
		evidenceCount: number;
	}[];
};

export type AuditPackageInput = {
	org: { id: string; name: string };
	generatedAt: Date;
	period: PackagePeriod | null;
	frameworks: readonly string[];
	frameworkNames: Record<string, string>;
	soaMarkdown: string | null;
	gap: { slug: string; header: readonly string[]; rows: unknown[][] }[];
	controls: readonly PackageControl[];
	risks: { header: readonly string[]; rows: unknown[][] };
	documents: readonly PackageDocument[];
	evidence: readonly PackageEvidence[];
	incidents: readonly PackageIncident[];
	auditLog: readonly PackageAuditEntry[];
	chain: { ok: boolean; checked: number; brokenAtSeq?: string } | null;
	audit: PackageAuditContext | null;
};

const iso = (d: Date | string | null | undefined) =>
	d ? (typeof d === "string" ? d : d.toISOString()) : "";

function slugify(s: string): string {
	return s
		.normalize("NFKD")
		.replaceAll(/[^\w.-]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
		.slice(0, 60);
}

export function inPeriod(
	d: Date | null | undefined,
	period: PackagePeriod | null,
): boolean {
	if (!period || !d) return true;
	const t = d.getTime();
	if (period.from && t < new Date(`${period.from}T00:00:00Z`).getTime())
		return false;
	if (period.to && t > new Date(`${period.to}T23:59:59.999Z`).getTime())
		return false;
	return true;
}

export function buildAuditPackage(input: AuditPackageInput): ZipEntry[] {
	const at = input.generatedAt;
	const entries: ZipEntry[] = [];
	const add = (name: string, data: string) =>
		entries.push({ name, data, mtime: at });

	if (input.soaMarkdown) add("01-soa-iso27001.md", input.soaMarkdown);

	for (const g of input.gap)
		add(`02-gap-${slugify(g.slug)}.csv`, toCsv(g.header, g.rows));

	add(
		"03-controls.csv",
		toCsv(
			[
				"code",
				"titel",
				"domaene",
				"status",
				"verantwortlich",
				"bearbeitet_von",
				"review",
				"nachweise",
				"letzter_test",
				"notiz",
			],
			input.controls.map((c) => [
				c.code,
				c.title,
				c.domain,
				c.status,
				c.ownerName ?? "",
				c.assigneeName ?? "",
				c.nextReviewAt ?? "",
				c.evidenceCount,
				c.lastTestResult ?? "",
				c.note ?? "",
			]),
		),
	);

	add("04-risiken.csv", toCsv(input.risks.header, input.risks.rows));

	// Dokumente: Index + freigegebene Versionen (Markdown-Körper), secret nur gezählt.
	let secretDocs = 0;
	const docIndex: unknown[][] = [];
	for (const d of input.documents) {
		if (d.classification === "secret") {
			secretDocs += 1;
			continue;
		}
		const published = d.versions.filter((v) =>
			inPeriod(v.publishedAt, input.period),
		);
		for (const v of published) {
			const file = v.bodyMarkdown
				? `05-dokumente/${slugify(d.docNumber)}-v${slugify(v.version)}.md`
				: "";
			docIndex.push([
				d.docNumber,
				d.title,
				d.type,
				d.status,
				d.classification,
				v.version,
				iso(v.publishedAt),
				iso(v.approvedAt),
				v.approvedByName ?? "",
				v.changeSummary,
				d.ownerName ?? "",
				d.nextReviewAt ?? "",
				file || (v.fileName ?? ""),
				v.fileSha256 ?? "",
			]);
			if (v.bodyMarkdown) {
				add(
					file,
					`<!-- ${d.docNumber} ${d.title} · Version ${v.version} · veröffentlicht ${iso(v.publishedAt)} · freigegeben von ${v.approvedByName ?? "—"} -->\n\n${v.bodyMarkdown}\n`,
				);
			}
		}
		if (published.length === 0) {
			docIndex.push([
				d.docNumber,
				d.title,
				d.type,
				d.status,
				d.classification,
				d.version,
				"",
				"",
				"",
				"(keine freigegebene Version im Zeitraum)",
				d.ownerName ?? "",
				d.nextReviewAt ?? "",
				"",
				"",
			]);
		}
	}
	add(
		"05-dokumente/index.csv",
		toCsv(
			[
				"nummer",
				"titel",
				"typ",
				"status",
				"klassifizierung",
				"version",
				"veroeffentlicht",
				"freigegeben_am",
				"freigegeben_von",
				"aenderung",
				"eigner",
				"review",
				"datei",
				"sha256",
			],
			docIndex,
		),
	);

	let secretEvidence = 0;
	add(
		"06-nachweise-index.csv",
		toCsv(
			[
				"id",
				"titel",
				"typ",
				"klassifizierung",
				"datei",
				"mime",
				"bytes",
				"sha256",
				"url",
				"gueltig_bis",
				"erstellt",
				"erstellt_von",
				"controls",
			],
			input.evidence.flatMap((e) => {
				if (e.classification === "secret") {
					secretEvidence += 1;
					return [];
				}
				return [
					[
						e.id,
						e.title,
						e.type,
						e.classification,
						e.fileName ?? "",
						e.mimeType ?? "",
						e.sizeBytes ?? "",
						e.sha256 ?? "",
						e.url ?? "",
						e.validUntil ?? "",
						iso(e.createdAt),
						e.createdByName ?? "",
						e.controlCodes.join(" "),
					],
				];
			}),
		),
	);

	const incidents = input.incidents.filter((i) =>
		inPeriod(i.awareAt, input.period),
	);
	add(
		"07-vorfaelle.csv",
		toCsv(
			[
				"code",
				"titel",
				"kenntnis",
				"regime",
				"klassifizierung",
				"status",
				"zahlungsbezug",
				"erstmeldung_faellig",
				"erstmeldung_abgegeben",
				"abschluss_abgegeben",
				"ursache",
				"verantwortlich",
			],
			incidents.map((i) => [
				i.code,
				i.title,
				iso(i.awareAt),
				i.regimes.join(" "),
				i.classification,
				i.status,
				i.affectsPayments ? "ja" : "nein",
				iso(i.initialDueAt),
				iso(i.initialReportedAt),
				iso(i.finalReportedAt),
				i.rootCause ?? "",
				i.ownerName ?? "",
			]),
		),
	);

	add(
		"08-audit-log.csv",
		toCsv(
			[
				"seq",
				"zeit",
				"akteur",
				"aktion",
				"ziel",
				"ergebnis",
				"prev_hash",
				"hash",
			],
			input.auditLog.map((a) => [
				a.seq,
				iso(a.at),
				a.actorName ?? "",
				a.action,
				a.target ?? "",
				a.outcome,
				a.prevHash ?? "",
				a.hash,
			]),
		),
	);

	if (input.audit) {
		add(
			"09-findings.csv",
			toCsv(
				[
					"schwere",
					"titel",
					"beschreibung",
					"control",
					"anforderung",
					"status",
					"abweichung",
					"erstellt",
				],
				input.audit.findings.map((f) => [
					f.severity,
					f.title,
					f.description ?? "",
					f.controlCode ?? "",
					f.requirementCode ?? "",
					f.status,
					f.ncCode ?? "",
					iso(f.createdAt),
				]),
			),
		);
		add(
			"10-nachweisanfragen.csv",
			toCsv(
				[
					"titel",
					"status",
					"control",
					"anforderung",
					"bearbeitet_von",
					"faellig",
					"beantwortet",
					"entschieden",
					"nachweise",
				],
				input.audit.requests.map((r) => [
					r.title,
					r.status,
					r.controlCode ?? "",
					r.requirementCode ?? "",
					r.assigneeName ?? "",
					r.dueAt ?? "",
					iso(r.answeredAt),
					iso(r.decidedAt),
					r.evidenceCount,
				]),
			),
		);
	}

	const implemented = input.controls.filter(
		(c) => c.status === "implemented",
	).length;
	const withoutEvidence = input.controls.filter(
		(c) => c.status === "implemented" && c.evidenceCount === 0,
	).length;
	const periodLabel = input.period
		? `${input.period.from ?? "…"} – ${input.period.to ?? "…"}`
		: "gesamter Bestand";
	const readme = [
		"# Prüfungspaket",
		"",
		`Organisation: ${input.org.name}`,
		`Erstellt: ${at.toISOString()}`,
		`Zeitraum: ${periodLabel}`,
		`Rahmenwerke: ${input.frameworks.map((s) => input.frameworkNames[s] ?? s).join(", ") || "—"}`,
		...(input.audit
			? [
					`Audit: ${input.audit.title} (${input.audit.type}, ${input.audit.status}) · Prüfer:innen: ${input.audit.auditors.join(", ") || "—"}`,
				]
			: []),
		"",
		"## Inhalt",
		"",
		...(input.soaMarkdown
			? [
					"- `01-soa-iso27001.md` — Erklärung zur Anwendbarkeit (ISO 27001 6.1.3 d)",
				]
			: []),
		...input.gap.map(
			(g) =>
				`- \`02-gap-${slugify(g.slug)}.csv\` — Anforderungen ${input.frameworkNames[g.slug] ?? g.slug} mit Status, Anwendbarkeit und Controls (${g.rows.length} Zeilen)`,
		),
		`- \`03-controls.csv\` — ${input.controls.length} Controls, davon ${implemented} umgesetzt (${withoutEvidence} ohne Nachweis)`,
		`- \`04-risiken.csv\` — Risikoregister (${input.risks.rows.length} Zeilen)`,
		`- \`05-dokumente/\` — Index und freigegebene Versionen (${docIndex.length} Zeilen${secretDocs ? `, ${secretDocs} als „geheim“ klassifizierte Dokumente nicht enthalten` : ""})`,
		`- \`06-nachweise-index.csv\` — Nachweise mit SHA-256 (${input.evidence.length - secretEvidence} Zeilen${secretEvidence ? `, ${secretEvidence} geheime nicht enthalten` : ""}); Dateien über /api/nachweise/<id> (auditiert)`,
		`- \`07-vorfaelle.csv\` — Vorfälle im Zeitraum (${incidents.length})`,
		`- \`08-audit-log.csv\` — Audit-Log-Auszug (${input.auditLog.length} Einträge, ohne Feldinhalte; Hash-Kette: ${
			input.chain
				? input.chain.ok
					? `geprüft, ${input.chain.checked} Einträge intakt`
					: `BRUCH bei seq ${input.chain.brokenAtSeq ?? "?"}`
				: "nicht geprüft"
		})`,
		...(input.audit
			? [
					`- \`09-findings.csv\` — Findings (${input.audit.findings.length})`,
					`- \`10-nachweisanfragen.csv\` — Nachweisanfragen/PBC (${input.audit.requests.length})`,
				]
			: []),
		"- `MANIFEST.json`, `SHA256SUMS` — Prüfsummen je Datei (`sha256sum -c SHA256SUMS`)",
		"",
		"## Hinweise",
		"",
		"- Abdeckung und SoA werden aus Control-Status, Anwendbarkeit und Kanten abgeleitet, nie separat gepflegt.",
		"- Das Audit-Log ist append-only mit SHA-256-Kette je Organisation; der Auszug enthält Referenzen, keine Feldwerte.",
		"- Nachweis-Dateien liegen verschlüsselt (Org-Schlüssel) im Objektspeicher; der Index trägt den SHA-256 des Klartexts.",
		"- Orientierung für Zertifizierung und Prüfung — kein Rechtsrat.",
		"",
	].join("\n");
	entries.unshift({ name: "README.md", data: readme, mtime: at });
	return entries;
}
