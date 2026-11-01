// Texte zu den Befunden von validateRiskMethod, ohne zod (Browser).
import type { RiskMethodIssue } from "@/lib/compliance/risk-method";

export const RISK_METHOD_ISSUE_TEXT: Record<RiskMethodIssue, string> = {
	no_classes: "Mindestens zwei Risikoklassen anlegen.",
	class_gap: "Die Klassen müssen lückenlos aneinander anschließen.",
	class_order: "Bei einer Klasse ist „von“ größer als „bis“.",
	class_range:
		"Die Klassen müssen den ganzen Wertebereich abdecken (erste ab dem kleinsten, letzte bis zum größten Wert).",
	zone_order:
		"Die Zonen müssen aufsteigen: zuerst akzeptabel, dann tolerierbar, dann nicht tolerierbar.",
	duplicate_key: "Schlüssel doppelt vergeben.",
	empty_label: "Jede Stufe, Schadensart und Klasse braucht eine Bezeichnung.",
	no_dimension: "Mindestens eine Schadensart muss aktiv sein.",
	level_count:
		"Eintrittswahrscheinlichkeit, Schadenshöhe und jede Schadensart brauchen gleich viele Stufen (vier oder fünf).",
	matrix_invalid: "Jedes Feld der Matrix braucht eine Risikoklasse.",
};
