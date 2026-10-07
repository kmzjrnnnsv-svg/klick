import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { toCsv } from "@/lib/csv";
import { md } from "./respond";
import type { ZipEntry } from "./zip";

// DORA-Lieferantenpaket (Businessplan 14.5): was Banken und Finanzkunden von
// einem IKT-Dienstleister nach Art. 28–30 verlangen — Registerdatenblatt
// (B_05.01/B_02.02-Felder), Art.-30-Vertragsanhang, Ausstiegsplan, Notfall-
// plan, Zertifikate/Testate, Versicherungsnachweise, Subunternehmerliste,
// Vorfallmeldung. Reine Zusammenstellung; die Route lädt und hängt das
// Manifest an. Kein Rechtsrat.

export type SupplierOrg = {
	name: string;
	lei: string | null;
	country: string | null;
	legalForm: string | null;
	registerNumber: string | null;
	sector: string;
	licenceStage: string;
	caspServices: readonly string[];
	serviceDescription: string;
};

export type SupplierDocument = {
	templateCode: string | null;
	docNumber: string;
	title: string;
	status: string;
	version: string;
	classification: string;
	publishedAt: Date | null;
	bodyMarkdown: string | null;
	fileName: string | null;
	fileSha256: string | null;
};

export type SupplierEvidence = {
	id: string;
	title: string;
	type: string;
	classification: string;
	fileName: string | null;
	sha256: string | null;
	validUntil: string | null;
	createdAt: Date;
};

export type SupplierInsurance = {
	type: string;
	insurer: string;
	policyRef: string | null;
	coverageLimit: string | null;
	subLimits: Record<string, number> | null;
	exclusions: string | null;
	validFrom: string | null;
	validUntil: string | null;
	hasEvidence: boolean;
};

export type SupplierSubcontractor = {
	name: string;
	country: string | null;
	serviceType: string | null;
	serviceDescription: string | null;
	criticality: string;
	dataLocations: readonly string[];
	processesPersonalData: boolean;
	contractEnd: string | null;
};

export type SupplierFunction = {
	code: string;
	name: string;
	criticality: string;
	rtoHours: number | null;
	rpoHours: number | null;
};

export type SupplierIncidentStats = {
	last12Months: number;
	major: number;
	avgInitialReportHours: number | null;
};

export type SupplierPackInput = {
	org: SupplierOrg;
	generatedAt: Date;
	documents: readonly SupplierDocument[];
	evidence: readonly SupplierEvidence[];
	insurance: readonly SupplierInsurance[];
	subcontractors: readonly SupplierSubcontractor[];
	functions: readonly SupplierFunction[];
	incidents: SupplierIncidentStats;
	controlsImplemented: { total: number; implemented: number };
	insuranceTypeLabel: Record<string, string>;
};

const INSURANCE_LABEL_FALLBACK: Record<string, string> = {
	do: "D&O",
	cyber: "Cyber",
	crime: "Vertrauensschaden (Crime)",
	crypto_custody: "Krypto-Verwahrung",
	liability: "Haftpflicht",
};

const iso = (d: Date | string | null | undefined) =>
	d
		? typeof d === "string"
			? d.slice(0, 10)
			: d.toISOString().slice(0, 10)
		: "";

