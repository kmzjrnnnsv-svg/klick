import type { RoleFunction } from "@/db/schema/enums";
import type { KlickPlace } from "./control-additions";

// ISMS-Jahresplan (P1, Nov 2026): Vorlage nach der Struktur eines
// Praxis-ISMS (VDMA-Gruppe, 04.11.2026) mit Turnus, Prüfaufwand,
// Durchlaufzeit, Aufbewahrung und Aufwand je Jahr in Personentagen (PT).
// Die Werte sind Richtwerte aus dieser Vorlage und je Organisation
// anzupassen. Aufwand je Jahr („year“) und ISB-Anteil („isb“) stehen wie
// in der Vorlage, auch dort, wo die Vorlage gerundet hat; „basis“ zeigt,
// wie sich der Wert aus Durchgängen ergibt (Test `isms-programme`).

export const ISMS_SECTIONS = [
	"policy",
	"framework",
	"guidelines",
	"procedures",
	"records",
	"operations",
] as const;
export type IsmsSection = (typeof ISMS_SECTIONS)[number];

// Turnus der Überprüfung; „continuous“ = laufende Aufgabe ohne festen Termin
export type IsmsCadence =
	| "triennial"
	| "yearly"
	| "quarterly"
	| "continuous"
	| "event";

// Anlässe, zu denen außerdem überprüft wird
export type IsmsEvent =
	| "org_change"
	| "incident"
	| "risk_analysis"
	| "personnel_change"
	| "norm_change";

// Tätigkeit eines Durchgangs
export type IsmsWork =
	| "review"
	| "planning"
	| "delivery"
	| "collection"
	| "evaluation"
	| "preparation"
	| "follow_up"
	| "check"
	| "analysis"
	| "exercise";

// [min, max] in Personentagen bzw. Wochen
export type Range = readonly [number, number];

export type IsmsBasis = {
	work: IsmsWork;
	// PT je Durchgang
	pt: Range;
	// Durchgänge je Jahr (quartalsweise = 4)
	perYear: number;
	// gleiche Einheiten je Durchgang (z. B. 8 Risikoanalysen)
	units?: number;
};

// Woher Klick den Stand eines Punkts ableitet (lib/isms-plan/status.ts);
// ohne Quelle trägst du den Stand selbst nach
export type IsmsSource =
	| "documents"
	| "appointment"
	| "risks"
	| "bia"
	| "bcm_plans"
	| "exercises"
	| "internal_audit"
	| "external_audit"
	| "management_review"
	| "kpis"
	| "nonconformities"
	| "suppliers"
	| "trainings"
	| "incidents"
	| "changes";

export type IsmsRetention =
	| { kind: "validity_plus"; years: number }
	| { kind: "years"; years: number }
	| { kind: "appointment_plus"; years: number }
	| { kind: "employment_plus"; years: number };

export type IsmsItem = {
	key: string;
	section: IsmsSection;
	// Unterpunkt von (z. B. BIA unter BCM)
	parent?: string;
	title: string;
	// Normbezüge als Anforderungsschlüssel „rahmenwerk:code“
	clauses: readonly string[];
	cadence: IsmsCadence;
	events?: readonly IsmsEvent[];
	// vor der Managementbewertung fertig
	beforeReview?: boolean;
	// Prüfaufwand je Überprüfung in PT (wie in der Vorlage „Review“)
	review?: Range;
	// Durchlaufzeit für Aktualisierung, Abstimmung, Freigabe in Wochen
	leadWeeks?: Range;
	basis?: readonly IsmsBasis[];
	// Aufwand je Jahr in PT (Spalte „Gesamt“ der Vorlage)
	year: Range;
	// ISB-Anteil je Jahr: A = Fachbereiche arbeiten zu, B = ISB schreibt und pflegt
	isb: { a: Range; b: Range };
	retention?: IsmsRetention;
	// zuständige Funktion
	owner: RoleFunction;
	source?: IsmsSource;
	// ein kurzer Satz zur Arbeit oder Abstimmung
	note?: string;
	annexes?: readonly string[];
	// Vorlagen unter Dokumente (Code), Nachweisarten (NW-*)
	templates?: readonly string[];
	evidence?: readonly string[];
	// wo du es in Klick erledigst
	where: readonly KlickPlace[];
};

