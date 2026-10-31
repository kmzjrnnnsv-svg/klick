// Audits und Nacharbeiten je Rahmenwerk (pure, statisch): welcher Rhythmus
// gilt (Zertifizierung, Überwachung, Rezertifizierung, interne Revision,
// Prüfung durch die Aufsicht) und welche Fristen für Haupt- und
// Nebenabweichungen gelten. Jede Organisation kann beides je Rahmenwerk
// selbst festlegen (org_settings.auditRegimes); ohne Angabe gelten die
// Werte hier, und ohne Regime für das Rahmenwerk DEFAULT_FOLLOW_UP.
// Fristen nach gängiger Praxis — je Zertifizierungsstelle bzw. Prüfer:in
// abstimmen (prüfen).

export const AUDIT_CYCLE_KINDS = [
	"certification",
	"surveillance",
	"recertification",
	"internal",
	"regulator",
	"attestation",
] as const;
export type AuditCycleKind = (typeof AUDIT_CYCLE_KINDS)[number];

export const FOLLOW_UP_CLASS_KEYS = ["major", "minor", "observation"] as const;
export type FollowUpClass = (typeof FOLLOW_UP_CLASS_KEYS)[number];

export type FollowUpRule = {
	// Tage bis zum Maßnahmenplan (Ursache, Korrektur, Korrekturmaßnahme)
	planDays: number | null;
	// Tage bis zur umgesetzten, nachgewiesenen Korrekturmaßnahme
	closeDays: number | null;
	// Umsetzung spätestens zum nächsten Audit (Nebenabweichungen bei ISO)
	untilNextAudit?: boolean;
};

export type AuditCycle = {
	kind: AuditCycleKind;
	label: string;
	// Abstand in Monaten; certification ohne Wiederholung = 0
	everyMonths: number;
};

export type AuditRegime = {
	framework: string;
	label: string;
	cycles: readonly AuditCycle[];
	classes: Record<FollowUpClass, { label: string; rule: FollowUpRule }>;
	source: string;
};

// Gilt, wenn weder das Rahmenwerk noch die Organisation etwas festlegt
export const DEFAULT_FOLLOW_UP: Record<FollowUpClass, FollowUpRule> = {
	major: { planDays: 30, closeDays: 90 },
	minor: { planDays: 90, closeDays: 365, untilNextAudit: true },
	observation: { planDays: null, closeDays: null },
};

const CLASSES = (
	labels: [string, string, string] = [
		"Hauptabweichung",
		"Nebenabweichung",
		"Hinweis",
	],
	rules: Partial<Record<FollowUpClass, FollowUpRule>> = {},
): AuditRegime["classes"] => ({
	major: { label: labels[0], rule: rules.major ?? DEFAULT_FOLLOW_UP.major },
	minor: { label: labels[1], rule: rules.minor ?? DEFAULT_FOLLOW_UP.minor },
	observation: {
		label: labels[2],
		rule: rules.observation ?? DEFAULT_FOLLOW_UP.observation,
	},
});

const INTERNAL_YEARLY: AuditCycle = {
	kind: "internal",
	label: "Internes Audit",
	everyMonths: 12,
};

const MARISK_CLASSES = CLASSES(
	["Schwerwiegender Mangel", "Wesentlicher Mangel", "Hinweis"],
	{
		major: { planDays: 14, closeDays: 90 },
		minor: { planDays: 30, closeDays: 180 },
	},
);

