import type { CatalogControl } from "./types";

// Reihenfolge beim Umsetzen (Teil C, Umsetzungsplan nach der Gap-Analyse):
// welche Maßnahme sinnvoll erst nach einer anderen beginnt. Nur für wenige
// Schlüssel-Controls gepflegt: erst Geltungsbereich, Rollen und Leitlinie,
// dann Inventar, Risiko und die Richtlinien je Bereich, danach die Technik.
// Dazu eine Regel je Bereich: die Richtlinie (Art „documentation“) vor den
// technischen Maßnahmen desselben Bereichs (`predecessorsOf`). Test
// `control-order`: alle Verweise gibt es, keine Kreise.

export const CONTROL_AFTER: Readonly<Record<string, readonly string[]>> = {
	// Grundlage: Geltungsbereich vor Leitlinie, Rollen und Risikomethode
	"CC-GOV-01": ["CC-GOV-04"],
	"CC-GOV-02": ["CC-GOV-04"],
	"CC-GOV-05": ["CC-GOV-01"],
	"CC-GOV-06": ["CC-GOV-01"],
	"CC-HR-03": ["CC-GOV-01"],
	"CC-RSK-01": ["CC-GOV-04"],
	"CC-RSK-02": ["CC-RSK-01", "CC-AST-01"],
	"CC-RSK-03": ["CC-RSK-02"],
	"CC-TST-01": ["CC-RSK-02"],
	// Inventar vor allem, was darauf aufbaut
	"CC-AST-02": ["CC-AST-01"],
	"CC-AST-04": ["CC-AST-01"],
	"CC-OPS-03": ["CC-AST-01"],
	"CC-OPS-04": ["CC-AST-01"],
	// Notfall: erst Auswirkungen, dann Pläne, Sicherung und Übungen
	"CC-BCM-02": ["CC-AST-01"],
	"CC-BCM-01": ["CC-BCM-02"],
	"CC-BCM-03": ["CC-BCM-02"],
	"CC-BCM-05": ["CC-BCM-01"],
	// Zugänge: Konzept vor Lebenszyklus, Anmeldung und Rechten
	"CC-IAM-02": ["CC-IAM-01"],
	"CC-IAM-05": ["CC-IAM-02"],
	// Vorfälle: Prozess vor Einstufung, Meldung und Lernen
	"CC-INC-02": ["CC-INC-01"],
	"CC-INC-03": ["CC-INC-01"],
	"CC-INC-04": ["CC-INC-01"],
	"CC-INC-05": ["CC-INC-01"],
	// Dienstleister: Register und Richtlinie vor Prüfung, Verträgen, Ausstieg
	"CC-TPR-03": ["CC-TPR-01", "CC-TPR-02"],
	"CC-TPR-04": ["CC-TPR-02"],
	"CC-TPR-05": ["CC-TPR-01"],
	"CC-TPR-06": ["CC-TPR-01"],
	// Protokolle: Konzept vor Logging, Logging vor Überwachung
	"CC-LOG-02": ["CC-LOG-01"],
	// Entwicklung: Lebenszyklus vor Anforderungen und Tests
	"CC-DEV-02": ["CC-DEV-01"],
	"CC-DEV-04": ["CC-DEV-01"],
	"CC-NET-02": ["CC-NET-01"],
};

export type CatalogOrderControl = Pick<
	CatalogControl,
	"code" | "domain" | "kind"
>;
type OrderControl = CatalogOrderControl;

// Vorgänger einer Maßnahme innerhalb des Plans: gepflegte Reihenfolge und
// die Richtlinie des Bereichs vor technischen Maßnahmen. Nur, was im Plan
// steht, zählt.
export function predecessorsOf(
	control: OrderControl,
	inPlan: ReadonlyMap<string, OrderControl>,
): string[] {
	const out = new Set<string>();
	for (const p of CONTROL_AFTER[control.code] ?? [])
		if (p !== control.code && inPlan.has(p)) out.add(p);
	if (control.kind === "technical")
		for (const other of inPlan.values())
			if (
				other.code !== control.code &&
				other.kind === "documentation" &&
				other.domain === control.domain
			)
				out.add(other.code);
	return [...out].sort();
}