const KEEP_DOC: IsmsRetention = { kind: "validity_plus", years: 3 };
const KEEP_RECORD: IsmsRetention = { kind: "years", years: 3 };

export const ISMS_PROGRAMME: readonly IsmsItem[] = [
	// ── 1. Leitlinie ─────────────────────────────────────────────────────
	{
		key: "policy",
		section: "policy",
		source: "documents",
		title: "Informationssicherheitsleitlinie",
		clauses: ["iso27001:5.2", "iso27001:A.5.1"],
		cadence: "triennial",
		events: ["org_change", "norm_change"],
		review: [1, 2],
		leadWeeks: [4, 6],
		year: [0.5, 1],
		isb: { a: [0.5, 1], b: [0.5, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		note: "Die Geschäftsleitung gibt die Leitlinie frei.",
		templates: ["RL-ISMS-LEITLINIE"],
		evidence: ["NW-LEITLINIE"],
		where: [
			{ href: "/dokumente?vorlage=RL-ISMS-LEITLINIE", label: "Dokumente" },
		],
	},
	// ── 2. Rahmendokumente (Kapitel 4–6) ─────────────────────────────────
	{
		key: "context",
		section: "framework",
		title: "Kontext und interessierte Parteien",
		clauses: ["iso27001:4.1", "iso27001:4.2"],
		cadence: "yearly",
		review: [1, 2],
		leadWeeks: [1, 2],
		year: [1, 2],
		isb: { a: [1, 1.5], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		evidence: ["NW-KONTEXT", "NW-PARTEIEN"],
		where: [
			{ href: "/organisation?tab=kontext", label: "Organisation > Kontext" },
		],
	},
	{
		key: "scope",
		section: "framework",
		source: "documents",
		title: "Geltungsbereich",
		clauses: ["iso27001:4.3"],
		cadence: "yearly",
		review: [0.5, 1],
		leadWeeks: [1, 2],
		year: [0.5, 1],
		isb: { a: [0.5, 1], b: [0.5, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["KZ-SCOPE"],
		evidence: ["NW-SCOPE"],
		where: [
			{
				href: "/organisation?tab=geltungsbereich",
				label: "Organisation > Geltungsbereich",
			},
		],
	},
	{
		key: "roles",
		section: "framework",
		source: "documents",
		title: "Rollen und Verantwortlichkeiten (RACI)",
		clauses: ["iso27001:5.3", "iso27001:A.5.2"],
		cadence: "yearly",
		events: ["org_change"],
		review: [1, 2],
		leadWeeks: [2, 4],
		year: [1, 2],
		isb: { a: [0.5, 1], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["BE-ROLLEN"],
		evidence: ["NW-ROLLEN", "NW-RACI", "NW-ORGANIGRAMM"],
		where: [
			{ href: "/organisation?tab=rollen", label: "Organisation > Rollen" },
		],
	},
	{
		key: "isb_appointment",
		section: "framework",
		source: "appointment",
		parent: "roles",
		title: "Bestellung der oder des ISB",
		clauses: ["iso27001:5.3"],
		cadence: "event",
		events: ["personnel_change"],
		year: [0, 0],
		isb: { a: [0, 0], b: [0, 0] },
		retention: { kind: "appointment_plus", years: 3 },
		owner: "management_body",
		note: "Neu nur bei einem Wechsel der Person.",
		evidence: ["NW-BESTELLUNG"],
		where: [
			{ href: "/organisation?tab=rollen", label: "Organisation > Rollen" },
		],
	},
	{
		key: "isb_concept",
		section: "framework",
		parent: "roles",
		title: "Konzept für die Rolle der oder des ISB",
		clauses: ["iso27001:5.3"],
		cadence: "yearly",
		review: [1, 1],
		leadWeeks: [2, 4],
		year: [1, 1],
		isb: { a: [1, 1], b: [1, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		where: [{ href: "/dokumente", label: "Dokumente" }],
	},
	{
		key: "risk_policy",
		section: "framework",
		source: "documents",
		title: "Richtlinie Risikomanagement",
		clauses: ["iso27001:6.1.2"],
		cadence: "yearly",
		review: [1, 2],
		leadWeeks: [1, 2],
		year: [1, 2],
		isb: { a: [1, 2], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["KZ-RISIKOMETHODIK"],
		evidence: ["NW-RISIKOMETHODIK"],
		where: [
			{
				href: "/einstellungen?tab=risk",
				label: "Einstellungen > Risikomethodik",
			},
		],
	},
	{
		key: "soa",
		section: "framework",
		source: "documents",
		title: "Erklärung zur Anwendbarkeit (SoA)",
		clauses: ["iso27001:6.1.3"],
		cadence: "yearly",
		events: ["risk_analysis"],
		review: [2, 3],
		leadWeeks: [1, 2],
		year: [2, 3],
		isb: { a: [1.5, 2], b: [2, 3] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["BE-SOA"],
		evidence: ["NW-SOA"],
		where: [
			{ href: "/rahmenwerke/iso27001?tab=soa", label: "ISO 27001 > SoA" },
		],
	},
	{
		key: "objectives",
		section: "framework",
		source: "documents",
		title: "Ziele und Kennzahlen der Informationssicherheit",
		clauses: ["iso27001:6.2"],
		cadence: "yearly",
		beforeReview: true,
		review: [1, 2],
		leadWeeks: [1, 2],
		year: [1, 2],
		isb: { a: [1, 1.5], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["KZ-ZIELE"],
		evidence: ["NW-ZIELE"],
		where: [{ href: "/organisation?tab=ziele", label: "Organisation > Ziele" }],
	},
	// ── 3. Richtlinien ───────────────────────────────────────────────────
	{
		key: "doc_control",
		section: "guidelines",
		source: "documents",
		title: "Richtlinie Lenkung dokumentierter Information",
		clauses: ["iso27001:7.5"],
		cadence: "yearly",
		review: [1, 1],
		leadWeeks: [1, 2],
		year: [1, 1],
		isb: { a: [1, 1], b: [1, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["VA-DOKUMENTENLENKUNG"],
		evidence: ["NW-DOKUMENTENLENKUNG"],
		where: [
			{ href: "/dokumente?vorlage=VA-DOKUMENTENLENKUNG", label: "Dokumente" },
		],
	},
	{
		key: "performance",
		section: "guidelines",
		title: "Richtlinie Leistungsbewertung des ISMS",
		clauses: ["iso27001:9.1"],
		cadence: "yearly",
		review: [1, 1],
		leadWeeks: [1, 2],
		year: [1, 1],
		isb: { a: [1, 1], b: [1, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		evidence: ["NW-MESSUNG"],
		where: [{ href: "/dokumente", label: "Dokumente" }],
	},
	{
		key: "it_policy",
		section: "guidelines",
		source: "documents",
		title: "IT-Richtlinie",
		clauses: ["iso27001:A.5.15", "iso27001:A.8.1", "iso27001:A.8.8"],
		cadence: "yearly",
		review: [2, 3],
		leadWeeks: [2, 4],
		year: [2, 3],
		isb: { a: [0.5, 1], b: [2, 3] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		note: "Die IT schreibt mit, der oder die ISB prüft.",
		templates: ["RL-ZUGANG", "RL-ENDGERAETE", "RL-NETZ", "RL-PATCH"],
		where: [{ href: "/dokumente", label: "Dokumente" }],
	},
	{
		key: "classification",
		section: "guidelines",
		source: "documents",
		title: "Richtlinie Klassifizierung von Informationen",
		clauses: ["iso27001:A.5.12", "iso27001:A.5.13"],
		cadence: "yearly",
		review: [1, 2],
		leadWeeks: [2, 4],
		year: [1, 2],
		isb: { a: [0.5, 1], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["RL-ASSETS"],
		where: [{ href: "/dokumente", label: "Dokumente" }],
	},
	{
		key: "personnel",
		section: "guidelines",
		source: "documents",
		title: "Richtlinie Personalsicherheit",
		clauses: ["iso27001:A.6.1", "iso27001:A.6.2", "iso27001:A.6.5"],
		cadence: "yearly",
		review: [1, 2],
		leadWeeks: [2, 4],
		year: [1, 2],
		isb: { a: [0.5, 0.5], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		note: "Gemeinsam mit der Personalabteilung.",
		templates: ["RL-PERSONAL"],
		where: [{ href: "/dokumente?vorlage=RL-PERSONAL", label: "Dokumente" }],
	},
	{
		key: "incident_policy",
		section: "guidelines",
		source: "documents",
		title: "Richtlinie Vorfallmanagement",
		clauses: ["iso27001:A.5.24", "iso27001:A.5.26", "iso27001:A.5.28"],
		cadence: "yearly",
		events: ["incident"],
		review: [1, 2],
		leadWeeks: [1, 2],
		year: [1, 2],
		isb: { a: [1, 1.5], b: [1, 2] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		annexes: ["Mindestangaben der internen Meldung", "Beweissicherung"],
		templates: ["RL-VORFALL"],
		where: [{ href: "/dokumente?vorlage=RL-VORFALL", label: "Dokumente" }],
	},
	{
		key: "physical",
		section: "guidelines",
		source: "documents",
		title: "Richtlinie Physische Sicherheit",
		clauses: ["iso27001:A.7.1", "iso27001:A.7.2", "iso27001:A.7.4"],
		cadence: "yearly",
		review: [3, 5],
		leadWeeks: [4, 8],
		year: [3, 5],
		isb: { a: [1, 2], b: [3, 5] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		note: "Mit Begehungen der Standorte.",
		annexes: ["Nachweise je Standort"],
		templates: ["RL-PHYSISCH"],
		where: [
			{ href: "/dokumente?vorlage=RL-PHYSISCH", label: "Dokumente" },
			{
				href: "/organisation?tab=standorte",
				label: "Organisation > Standorte",
			},
		],
	},
	{
		key: "retention_policy",
		section: "guidelines",
		source: "documents",
		title: "Lösch- und Aufbewahrungsrichtlinie",
		clauses: ["iso27001:A.5.33", "iso27001:A.8.10"],
		cadence: "yearly",
		review: [2, 3],
		leadWeeks: [2, 4],
		year: [2, 3],
		isb: { a: [0.5, 1], b: [2, 3] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		note: "Gemeinsam mit der oder dem Datenschutzbeauftragten.",
		annexes: ["Löschfristenkatalog"],
		templates: ["KZ-LOESCHUNG"],
		where: [{ href: "/dokumente?vorlage=KZ-LOESCHUNG", label: "Dokumente" }],
	},
	// ── 4. Operative Vorgaben und Verfahren ──────────────────────────────
	{
		key: "bcm",
		section: "procedures",
		source: "documents",
		title: "Verfahren Notfallmanagement (BCM)",
		clauses: ["iso27001:A.5.29", "iso27001:A.5.30"],
		cadence: "yearly",
		review: [2, 3],
		leadWeeks: [2, 4],
		year: [2, 3],
		isb: { a: [1, 1.5], b: [2, 3] },
		retention: KEEP_DOC,
		owner: "bcm_manager",
		templates: ["RL-BCM"],
		where: [{ href: "/dokumente?vorlage=RL-BCM", label: "Dokumente" }],
	},
	{
		key: "bia",
		section: "procedures",
		source: "bia",
		parent: "bcm",
		title: "Business-Impact-Analyse",
		clauses: ["iso27001:A.5.30"],
		cadence: "yearly",
		basis: [{ work: "analysis", pt: [5, 10], perYear: 1 }],
		year: [5, 10],
		isb: { a: [2, 4], b: [5, 10] },
		retention: KEEP_RECORD,
		owner: "bcm_manager",
		where: [{ href: "/prozesse", label: "Prozesse > BIA" }],
	},
	{
		key: "bcm_contacts",
		section: "procedures",
		parent: "bcm",
		title: "Kontaktliste der Notfallorganisation",
		clauses: ["iso27001:A.5.29"],
		cadence: "quarterly",
		basis: [{ work: "check", pt: [0.5, 0.5], perYear: 4 }],
		year: [2, 2],
		isb: { a: [0.5, 0.5], b: [2, 2] },
		retention: KEEP_RECORD,
		owner: "bcm_manager",
		where: [{ href: "/organisation/krisenkontakte", label: "Krisenkontakte" }],
	},
	{
		key: "bcm_plans",
		section: "procedures",
		source: "bcm_plans",
		parent: "bcm",
		title: "Wiederanlaufpläne",
		clauses: ["iso27001:A.5.29", "iso27001:A.5.30"],
		cadence: "yearly",
		year: [0, 0],
		isb: { a: [0, 0], b: [0, 0] },
		retention: KEEP_DOC,
		owner: "bcm_manager",
		note: "Aufwand steckt im Verfahren und in den Übungen.",
		templates: ["PL-NOTFALL"],
		where: [{ href: "/prozesse", label: "Prozesse > Notfallplan" }],
	},
	{
		key: "bcm_exercise",
		section: "procedures",
		source: "exercises",
		parent: "bcm",
		title: "Notfalltests und Übungen",
		clauses: ["iso27001:A.5.30"],
		cadence: "yearly",
		basis: [{ work: "exercise", pt: [3, 5], perYear: 1 }],
		year: [3, 5],
		isb: { a: [2, 3], b: [3, 5] },
		retention: KEEP_RECORD,
		owner: "bcm_manager",
		note: "Mit Vor- und Nachbereitung.",
		evidence: ["NW-TESTPROGRAMM"],
		where: [{ href: "/testprogramm", label: "Testprogramm" }],
	},
	{
		key: "change",
		section: "procedures",
		source: "documents",
		title: "Verfahren Change Management",
		clauses: ["iso27001:A.8.32"],
		cadence: "yearly",
		review: [1, 1],
		leadWeeks: [1, 2],
		year: [1, 1],
		isb: { a: [0.5, 0.5], b: [1, 1] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["RL-CHANGE"],
		where: [{ href: "/dokumente?vorlage=RL-CHANGE", label: "Dokumente" }],
	},
	{
		key: "training_plan",
		section: "procedures",
		source: "documents",
		title: "Schulungsplan und Awareness",
		clauses: ["iso27001:7.3", "iso27001:A.6.3"],
		cadence: "yearly",
		basis: [{ work: "planning", pt: [2, 3], perYear: 1 }],
		year: [2, 3],
		isb: { a: [2, 3], b: [2, 3] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["PL-SCHULUNG"],
		where: [{ href: "/schulungen", label: "Schulungen" }],
	},
	{
		key: "training_delivery",
		section: "procedures",
		source: "trainings",
		parent: "training_plan",
		title: "Schulungen durchführen und nachverfolgen",
		clauses: ["iso27001:7.3", "iso27001:A.6.3"],
		cadence: "continuous",
		basis: [{ work: "delivery", pt: [10, 15], perYear: 1 }],
		year: [10, 15],
		isb: { a: [5, 8], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Inhalte, Ausrollen über die Lernplattform, Teilnahme nachhalten.",
		where: [
			{
				href: "/schulungen?tab=durchgefuehrt",
				label: "Schulungen > Durchgeführt",
			},
		],
	},
	{
		key: "communication",
		section: "procedures",
		source: "documents",
		title: "Kommunikationsmatrix",
		clauses: ["iso27001:7.4"],
		cadence: "yearly",
		review: [0.5, 0.5],
		leadWeeks: [1, 1],
		year: [0.5, 0.5],
		isb: { a: [0.5, 0.5], b: [0.5, 0.5] },
		retention: KEEP_DOC,
		owner: "isb_ciso",
		templates: ["KZ-KOMMUNIKATION"],
		evidence: ["NW-KOMMUNIKATION"],
		where: [
			{
				href: "/organisation?tab=kommunikation",
				label: "Organisation > Kommunikation",
			},
		],
	},
	// ── 5. Nachweise und Aufzeichnungen ──────────────────────────────────
	{
		key: "risk_analyses",
		section: "records",
		source: "risks",
		title: "Risikoanalysen und Behandlungsplan",
		clauses: ["iso27001:8.2", "iso27001:8.3"],
		cadence: "yearly",
		events: ["incident", "org_change"],
		basis: [{ work: "analysis", pt: [3, 5], perYear: 1, units: 8 }],
		year: [24, 40],
		isb: { a: [12, 20], b: [24, 40] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		templates: ["PL-RISIKOBEHANDLUNG"],
		evidence: ["NW-RISIKOBEURTEILUNG", "NW-BEHANDLUNGSPLAN"],
		where: [{ href: "/risiken", label: "Risiken" }],
	},
	{
		key: "measures",
		section: "records",
		source: "nonconformities",
		title: "Maßnahmen und Korrekturmaßnahmen",
		clauses: ["iso27001:8.3", "iso27001:10.2"],
		cadence: "continuous",
		year: [0, 0],
		isb: { a: [0, 0], b: [0, 0] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Umsetzung läuft über mehrere Monate je Maßnahme.",
		evidence: ["NW-ABWEICHUNGEN"],
		where: [{ href: "/abweichungen", label: "Abweichungen" }],
	},
	{
		key: "measures_risk",
		section: "records",
		parent: "measures",
		title: "Maßnahmen aus den Risikoanalysen",
		clauses: ["iso27001:8.3"],
		cadence: "continuous",
		year: [8, 16],
		isb: { a: [4, 8], b: [8, 16] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/risiken?tab=massnahmen", label: "Risiken > Maßnahmen" }],
	},
	{
		key: "measures_internal_audit",
		section: "records",
		parent: "measures",
		title: "Maßnahmen aus dem internen Audit",
		clauses: ["iso27001:10.2"],
		cadence: "continuous",
		year: [5, 10],
		isb: { a: [3, 5], b: [5, 10] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/abweichungen", label: "Abweichungen" }],
	},
	{
		key: "measures_external_audit",
		section: "records",
		parent: "measures",
		title: "Maßnahmen aus dem externen Audit",
		clauses: ["iso27001:10.2"],
		cadence: "continuous",
		year: [5, 10],
		isb: { a: [3, 5], b: [5, 10] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/abweichungen", label: "Abweichungen" }],
	},
	{
		key: "measures_review",
		section: "records",
		parent: "measures",
		title: "Maßnahmen aus der Managementbewertung",
		clauses: ["iso27001:9.3"],
		cadence: "continuous",
		year: [3, 5],
		isb: { a: [2, 3], b: [3, 5] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/managementbewertung", label: "Managementbewertung" }],
	},
	{
		key: "measures_status",
		section: "records",
		parent: "measures",
		title: "Stand der Maßnahmen prüfen",
		clauses: ["iso27001:10.2"],
		cadence: "quarterly",
		basis: [{ work: "check", pt: [2, 3], perYear: 4 }],
		year: [8, 12],
		isb: { a: [6, 8], b: [8, 12] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/heute/aufgaben", label: "Aufgaben" }],
	},
	{
		key: "measures_effectiveness",
		section: "records",
		parent: "measures",
		title: "Wirksamkeit der Maßnahmen prüfen",
		clauses: ["iso27001:10.2"],
		cadence: "continuous",
		year: [10, 15],
		isb: { a: [5, 8], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Je Maßnahme etwa 0,5 bis 1 PT.",
		evidence: ["NW-WIRKSAMKEIT"],
		where: [{ href: "/abweichungen", label: "Abweichungen" }],
	},
	{
		key: "kpis",
		section: "records",
		source: "kpis",
		title: "Kennzahlen erheben und auswerten",
		clauses: ["iso27001:9.1"],
		cadence: "quarterly",
		beforeReview: true,
		basis: [
			{ work: "collection", pt: [5, 5], perYear: 4 },
			{ work: "evaluation", pt: [2, 3], perYear: 1 },
		],
		year: [22, 23],
		isb: { a: [8, 10], b: [22, 23] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		evidence: ["NW-MESSUNG"],
		where: [{ href: "/organisation?tab=ziele", label: "Organisation > Ziele" }],
	},
	{
		key: "internal_audit",
		section: "records",
		source: "internal_audit",
		title: "Internes Audit",
		clauses: ["iso27001:9.2"],
		cadence: "yearly",
		basis: [{ work: "analysis", pt: [20, 20], perYear: 1 }],
		year: [20, 20],
		isb: { a: [9, 16], b: [11, 18] },
		retention: KEEP_RECORD,
		owner: "internal_audit",
		note: "Planung, Audit und Bericht; der oder die ISB bereitet vor und begleitet jeden Audittag.",
		templates: ["VA-AUDITPROGRAMM"],
		evidence: ["NW-AUDITPROGRAMM", "NW-AUDITBERICHT"],
		where: [{ href: "/audits", label: "Audits" }],
	},
	{
		key: "management_review",
		section: "records",
		source: "management_review",
		title: "Managementbewertung",
		clauses: ["iso27001:9.3"],
		cadence: "yearly",
		basis: [
			{ work: "preparation", pt: [5, 5], perYear: 1 },
			{ work: "follow_up", pt: [1, 2], perYear: 1 },
		],
		year: [6, 7],
		isb: { a: [5, 6], b: [6, 7] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		templates: ["BE-MANAGEMENTBEWERTUNG"],
		evidence: ["NW-MANAGEMENTBEWERTUNG"],
		where: [{ href: "/managementbewertung", label: "Managementbewertung" }],
	},
	{
		key: "competence",
		section: "records",
		title: "Kompetenznachweise",
		clauses: ["iso27001:7.2"],
		cadence: "yearly",
		basis: [{ work: "check", pt: [2, 2], perYear: 1 }],
		year: [2, 2],
		isb: { a: [1, 1], b: [2, 2] },
		retention: { kind: "employment_plus", years: 3 },
		owner: "isb_ciso",
		evidence: ["NW-KOMPETENZ"],
		where: [
			{ href: "/schulungen?tab=matrix", label: "Schulungen > Kompetenzmatrix" },
		],
	},
	// ── 6. Laufende Aufgaben ─────────────────────────────────────────────
	{
		key: "suppliers",
		section: "operations",
		source: "suppliers",
		title: "Lieferanten und Dienstleister",
		clauses: [
			"iso27001:A.5.19",
			"iso27001:A.5.20",
			"iso27001:A.5.21",
			"iso27001:A.5.22",
		],
		cadence: "continuous",
		year: [10, 15],
		isb: { a: [5, 8], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "outsourcing_officer",
		note: "Bewertung, Vertragsanforderungen, AV-Vertrag mit dem Datenschutz.",
		templates: ["RL-DIENSTLEISTER"],
		where: [{ href: "/dienstleister", label: "Dienstleister" }],
	},
	{
		key: "projects",
		section: "operations",
		title: "Beratung in Projekten",
		clauses: ["iso27001:A.5.8"],
		cadence: "continuous",
		year: [10, 15],
		isb: { a: [10, 15], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Sicherheit von Anfang an, neue Anwendungen und Cloud-Dienste.",
		where: [{ href: "/assets", label: "Assets" }],
	},
	{
		key: "change_advice",
		section: "operations",
		source: "changes",
		title: "Beratung bei Änderungen",
		clauses: ["iso27001:A.8.32"],
		cadence: "continuous",
		year: [5, 10],
		isb: { a: [5, 10], b: [5, 10] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Jede Änderung auf Folgen für die Sicherheit prüfen.",
		where: [{ href: "/aenderungen", label: "Änderungen" }],
	},
	{
		key: "incidents",
		section: "operations",
		source: "incidents",
		title: "Sicherheitsvorfälle und Meldungen",
		clauses: [
			"iso27001:A.5.24",
			"iso27001:A.5.25",
			"iso27001:A.5.26",
			"iso27001:A.5.27",
			"iso27001:A.5.28",
		],
		cadence: "continuous",
		year: [10, 15],
		isb: { a: [6, 10], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "incident_manager",
		note: "Bewerten, steuern, melden (24 h, 72 h, ein Monat), daraus lernen.",
		where: [{ href: "/vorfaelle", label: "Vorfälle" }],
	},
	{
		key: "external_audit",
		section: "operations",
		source: "external_audit",
		title: "Externes Audit und Zertifizierung",
		clauses: ["iso27001:9.2", "iso27001:10.2"],
		cadence: "yearly",
		year: [10, 15],
		isb: { a: [8, 12], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Nachweise liefern, begleiten, Abweichungen nacharbeiten.",
		where: [{ href: "/audits", label: "Audits" }],
	},
	{
		key: "audit_prep",
		section: "operations",
		title: "Audits vorbereiten und abstimmen",
		clauses: ["iso27001:9.2", "iso27001:5.1"],
		cadence: "continuous",
		year: [10, 15],
		isb: { a: [8, 12], b: [10, 15] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Mit den Fachbereichen, Termine mit IT und Datenschutz, Berichte an die Leitung.",
		where: [{ href: "/berichte", label: "Berichte an die GL" }],
	},
	{
		key: "external_requests",
		section: "operations",
		title: "Fragebögen von Kunden und Partnern",
		clauses: ["iso27001:4.2"],
		cadence: "continuous",
		year: [5, 10],
		isb: { a: [3, 6], b: [5, 10] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		where: [{ href: "/trust-center", label: "Trust Center" }],
	},
	{
		key: "isb_training",
		section: "operations",
		title: "Weiterbildung der oder des ISB",
		clauses: ["iso27001:7.2"],
		cadence: "continuous",
		year: [5, 8],
		isb: { a: [5, 8], b: [5, 8] },
		retention: KEEP_RECORD,
		owner: "isb_ciso",
		note: "Wissen erhalten, Änderungen an Normen und Gesetzen verfolgen.",
		where: [{ href: "/schulungen", label: "Schulungen" }],
	},
];

export const ISMS_ITEM_BY_KEY: ReadonlyMap<string, IsmsItem> = new Map(
	ISMS_PROGRAMME.map((i) => [i.key, i]),
);

// Arbeitstage je Jahr für den Stellenanteil
export const ISMS_WORKDAYS = 200;

// Szenario B: zusätzlich Interviews und Rückfragen (Anteil am ISB-Aufwand)
export const ISMS_SCENARIO_B_EXTRA: Range = [0.1, 0.15];

// Szenario B: Aufwand der Eigner:innen für Freigaben je Jahr in PT
export const ISMS_SCENARIO_B_OWNERS: Range = [5, 10];