export const AUDIT_REGIMES: readonly AuditRegime[] = [
	{
		framework: "iso27001",
		label: "Zertifizierung nach ISO/IEC 27001",
		cycles: [
			{
				kind: "certification",
				label: "Zertifizierungsaudit (Stufe 1 + 2)",
				everyMonths: 0,
			},
			{ kind: "surveillance", label: "Überwachungsaudit", everyMonths: 12 },
			{
				kind: "recertification",
				label: "Rezertifizierungsaudit",
				everyMonths: 36,
			},
			INTERNAL_YEARLY,
		],
		classes: CLASSES(undefined, {
			major: { planDays: 30, closeDays: 90 },
			minor: { planDays: 90, closeDays: 365, untilNextAudit: true },
		}),
		source:
			"ISO/IEC 17021-1, ISO/IEC 27006-1; Fristen je Zertifizierungsstelle (prüfen)",
	},
	{
		framework: "soc2",
		label: "SOC 2 Typ II",
		cycles: [
			{
				kind: "attestation",
				label: "Prüfungszeitraum und Bericht",
				everyMonths: 12,
			},
			INTERNAL_YEARLY,
		],
		classes: CLASSES(["Kontrollmangel", "Ausnahme", "Hinweis"], {
			major: { planDays: 30, closeDays: 90 },
			minor: { planDays: 60, closeDays: 180 },
		}),
		source:
			"AICPA SSAE 18 / TSC; Fristen mit der Prüfungsgesellschaft (prüfen)",
	},
	{
		framework: "dora",
		label: "Interne Revision des IKT-Risikomanagements (Art. 6 Abs. 6–7)",
		cycles: [
			{
				kind: "internal",
				label: "Prüfung durch die Interne Revision",
				everyMonths: 12,
			},
		],
		classes: CLASSES(["Kritische Feststellung", "Feststellung", "Hinweis"], {
			major: { planDays: 30, closeDays: 90 },
			minor: { planDays: 60, closeDays: 180 },
		}),
		source:
			"DORA Art. 6 Abs. 6–7 (Follow-up kritischer Feststellungen); Fristen prüfen",
	},
	{
		framework: "nis2",
		label: "Nachweise nach § 39 BSIG",
		cycles: [
			{
				kind: "regulator",
				label: "Nachweis gegenüber dem BSI",
				everyMonths: 36,
			},
			INTERNAL_YEARLY,
		],
		classes: CLASSES(["Sicherheitsmangel", "Abweichung", "Hinweis"]),
		source:
			"§ 39 BSIG (Betreiber kritischer Anlagen, alle drei Jahre); Mängelfristen setzt das BSI (prüfen)",
	},
	{
		framework: "zag-marisk",
		label: "Interne Revision nach MaRisk BT 2",
		cycles: [
			{
				kind: "internal",
				label: "Prüfung durch die Interne Revision",
				everyMonths: 12,
			},
			{ kind: "regulator", label: "Jahresabschlussprüfung", everyMonths: 12 },
		],
		classes: MARISK_CLASSES,
		source:
			"MaRisk BT 2.3, BT 2.5 (alle Tätigkeiten in höchstens drei Jahren, Mängelbeseitigung überwachen); Fristen prüfen",
	},
	{
		framework: "kwg",
		label: "Interne Revision nach MaRisk BT 2",
		cycles: [
			{
				kind: "internal",
				label: "Prüfung durch die Interne Revision",
				everyMonths: 12,
			},
			{ kind: "regulator", label: "Jahresabschlussprüfung", everyMonths: 12 },
		],
		classes: MARISK_CLASSES,
		source: "MaRisk BT 2; Fristen prüfen",
	},
	{
		framework: "gwg",
		label: "Prüfung der Geldwäsche-Prävention",
		cycles: [
			{
				kind: "internal",
				label: "Prüfung durch die Interne Revision",
				everyMonths: 12,
			},
			{
				kind: "regulator",
				label: "Prüfung nach § 27 ZAG bzw. Jahresabschluss",
				everyMonths: 12,
			},
		],
		classes: CLASSES(["Wesentliche Feststellung", "Feststellung", "Hinweis"]),
		source: "GwG § 6 Abs. 1 Nr. 7 (Innenrevision); Fristen prüfen",
	},
	{
		framework: "ccss",
		label: "CCSS-Audit",
		cycles: [{ kind: "certification", label: "CCSS-Audit", everyMonths: 12 }],
		classes: CLASSES(),
		source: "CCSS v9 (jährliche Prüfung, prüfen)",
	},
	{
		framework: "bsi-200-2",
		label: "ISO 27001 auf der Basis von IT-Grundschutz",
		cycles: [
			{
				kind: "certification",
				label: "Zertifizierungsaudit (Auditor:in mit BSI-Lizenz)",
				everyMonths: 0,
			},
			{ kind: "surveillance", label: "Überwachungsaudit", everyMonths: 12 },
			{
				kind: "recertification",
				label: "Re-Zertifizierungsaudit",
				everyMonths: 36,
			},
			INTERNAL_YEARLY,
		],
		classes: CLASSES(
			["Schwerwiegende Abweichung", "Geringfügige Abweichung", "Empfehlung"],
			{
				major: { planDays: 30, closeDays: 90 },
				minor: { planDays: 90, closeDays: 365, untilNextAudit: true },
			},
		),
		source:
			"Zertifizierungsschema des BSI für ISO 27001 auf der Basis von IT-Grundschutz; Fristen mit der Zertifizierungsstelle (prüfen)",
	},
	{
		framework: "pci-dss",
		label: "PCI-DSS-Bewertung (Prüfbericht oder SAQ)",
		cycles: [
			{
				kind: "attestation",
				label: "Jährliche Bewertung mit Bestätigung (AOC)",
				everyMonths: 12,
			},
			INTERNAL_YEARLY,
		],
		classes: CLASSES(["Nicht erfüllt", "Teilweise erfüllt", "Hinweis"], {
			major: { planDays: 14, closeDays: 90 },
			minor: { planDays: 30, closeDays: 180 },
		}),
		source:
			"PCI DSS v4.0.1; Frist und Nachweisweg legen Acquirer bzw. Kartenorganisationen fest (prüfen)",
	},
];

export const AUDIT_REGIME_BY_FRAMEWORK: ReadonlyMap<string, AuditRegime> =
	new Map(AUDIT_REGIMES.map((r) => [r.framework, r]));

// Regime für ein Rahmenwerk ohne eigenes: jährliches internes Audit und die
// Standardfristen
export function defaultRegime(framework: string): AuditRegime {
	return {
		framework,
		label: "Internes Audit",
		cycles: [INTERNAL_YEARLY],
		classes: CLASSES(),
		source: "Standard in Klick (anpassbar)",
	};
}

export const regimeFor = (framework: string): AuditRegime =>
	AUDIT_REGIME_BY_FRAMEWORK.get(framework) ?? defaultRegime(framework);
