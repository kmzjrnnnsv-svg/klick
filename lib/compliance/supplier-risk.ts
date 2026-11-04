// Risiko aus der Lieferantenbewertung (L2): Vorschlag für Eintritt und
// Schaden, wenn ein Risiko aus einem Dienstleister oder seiner Bewertung
// entsteht. Eintritt aus der Ampel der Bewertung (rot = wahrscheinlich),
// Schaden aus Kritikalität und Ersetzbarkeit. Nur ein Vorschlag im
// Assistenten; die Person entscheidet. Pure, getestet.

export type SupplierRiskInput = {
	ratingTraffic?: "red" | "amber" | "green" | null;
	criticality?: string | null;
	substitutability?: string | null;
};

export type SupplierRiskSuggestion = {
	likelihood: number | null;
	impact: number;
	// welche Merkmale den Vorschlag tragen (für den Hinweis im Assistenten)
	because: (
		| "traffic_red"
		| "traffic_amber"
		| "traffic_green"
		| "critical"
		| "important"
		| "not_substitutable"
		| "difficult"
	)[];
};

export function supplierRiskSuggestion(
	s: SupplierRiskInput,
	levels: number,
): SupplierRiskSuggestion {
	const because: SupplierRiskSuggestion["because"] = [];
	let likelihood: number | null = null;
	if (s.ratingTraffic === "red") {
		likelihood = Math.max(1, levels - 1);
		because.push("traffic_red");
	} else if (s.ratingTraffic === "amber") {
		likelihood = Math.ceil(levels / 2);
		because.push("traffic_amber");
	} else if (s.ratingTraffic === "green") {
		likelihood = 1;
		because.push("traffic_green");
	}
	let impact = 2;
	if (s.criticality === "critical") {
		impact = levels - 1;
		because.push("critical");
	} else if (s.criticality === "important") {
		impact = Math.max(2, levels - 2);
		because.push("important");
	}
	if (s.substitutability === "not_substitutable") {
		impact += 1;
		because.push("not_substitutable");
	} else if (
		s.substitutability === "difficult" &&
		s.criticality !== "standard"
	) {
		because.push("difficult");
	}
	return {
		likelihood,
		impact: Math.min(levels, Math.max(1, impact)),
		because,
	};
}

// Schadensart, an der der Vorschlag steht: Ausfall, sonst die erste aktive
export function supplierImpactDimension(
	dimensions: readonly { key: string; enabled: boolean }[],
): string | null {
	const active = dimensions.filter((d) => d.enabled);
	return (active.find((d) => d.key === "outage") ?? active[0])?.key ?? null;
}
