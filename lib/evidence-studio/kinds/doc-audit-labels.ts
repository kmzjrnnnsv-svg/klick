// Bezeichnungen für erzeugte Nachweise rund um Dokumente, Audits und Tests
// (pure). Dokumente sind deutsch und neutral formuliert; next-intl steht in
// Buildern nicht zur Verfügung.

export const DOC_TYPE: Record<string, string> = {
	policy: "Richtlinie",
	procedure: "Verfahrensanweisung",
	concept: "Konzept",
	plan: "Plan",
	manual: "Handbuch",
	template: "Vorlage",
	record: "Aufzeichnung",
	report: "Bericht",
	contract: "Vertrag",
	form: "Formular",
};

export const DOC_STATUS: Record<string, string> = {
	draft: "Entwurf",
	in_review: "in Prüfung",
	approved: "freigegeben",
	published: "veröffentlicht",
	retired: "außer Kraft",
	superseded: "ersetzt",
};

export const CLASSIFICATION: Record<string, string> = {
	public: "öffentlich",
	internal: "intern",
	confidential: "vertraulich",
	secret: "streng geheim",
};

export const ROLE: Record<string, string> = {
	all: "alle Mitglieder",
	owner: "Inhaber:innen",
	editor: "Bearbeiter:innen",
	viewer: "Lesende",
	auditor: "Prüfer:innen",
	consultant: "Berater:innen",
};

export const DOMAIN: Record<string, string> = {
	governance: "Governance",
	risk: "Risiko",
	asset: "Assets & Informationen",
	access: "Identität & Zugang",
	crypto: "Kryptografie",
	physical: "Physisch",
	operations: "Betrieb",
	network: "Netz",
	development: "Entwicklung",
	supplier: "Dienstleister",
	incident: "Vorfälle",
	continuity: "Kontinuität",
	compliance: "Compliance",
	hr: "Personal",
	aml: "AML",
	conduct: "Wohlverhalten",
	payments: "Zahlungen",
	custody: "Verwahrung",
	fraud: "Betrug",
};

export const AUDIT_TYPE: Record<string, string> = {
	internal: "internes Audit",
	external: "externes Audit",
	certification: "Zertifizierungsaudit",
	regulator: "Prüfung durch die Aufsicht",
};

export const AUDIT_STATUS: Record<string, string> = {
	planned: "geplant",
	in_progress: "laufend",
	reported: "berichtet",
	closed: "abgeschlossen",
};

export const SEVERITY: Record<string, string> = {
	observation: "Beobachtung",
	minor: "leicht",
	major: "schwer",
	critical: "kritisch",
};

export const SEVERITY_ORDER = ["critical", "major", "minor", "observation"];

export const FINDING_STATUS: Record<string, string> = {
	open: "offen",
	accepted: "akzeptiert",
	in_remediation: "in Behebung",
	closed: "abgeschlossen",
};

export const SCOPE_TYPE: Record<string, string> = {
	domain: "Domäne",
	process: "Prozess",
	control: "Control",
	provider: "Dienstleister",
	framework: "Rahmenwerk",
};

export const RISK_RATING: Record<string, string> = {
	low: "niedrig",
	medium: "mittel",
	high: "hoch",
};

export const TEST_METHOD: Record<string, string> = {
	interview: "Interview",
	inspection: "Einsichtnahme",
	reperformance: "Nachvollzug",
	automated: "automatisiert",
	vuln_scan: "Schwachstellenscan",
	pentest: "Penetrationstest",
	bcm_exercise: "BCM-Übung",
	tlpt: "TLPT",
	access_review: "Rezertifizierung",
};

export const TEST_RESULT: Record<string, string> = {
	pass: "wirksam",
	partial: "teilweise wirksam",
	fail: "nicht wirksam",
};

export const EFFECTIVENESS: Record<string, string> = {
	effective: "wirksam",
	partially: "teilweise wirksam",
	ineffective: "nicht wirksam",
};

export const NC_STATUS: Record<string, string> = {
	open: "offen",
	in_progress: "in Bearbeitung",
	verified: "geprüft",
	closed: "abgeschlossen",
};

export const label = (map: Record<string, string>, key: string | null) =>
	key ? (map[key] ?? key) : "—";

// Anteil in Prozent, gerundet; ohne Nenner „—“
export const pct = (part: number, whole: number) =>
	whole === 0 ? "—" : `${Math.round((part / whole) * 100)} %`;