function latestPublished(
	docs: readonly SupplierDocument[],
	codes: readonly string[],
): SupplierDocument | null {
	const hits = docs
		.filter(
			(d) =>
				d.templateCode &&
				codes.includes(d.templateCode) &&
				(d.status === "published" || d.status === "approved"),
		)
		.sort(
			(a, b) =>
				(b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
		);
	return hits[0] ?? null;
}

function documentSection(
	title: string,
	doc: SupplierDocument | null,
	missingHint: string,
): string {
	const head = [`# ${title}`, ""];
	if (!doc) {
		return `${[...head, `_Noch kein freigegebenes Dokument hinterlegt. ${missingHint}_`, ""].join("\n")}`;
	}
	if (doc.classification === "secret")
		return `${[...head, `${doc.docNumber} ${doc.title} v${doc.version} ist als „geheim“ klassifiziert und wird nur auf Anfrage unter NDA bereitgestellt.`, ""].join("\n")}`;
	const meta = `${doc.docNumber} · ${doc.title} · Version ${doc.version} · freigegeben ${iso(doc.publishedAt) || "—"}`;
	if (doc.bodyMarkdown)
		return `${[...head, `_${meta}_`, "", doc.bodyMarkdown, ""].join("\n")}`;
	return `${[
		...head,
		`_${meta}_`,
		"",
		`Als Datei hinterlegt: ${doc.fileName ?? "—"}${doc.fileSha256 ? ` (SHA-256 ${doc.fileSha256})` : ""}. Bereitstellung über den Nachweis-Download der Plattform.`,
		"",
	].join("\n")}`;
}

export function buildSupplierPack(input: SupplierPackInput): ZipEntry[] {
	const at = input.generatedAt;
	const o = input.org;
	const entries: ZipEntry[] = [];
	const add = (name: string, data: string) =>
		entries.push({ name, data, mtime: at });

	const exitPlan = latestPublished(input.documents, ["VA-EXIT-PLAN"]);
	const bcp = latestPublished(input.documents, ["PL-NOTFALL", "RL-BCM"]);
	const incidentPolicy = latestPublished(input.documents, ["RL-VORFALL"]);
	const providerPolicy = latestPublished(input.documents, ["RL-DIENSTLEISTER"]);
	const ismsPolicy = latestPublished(input.documents, ["RL-ISMS-LEITLINIE"]);
	const testProgramme = latestPublished(input.documents, ["RL-TESTPROGRAMM"]);

	const dataLocations = [
		...new Set(input.subcontractors.flatMap((s) => s.dataLocations)),
	];
	const critical = input.functions.filter((f) => f.criticality !== "standard");

	// 01 Registerdatenblatt — Felder, die der Kunde für sein Informationsregister braucht.
	add(
		"01-registerdatenblatt.md",
		[
			"# Registerdatenblatt (Informationsregister des Kunden, ITS 2024/2956)",
			"",
			`Stand ${iso(at)} · Angaben zu ${o.name} als IKT-Drittdienstleister`,
			"",
			"| Feld (ITS) | Wert |",
			"|---|---|",
			`| B_05.01 c0050 Rechtlicher Name | ${md(o.name)} |`,
			`| B_05.01 c0010/c0020 Kennung | ${o.lei ? `${o.lei} (LEI)` : `LEI noch nicht hinterlegt — Handelsregister: ${o.registerNumber ?? "—"}`} |`,
			`| B_05.01 c0070 Art der Person | juristische Person${o.legalForm ? ` (${md(o.legalForm)})` : ""} |`,
			`| B_05.01 c0080 Land des Hauptsitzes | ${o.country ?? "DE"} |`,
			`| B_02.02 c0060 Art der IKT-Dienstleistung | S19 Cloud: SaaS |`,
			`| B_02.02 c0130 Land der Leistungserbringung | ${o.country ?? "DE"} |`,
			`| B_02.02 c0150/c0160 Datenstandort (Speicherung/Verarbeitung) | ${dataLocations.length > 0 ? dataLocations.join(", ") : (o.country ?? "DE")} |`,
			`| B_02.02 c0140 Datenspeicherung | Ja |`,
			`| B_02.02 c0170 Sensibilität | mittel/hoch (Compliance-Daten, personenbezogene Daten von Mitarbeitenden) |`,
			`| B_05.02 Unterauftragnehmer (Rang 2) | ${input.subcontractors.length} — siehe 07-subunternehmer.csv |`,
			`| B_07.01 c0080 Ausstiegsplan vorhanden | ${exitPlan ? "Ja" : "Nein (in Arbeit)"} |`,
			`| B_07.01 c0050 Substituierbarkeit | Export aller Daten (CSV/Markdown/ZIP) jederzeit; Migration ohne proprietäre Formate |`,
			"",
			"## Leistungsbeschreibung (Art. 30(2)(a))",
			"",
			md(o.serviceDescription),
			"",
			`Sektor: ${o.sector} · Lizenzstufe: ${o.licenceStage}${o.caspServices.length > 0 ? ` · Krypto-Dienste: ${o.caspServices.join(", ")}` : ""}`,
			"",
			`Umsetzungsstand Common Controls: ${input.controlsImplemented.implemented}/${input.controlsImplemented.total} umgesetzt.`,
			"",
		].join("\n"),
	);

	// 02 Art.-30-Vertragsanhang — Checkliste mit Zusage/Status aus den vorhandenen Dokumenten.
	const commitment = (code: string): string => {
		switch (code) {
			case "30(2)(a)":
				return "Leistungsbeschreibung in 01-registerdatenblatt.md; Unterauftrag nur mit den in 07-subunternehmer.csv genannten Anbietern, Änderungen mit Vorabmitteilung.";
			case "30(2)(b)":
				return `Leistungserbringung und Datenverarbeitung in ${dataLocations.length > 0 ? dataLocations.join(", ") : (o.country ?? "DE")}; Änderung nur nach vorheriger Mitteilung.`;
			case "30(2)(c)":
				return ismsPolicy
					? `Schutzziele gemäß ${ismsPolicy.docNumber} ${ismsPolicy.title}; Verschlüsselung je Mandant, Mandantentrennung in der Datenbank.`
					: "Verschlüsselung je Mandant, Mandantentrennung in der Datenbank; ISMS-Leitlinie in Freigabe.";
			case "30(2)(d)":
				return "Vollständiger Export (ZIP mit Manifest) jederzeit durch den Kunden; bei Vertragsende Export + Löschbestätigung (Crypto-Shredding des Mandantenschlüssels).";
			case "30(2)(e)":
				return "Verfügbarkeitsziel und Reaktionszeiten im SLA-Anhang des Vertrags; Monitoring über Health-/Ready-Endpunkte.";
			case "30(2)(f)":
				return incidentPolicy
					? `Unterstützung bei Vorfällen nach ${incidentPolicy.docNumber} ohne Zusatzkosten.`
					: "Unterstützung bei Vorfällen ohne Zusatzkosten; Vorfallrichtlinie in Freigabe.";
			case "30(2)(g)":
				return "Zusammenarbeit mit BaFin, Bundesbank und Abwicklungsbehörden; Auskünfte innerhalb der vom Kunden gesetzten Frist.";
			case "30(2)(h)":
				return "Ordentliche Kündigung mit Mindestfrist laut Vertrag; außerordentliche Kündigungsrechte nach Art. 28(7).";
			case "30(2)(i)":
				return "Teilnahme an Sensibilisierungsmaßnahmen des Kunden auf Anfrage.";
			case "30(3)(a)":
				return "Vollständige SLA mit quantitativen Zielen (Verfügbarkeit, RTO/RPO, Reaktionszeiten) im Vertragsanhang; jährliche Überprüfung.";
			case "30(3)(b)":
				return "Mitteilung wesentlicher Entwicklungen (Eigentümerwechsel, Standortwechsel, Subunternehmerwechsel, Sicherheitsvorfälle) unverzüglich.";
			case "30(3)(c)":
				return bcp
					? `Notfall- und Wiederanlaufplan ${bcp.docNumber} (03-/04-Dokumente); Tests nach Testprogramm${testProgramme ? ` ${testProgramme.docNumber}` : ""}.`
					: "Notfallplan in Arbeit; Backups täglich, Restore-Test als Pflicht-Lauf.";
			case "30(3)(d)":
				return "Mitwirkung an TLPT des Kunden nach Abstimmung von Umfang und Zeitfenster.";
			case "30(3)(e)":
				return "Zugangs-, Inspektions- und Auditrechte für Kunde, Prüfer und Behörden; Prüfungspaket mit Manifest auf Anfrage; Vor-Ort-Prüfung nach Terminabstimmung.";
			case "30(3)(f)":
				return exitPlan
					? `Ausstiegsstrategie ${exitPlan.docNumber} (03-ausstiegsplan.md); Übergangsfrist mindestens 6 Monate mit Weiterbetrieb.`
					: "Ausstiegsplan in Arbeit; Übergangsfrist mindestens 6 Monate mit Weiterbetrieb und vollständigem Export.";
			default:
				return "";
		}
	};
	add(
		"02-art30-vertragsanhang.md",
		[
			"# Vertragsanhang nach DORA Art. 30 — Zusagen des Dienstleisters",
			"",
			`${md(o.name)} · Stand ${iso(at)} · Abs. 2 für alle Verträge, Abs. 3 zusätzlich für kritische oder wichtige Funktionen des Kunden.`,
			"",
			"| Art. | Inhalt | Zusage / Umsetzung |",
			"|---|---|---|",
			...ART30_CLAUSES.map(
				(c) =>
					`| ${c.code}${c.criticalOnly ? " (kritisch)" : ""} | **${md(c.title)}** — ${md(c.text)} | ${md(commitment(c.code))} |`,
			),
			"",
			providerPolicy
				? `Eigene Steuerung von Unterauftragnehmern nach ${providerPolicy.docNumber} ${providerPolicy.title}.`
				: "Dienstleisterrichtlinie in Freigabe.",
			"",
			"_Paraphrasen des Gesetzestexts; der verbindliche Wortlaut steht im Vertrag._",
			"",
		].join("\n"),
	);

	add(
		"03-ausstiegsplan.md",
		documentSection(
			"Ausstiegsplan (DORA Art. 28(8), 30(3)(f))",
			exitPlan,
			"Vorlage VA-EXIT-PLAN unter /dokumente übernehmen und freigeben.",
		),
	);
	add(
		"04-notfallplan.md",
		documentSection(
			"Notfall- und Wiederanlaufplan (DORA Art. 11, 30(3)(c))",
			bcp,
			"Vorlagen PL-NOTFALL / RL-BCM unter /dokumente übernehmen und freigeben.",
		),
	);

	const attestations = input.evidence.filter(
		(e) => e.type === "attestation" && e.classification !== "secret",
	);
	add(
		"05-zertifikate-testate.md",
		[
			"# Zertifikate, Testate, Prüfberichte",
			"",
			attestations.length === 0
				? "_Noch keine Testate hinterlegt (Nachweis-Typ „Bescheinigung“)._"
				: "| Titel | Datei | SHA-256 | gültig bis | hinterlegt |\n|---|---|---|---|---|\n" +
					attestations
						.map(
							(e) =>
								`| ${md(e.title)} | ${md(e.fileName ?? "—")} | ${e.sha256 ?? "—"} | ${e.validUntil ?? "—"} | ${iso(e.createdAt)} |`,
						)
						.join("\n"),
			"",
			"Bereitstellung der Dateien über den auditierten Nachweis-Download der Plattform oder auf Anfrage.",
			"",
		].join("\n"),
	);

	const label = (t: string) =>
		input.insuranceTypeLabel[t] ?? INSURANCE_LABEL_FALLBACK[t] ?? t;
	add(
		"06-versicherungen.md",
		[
			"# Versicherungsnachweise",
			"",
			input.insurance.length === 0
				? "_Noch keine Policen erfasst (/organisation → Versicherungen)._"
				: "| Art | Versicherer | Police | Deckung | Sub-Limits | Ausschlüsse | gültig | Nachweis |\n|---|---|---|---|---|---|---|---|\n" +
					input.insurance
						.map(
							(p) =>
								`| ${md(label(p.type))} | ${md(p.insurer)} | ${md(p.policyRef ?? "—")} | ${p.coverageLimit ?? "—"} | ${md(
									p.subLimits
										? Object.entries(p.subLimits)
												.map(([k, v]) => `${k}: ${v}`)
												.join("; ")
										: "—",
								)} | ${md(p.exclusions ?? "—")} | ${p.validFrom ?? "…"} – ${p.validUntil ?? "…"} | ${p.hasEvidence ? "hinterlegt" : "—"} |`,
						)
						.join("\n"),
			"",
		].join("\n"),
	);

	add(
		"07-subunternehmer.csv",
		toCsv(
			[
				"name",
				"land",
				"leistung",
				"beschreibung",
				"kritikalitaet",
				"datenstandorte",
				"personenbezogene_daten",
				"vertragsende",
			],
			input.subcontractors.map((s) => [
				s.name,
				s.country ?? "",
				s.serviceType ?? "",
				s.serviceDescription ?? "",
				s.criticality,
				s.dataLocations.join(" "),
				s.processesPersonalData ? "ja" : "nein",
				s.contractEnd ?? "",
			]),
		),
	);

	add(
		"08-vorfallmeldung.md",
		[
			"# Vorfallmeldung an Kunden (DORA Art. 30(2)(f), 30(3)(b))",
			"",
			"- Meldung an die benannte Kontaktstelle des Kunden **spätestens 24 Stunden** nach Kenntnis eines Vorfalls mit Auswirkung auf dessen Daten oder Dienste; Erstmeldung mit Zeitpunkt, Umfang, betroffenen Diensten, Sofortmaßnahmen.",
			"- Zwischenberichte bei wesentlichen Änderungen, Abschlussbericht mit Ursache und Maßnahmen nach Behebung.",
			"- Der Kunde kann die Meldung in seine eigene DORA-Erstmeldung (≤ 4 h nach Einstufung, ≤ 24 h nach Kenntnis) übernehmen.",
			"",
			incidentPolicy
				? `Grundlage: ${incidentPolicy.docNumber} ${incidentPolicy.title} v${incidentPolicy.version}.`
				: "Vorfall- und Melderichtlinie in Freigabe (Vorlage RL-VORFALL).",
			"",
			"## Kennzahlen der letzten 12 Monate",
			"",
			`- Vorfälle: ${input.incidents.last12Months}, davon schwerwiegend: ${input.incidents.major}`,
			`- Durchschnittliche Zeit bis zur Erstmeldung: ${input.incidents.avgInitialReportHours === null ? "—" : `${input.incidents.avgInitialReportHours} h`}`,
			"",
			"## Kritische Funktionen des Dienstleisters",
			"",
			critical.length === 0
				? "_Keine Prozesse als kritisch/wichtig markiert._"
				: critical
						.map(
							(f) =>
								`- ${f.code} ${f.name} — RTO ${f.rtoHours ?? "—"} h, RPO ${f.rpoHours ?? "—"} h`,
						)
						.join("\n"),
			"",
		].join("\n"),
	);

	entries.unshift({
		name: "README.md",
		mtime: at,
		data: [
			"# DORA-Lieferantenpaket",
			"",
			`${o.name} als IKT-Drittdienstleister · Stand ${iso(at)}`,
			"",
			"Für Banken und Finanzunternehmen, die uns nach DORA Art. 28–30 steuern: alle Unterlagen für Due Diligence, Vertragsanhang und Informationsregister in einem Paket.",
			"",
			"- `01-registerdatenblatt.md` — Felder für B_02.02 / B_05.01 / B_07.01 des Kundenregisters",
			"- `02-art30-vertragsanhang.md` — Zusagen zu Art. 30 Abs. 2 und 3",
			"- `03-ausstiegsplan.md`, `04-notfallplan.md` — freigegebene Versionen",
			"- `05-zertifikate-testate.md`, `06-versicherungen.md` — Nachweise mit Hashes",
			"- `07-subunternehmer.csv` — Lieferkette (Rang 2)",
			"- `08-vorfallmeldung.md` — Meldezusage ≤ 24 h, Kennzahlen",
			"- `MANIFEST.json`, `SHA256SUMS` — Prüfsummen",
			"",
			"_Kein Rechtsrat; verbindlich ist der Vertrag._",
			"",
		].join("\n"),
	});
	return entries;
}
