import type { Service } from "./services";

// „Für dich empfohlen“ (Einstellungen → Abo & Leistungen) — pure. Aus dem
// Stand der Organisation höchstens drei Leistungen mit Begründung; keine
// Empfehlung ohne konkreten Anlass.

export type RecommendInput = {
	frameworks: readonly string[];
	// abgeschlossene Gap-Analyse (Fragebogen „self“)
	gapAnalysisCompleted: boolean;
	// letzter durchgeführter Pentest (Testprogramm)
	lastPentestAt: Date | null;
	products: number;
	productsWithoutSbom: number;
	// kritische/wichtige Dienstleister ohne gültige Bewertung
	suppliersDue: number;
	// offene Befunde aus dem passiven Schnellcheck
	quickCheckFindings: number;
	now: Date;
};

export type Recommendation = {
	service: Service["key"];
	reason:
		| { key: "noGap" }
		| { key: "noPentest" }
		| { key: "pentestOld"; months: number }
		| { key: "craSbom"; n: number }
		| { key: "craNoProducts" }
		| { key: "suppliersDue"; n: number }
		| { key: "quickCheck"; n: number };
};

const PENTEST_FRAMEWORKS = ["iso27001", "nis2", "dora", "cra", "soc2", "ccss"];
const SUPPLIER_FRAMEWORKS = ["nis2", "dora"];

function monthsBetween(a: Date, b: Date): number {
	return (
		(b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
		(b.getUTCMonth() - a.getUTCMonth())
	);
}

export function recommendServices(input: RecommendInput): Recommendation[] {
	const fw = new Set(input.frameworks);
	const out: Recommendation[] = [];
	if (!input.gapAnalysisCompleted)
		out.push({ service: "gap", reason: { key: "noGap" } });
	if (fw.has("cra")) {
		if (input.products === 0)
			out.push({ service: "cra", reason: { key: "craNoProducts" } });
		else if (input.productsWithoutSbom > 0)
			out.push({
				service: "cra",
				reason: { key: "craSbom", n: input.productsWithoutSbom },
			});
	}
	if (PENTEST_FRAMEWORKS.some((f) => fw.has(f))) {
		if (!input.lastPentestAt)
			out.push({ service: "pentest", reason: { key: "noPentest" } });
		else {
			const months = monthsBetween(input.lastPentestAt, input.now);
			if (months >= 12)
				out.push({ service: "pentest", reason: { key: "pentestOld", months } });
		}
	}
	if (input.suppliersDue > 0 && SUPPLIER_FRAMEWORKS.some((f) => fw.has(f)))
		out.push({
			service: "suppliers",
			reason: { key: "suppliersDue", n: input.suppliersDue },
		});
	if (input.quickCheckFindings > 0)
		out.push({
			service: "ai-check",
			reason: { key: "quickCheck", n: input.quickCheckFindings },
		});
	return out.slice(0, 3);
}
