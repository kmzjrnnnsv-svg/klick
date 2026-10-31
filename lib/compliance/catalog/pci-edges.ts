import { PCI_CODES } from "./pci-dss";
import type { CatalogControlMapping } from "./types";

// Kanten PCI DSS → Common Controls: erste passende Regel gewinnt (exakter
// Code oder Präfix mit Punkt). Das erste Control deckt voll, weitere
// teilweise; Richtlinien und Rollen (N.1.1/N.1.2) immer teilweise.

const RULES: readonly [pattern: string, controls: string[]][] = [
	// Richtlinien und Rollen je Abschnitt
	["*.1.1", ["CC-GOV-01"]],
	["*.1.2", ["CC-GOV-02"]],
	// 1 Netz
	["1.2.2", ["CC-DEV-06", "CC-NET-01"]],
	["1.2.3", ["CC-PCI-01", "CC-NET-01"]],
	["1.2.4", ["CC-PCI-01", "CC-AST-04"]],
	["1.2.7", ["CC-NET-02"]],
	["1.2.", ["CC-NET-01", "CC-NET-02"]],
	["1.3.", ["CC-NET-02", "CC-PCI-01"]],
	["1.4.", ["CC-NET-02"]],
	["1.5.", ["CC-OPS-01"]],
	// 2 Konfiguration
	["2.2.2", ["CC-OPS-04", "CC-IAM-04"]],
	["2.2.7", ["CC-CRY-05", "CC-IAM-04"]],
	["2.2.", ["CC-OPS-04"]],
	["2.3.", ["CC-NET-03"]],
	// 3 Gespeicherte Kontodaten
	["3.2.", ["CC-PCI-02", "CC-AST-10"]],
	["3.3.", ["CC-PCI-02"]],
	["3.4.", ["CC-PCI-03"]],
	["3.5.", ["CC-PCI-03", "CC-CRY-01"]],
	["3.6.1.1", ["CC-CRY-04", "CC-PCI-04"]],
	["3.6.", ["CC-PCI-04", "CC-CRY-03"]],
	["3.7.", ["CC-PCI-04", "CC-CRY-03"]],
	// 4 Übertragung
	["4.2.1.1", ["CC-CRY-04", "CC-CRY-05"]],
	["4.2.2", ["CC-AST-07", "CC-CRY-05"]],
	["4.2.", ["CC-CRY-05"]],
	// 5 Schadsoftware
	["5.2.3.1", ["CC-PCI-07", "CC-OPS-02"]],
	["5.3.2.1", ["CC-PCI-07", "CC-OPS-02"]],
	["5.4.", ["CC-OPS-02", "CC-HR-03"]],
	["5.", ["CC-OPS-02"]],
	// 6 Entwicklung
	["6.2.2", ["CC-HR-03", "CC-DEV-01"]],
	["6.2.3", ["CC-DEV-03"]],
	["6.2.3.1", ["CC-DEV-03"]],
	["6.2.4", ["CC-DEV-03", "CC-DEV-02"]],
	["6.2.", ["CC-DEV-01"]],
	["6.3.2", ["CC-DEV-05", "CC-AST-01"]],
	["6.3.", ["CC-OPS-03"]],
	["6.4.3", ["CC-PCI-05"]],
	["6.4.", ["CC-NET-02", "CC-DEV-04"]],
	["6.5.3", ["CC-DEV-07"]],
	["6.5.4", ["CC-GOV-11", "CC-DEV-07"]],
	["6.5.5", ["CC-AST-08"]],
	["6.5.6", ["CC-DEV-07"]],
	["6.5.", ["CC-DEV-06"]],
	// 7 Zugriff
	["7.2.4", ["CC-IAM-05"]],
	["7.2.5", ["CC-IAM-04"]],
	["7.2.5.1", ["CC-IAM-05", "CC-PCI-07"]],
	["7.", ["CC-IAM-01"]],
	// 8 Authentisierung
	["8.2.8", ["CC-IAM-08"]],
	["8.2.7", ["CC-IAM-02", "CC-TPR-05"]],
	["8.2.", ["CC-IAM-02"]],
	["8.6.", ["CC-IAM-04"]],
	["8.", ["CC-IAM-03"]],
	// 9 Physisch
	["9.4.1.1", ["CC-BCM-03", "CC-PHY-04"]],
	["9.4.6", ["CC-PHY-05"]],
	["9.4.7", ["CC-PHY-05"]],
	["9.4.", ["CC-PHY-04"]],
	["9.5.1.2.1", ["CC-PCI-08", "CC-PCI-07"]],
	["9.5.1.3", ["CC-PCI-08", "CC-HR-03"]],
	["9.5.", ["CC-PCI-08"]],
	["9.", ["CC-PHY-01"]],
	// 10 Protokollierung
	["10.4.2.1", ["CC-LOG-02", "CC-PCI-07"]],
	["10.4.", ["CC-LOG-02"]],
	["10.5.", ["CC-LOG-03"]],
	["10.6.", ["CC-OPS-09"]],
	["10.7.", ["CC-LOG-02", "CC-INC-01"]],
	["10.", ["CC-LOG-01"]],
	// 11 Tests
	["11.2.", ["CC-NET-03"]],
	["11.3.2", ["CC-PCI-06"]],
	["11.3.2.1", ["CC-PCI-06"]],
	["11.3.1.1", ["CC-OPS-03", "CC-PCI-07"]],
	["11.3.", ["CC-OPS-03"]],
	["11.4.5", ["CC-PCI-01", "CC-DEV-04"]],
	["11.4.6", ["CC-PCI-01", "CC-DEV-04"]],
	["11.4.", ["CC-DEV-04", "CC-TST-01"]],
	["11.5.", ["CC-LOG-02"]],
	["11.6.", ["CC-PCI-05"]],
	// 12 Organisation
	["12.1.3", ["CC-GOV-02"]],
	["12.1.4", ["CC-GOV-02"]],
	["12.1.", ["CC-GOV-01"]],
	["12.2.", ["CC-AST-03"]],
	["12.3.3", ["CC-CRY-04"]],
	["12.3.4", ["CC-AST-06"]],
	["12.3.", ["CC-PCI-07"]],
	["12.4.", ["CC-GOV-03", "CC-GOV-13"]],
	["12.5.1", ["CC-AST-01"]],
	["12.5.", ["CC-PCI-01"]],
	["12.6.", ["CC-HR-03"]],
	["12.7.", ["CC-HR-01"]],
	["12.8.1", ["CC-TPR-01"]],
	["12.8.2", ["CC-TPR-04"]],
	["12.8.3", ["CC-TPR-03"]],
	["12.8.4", ["CC-TPR-05", "CC-PCI-09"]],
	["12.8.5", ["CC-PCI-09"]],
	["12.9.", ["CC-PCI-09"]],
	["12.10.2", ["CC-INC-01", "CC-BCM-05"]],
	["12.10.4", ["CC-HR-03", "CC-INC-01"]],
	["12.10.4.1", ["CC-HR-03", "CC-PCI-07"]],
	["12.10.6", ["CC-INC-05"]],
	["12.10.7", ["CC-PCI-10", "CC-INC-01"]],
	["12.10.", ["CC-INC-01"]],
	// Anhänge
	["A1.2.1", ["CC-LOG-01"]],
	["A1.2.", ["CC-INC-01", "CC-INC-06"]],
	["A1.", ["CC-NET-01", "CC-IAM-01"]],
	["A2.", ["CC-CRY-05"]],
];

// N.1.1 und N.1.2 der Abschnitte 1 bis 11 (Abschnitt 12 hat keine)
const BASIC = /^(?:[1-9]|1[01])\.1\.[12]$/;

function matches(pattern: string, code: string): boolean {
	if (pattern.startsWith("*"))
		return BASIC.test(code) && code.endsWith(pattern.slice(1));
	return pattern.endsWith(".") ? code.startsWith(pattern) : code === pattern;
}

export function pciControlsFor(code: string): string[] {
	return RULES.find(([p]) => matches(p, code))?.[1] ?? ["CC-GOV-01"];
}

export const PCI_EDGES: CatalogControlMapping[] = PCI_CODES.flatMap((code) => {
	const basic = BASIC.test(code);
	return pciControlsFor(code).map((control, i) => ({
		control,
		requirement: `pci-dss:${code}` as const,
		coverage: basic || i > 0 ? ("partial" as const) : ("full" as const),
	}));
});
