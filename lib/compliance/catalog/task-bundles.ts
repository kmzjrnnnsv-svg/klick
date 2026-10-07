import type { EntityKind } from "@/db/schema/enums";
import type { TaskBundleItem } from "@/db/schema/grc";

// Aufgabenpakete / Checklisten („Paket anwenden" erzeugt n Aufgaben).
export type TaskBundleTemplate = {
	code: string;
	name: string;
	description: string;
	triggerEntityType?: EntityKind;
	items: TaskBundleItem[];
};

export const TASK_BUNDLES: TaskBundleTemplate[] = [
	{
		code: "ONBOARDING",
		name: "Eintritt (Onboarding)",
		description:
			"ISO A.6.1/A.6.2, GwG § 6: Zuverlässigkeit, Vertraulichkeit, Zugänge, Schulung.",
		items: [
			{
				title: "Identität und Referenzen prüfen",
				assigneeRule: "function:compliance",
				offsetDays: 0,
			},
			{
				title: "Vertraulichkeitsvereinbarung unterzeichnen lassen",
				assigneeRule: "function:compliance",
				offsetDays: 1,
			},
			{
				title: "Konten nach Rollenmodell anlegen (Least Privilege)",
				assigneeRule: "function:isb_ciso",
				offsetDays: 1,
			},
			{
				title: "MFA/Passkey einrichten lassen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 1,
			},
			{
				title: "Sicherheits-Grundschulung durchführen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 14,
			},
			{
				title: "Kenntnisnahme der Richtlinien einholen",
				assigneeRule: "function:compliance",
				offsetDays: 14,
			},
		],
	},
	{
		code: "OFFBOARDING",
		name: "Austritt (Offboarding)",
		description:
			"ISO A.5.11/A.6.5: Zugriffsentzug, Rückgabe, Pflichten nach Austritt.",
		items: [
			{
				title: "Alle Konten sperren und Sitzungen widerrufen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Geräte, Token, Schlüssel zurücknehmen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Geteilte Zugangsdaten rotieren",
				assigneeRule: "function:isb_ciso",
				offsetDays: 1,
			},
			{
				title: "Verantwortlichkeiten (Owner/RACI) übertragen",
				assigneeRule: "function:compliance",
				offsetDays: 2,
			},
			{
				title: "Pflichten nach Austritt schriftlich bestätigen",
				assigneeRule: "function:compliance",
				offsetDays: 2,
			},
			{
				title: "Zugriffsrezertifizierung für betroffene Systeme",
				assigneeRule: "function:isb_ciso",
				offsetDays: 7,
			},
			{
				title: "Postfach/Weiterleitung regeln, Daten archivieren",
				assigneeRule: "function:isb_ciso",
				offsetDays: 7,
			},
		],
	},
	{
		code: "INCIDENT_DORA",
		name: "Vorfall-Erstreaktion (DORA)",
		description: "Erste 24 Stunden eines schwerwiegenden IKT-Vorfalls.",
		triggerEntityType: "incident",
		items: [
			{
				title: "Einstufung nach RTS 2024/1772 dokumentieren",
				assigneeRule: "function:incident_manager",
				offsetDays: 0,
			},
			{
				title: "Eindämmung einleiten, Beweise sichern",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Erstmeldung an BaFin (MVP) absenden",
				assigneeRule: "function:incident_manager",
				offsetDays: 0,
			},
			{
				title: "Kunden informieren, falls betroffen",
				assigneeRule: "function:management_body",
				offsetDays: 1,
			},
			{
				title: "Zwischenbericht vorbereiten",
				assigneeRule: "function:incident_manager",
				offsetDays: 2,
			},
			{
				title: "Post-Incident-Review ansetzen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 7,
			},
		],
	},
	{
		code: "INCIDENT_DSGVO",
		name: "Datenschutzverletzung (DSGVO Art. 33/34)",
		description: "72-Stunden-Pfad.",
		triggerEntityType: "incident",
		items: [
			{
				title: "Risiko für Betroffene bewerten",
				assigneeRule: "function:dpo",
				offsetDays: 0,
			},
			{
				title: "Meldung an die Aufsichtsbehörde (≤ 72 h)",
				assigneeRule: "function:dpo",
				offsetDays: 2,
			},
			{
				title: "Betroffene informieren (bei hohem Risiko)",
				assigneeRule: "function:dpo",
				offsetDays: 3,
			},
			{
				title: "Dokumentation im Verzeichnis der Verletzungen",
				assigneeRule: "function:dpo",
				offsetDays: 5,
			},
		],
	},
	{
		code: "AUDIT_PREP",
		name: "Audit-Vorbereitung",
		description: "Vier Wochen vor einem internen oder externen Audit.",
		triggerEntityType: "audit",
		items: [
			{
				title: "Scope und Prüfplan mit Prüfer:in abstimmen",
				assigneeRule: "function:compliance",
				offsetDays: 0,
			},
			{
				title: "SoA und Risikoregister aktualisieren",
				assigneeRule: "function:isb_ciso",
				offsetDays: 7,
			},
			{
				title: "Offene Abweichungen schliessen oder begründen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 14,
			},
			{
				title: "Nachweise je Control prüfen und nachladen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 14,
			},
			{
				title: "Prüfer-Zugang anlegen (zeitlich begrenzt)",
				assigneeRule: "role:owner",
				offsetDays: 21,
			},
			{
				title: "Prüfungspaket exportieren",
				assigneeRule: "function:compliance",
				offsetDays: 25,
			},
		],
	},
	{
		code: "KEY_CEREMONY",
		name: "Schlüsselzeremonie",
		description:
			"Erzeugung oder Rotation kritischer Schlüssel (MiCAR Art. 75, ISO A.8.24).",
		items: [
			{
				title: "Teilnehmende, Rollen und Vier-Augen festlegen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Protokollvorlage und Zeugen bereitstellen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Zeremonie durchführen und protokollieren",
				assigneeRule: "function:isb_ciso",
				offsetDays: 1,
			},
			{
				title: "Backup-Shares getrennt verwahren, Verwahrorte dokumentieren",
				assigneeRule: "function:isb_ciso",
				offsetDays: 1,
			},
			{
				title: "Schlüsselinventar aktualisieren, Nachweis ablegen",
				assigneeRule: "function:isb_ciso",
				offsetDays: 2,
			},
		],
	},
	{
		code: "PROVIDER_ONBOARDING",
		name: "Dienstleister aufnehmen",
		description: "DORA Art. 28–30: Due Diligence, Vertrag, Register, Exit.",
		triggerEntityType: "provider",
		items: [
			{
				title: "Due Diligence (Zertifikate, Finanzen, Standorte, Konflikte)",
				assigneeRule: "function:outsourcing_officer",
				offsetDays: 0,
			},
			{
				title: "Kritikalität und Auslagerungscharakter bewerten",
				assigneeRule: "function:outsourcing_officer",
				offsetDays: 3,
			},
			{
				title: "Vertragsklauseln nach Art. 30 prüfen",
				assigneeRule: "function:compliance",
				offsetDays: 7,
			},
			{
				title: "Exit-Strategie dokumentieren",
				assigneeRule: "function:outsourcing_officer",
				offsetDays: 10,
			},
			{
				title: "Register und ggf. Anzeige an die Aufsicht",
				assigneeRule: "function:outsourcing_officer",
				offsetDays: 14,
			},
		],
	},
	{
		code: "MGMT_REVIEW_PREP",
		name: "Managementbewertung vorbereiten",
		description: "ISO 9.3: alle Pflicht-Inputs zusammenstellen.",
		triggerEntityType: "management_review",
		items: [
			{
				title: "Status der Massnahmen aus der letzten Bewertung",
				assigneeRule: "function:isb_ciso",
				offsetDays: 0,
			},
			{
				title: "Kontextänderungen und Rechtsänderungen zusammenstellen",
				assigneeRule: "function:compliance",
				offsetDays: 3,
			},
			{
				title: "KPI-Report, Audit- und Vorfallergebnisse",
				assigneeRule: "function:isb_ciso",
				offsetDays: 5,
			},
			{
				title: "Risikoregister und Appetit prüfen",
				assigneeRule: "function:risk_control",
				offsetDays: 5,
			},
			{
				title: "Verbesserungsvorschläge sammeln, Agenda versenden",
				assigneeRule: "function:isb_ciso",
				offsetDays: 7,
			},
		],
	},
];
