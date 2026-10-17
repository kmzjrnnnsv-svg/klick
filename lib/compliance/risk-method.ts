import type {
	Five,
	RiskAppetite,
	RiskClass,
	RiskDimension,
	RiskLevelText,
	RiskMethod,
	RiskScales,
	RiskZone,
} from "@/db/schema/platform";

// Risikomethodik — rein. Jede Org wählt Rechenweg (EW + SH oder EW × SH),
// Anker je Stufe, Schadensarten und Klassen. Die Vorlage folgt der
// verbreiteten ISMS-Risikoanalyse (fünf Stufen, EW + SH, drei Klassen) und
// ergänzt Schadensarten je aktivem Rahmenwerk (Kunden, Kundenvermögen,
// Aufsicht, betroffene Personen). Bestands-Orgs ohne gespeicherte Methode
// rechnen wie bisher (EW × SH, Klassen aus dem Appetit).

export const LIKELIHOOD_TEMPLATE: Five<RiskLevelText> = [
	{
		label: "fast nie",
		anchor:
			"Höchstens alle 10 Jahre. Erfordert sehr hohes Fachwissen, umfassende interne Kenntnisse und erheblichen Aufwand – oder das Zusammentreffen mehrerer widriger Umstände. Praktisch noch nie vorgekommen.",
	},
	{
		label: "sehr selten",
		anchor:
			"Alle 5 bis 10 Jahre. Erfordert hohes Fachwissen, interne Kenntnisse und erheblichen Aufwand. In absehbarer Zeit nicht zu erwarten.",
	},
	{
		label: "wahrscheinlich",
		anchor:
			"Einmal in 5 Jahren bis einmal im Jahr. Möglich, aber nicht zu erwarten. Erfordert interne Kenntnisse und hohes Fachwissen; bisher nur selten aufgetreten.",
	},
	{
		label: "sehr wahrscheinlich",
		anchor:
			"Einmal im Jahr bis einmal im Monat. Realistisch und erwartbar. Mit üblichen Fachkenntnissen und mäßigem Aufwand möglich; schon mehrfach eingetreten.",
	},
	{
		label: "häufig",
		anchor:
			"Mehrmals im Monat. Akut vorhanden. Auch ohne Vorkenntnisse mit geringem Aufwand möglich; tritt regelmäßig auf.",
	},
];

export const IMPACT_TEMPLATE: Five<string> = [
	"unbedeutend",
	"gering",
	"mittel",
	"groß",
	"katastrophal",
];

type DimensionTemplate = Omit<RiskDimension, "enabled"> & {
	// leer = immer; sonst genügt eines der Rahmenwerke
	frameworks?: readonly string[];
};

export const DIMENSION_TEMPLATES: readonly DimensionTemplate[] = [
	{
		key: "financial",
		label: "Finanzieller Schaden/Aufwand",
		anchors: [
			"Belastung des Ergebnisses bis 5.000 €",
			"Belastung des Ergebnisses zwischen 5.001 € und 20.000 €",
			"Belastung des Ergebnisses zwischen 20.001 € und 50.000 €",
			"Belastung des Ergebnisses zwischen 50.001 € und 500.000 €",
			"Belastung des Ergebnisses über 500.000 €",
		],
	},
	{
		key: "outage",
		label: "Ausfall von Prozess oder Service (an Werktagen)",
		anchors: [
			"Unter 1 Stunde, wenige Nutzer:innen, nicht sicherheitsrelevante Prozesse",
			"Unter 8 Stunden, mittlere Zahl Nutzer:innen, nicht sicherheitsrelevante Prozesse",
			"Unter 1 Tag, mittlere Zahl Nutzer:innen, geringe Sicherheitsrelevanz",
			"Unter 2 Tagen, viele Nutzer:innen, sicherheitsrelevante Prozesse",
			"Über 1 Woche, viele Nutzer:innen, hohe Sicherheitsrelevanz",
		],
	},
	{
		key: "data",
		label: "Vertraulichkeit und Verlust von Daten",
		anchors: [
			"Verlust einzelner Daten mit niedriger Sensibilität",
			"Viele Daten mit niedriger oder einzelne mit mittlerer Sensibilität; nicht besonders geschützte personenbezogene Daten im Einzelfall oder intern",
			"Viele Daten mit mittlerer Sensibilität; nicht besonders geschützte personenbezogene Daten in erheblichem Umfang oder vertraulich",
			"Einzelne Daten mit hoher Sensibilität; besonders geschützte personenbezogene Daten im Einzelfall oder geheim",
			"Viele Daten mit hoher Sensibilität; besonders geschützte personenbezogene Daten in erheblichem Umfang oder streng geheim",
		],
	},
	{
		key: "legal",
		label: "Verstöße gegen Gesetze, Vorschriften, Verträge",
		anchors: [
			"Geringfügige Verstöße durch Mitarbeitende, keine Strafen, keine Geschäftsstörung",
			"Geschäftsstörungen, aber keine Strafen; Verstöße gegen interne Anweisungen, Bagatellverstöße",
			"Geringe Strafen, keine Geschäftsstörung; Verstöße mit disziplinarischen oder arbeitsrechtlichen Folgen",
			"Strafe und geringfügige Geschäftsstörung, Haftung der Geschäftsleitung; Verstöße gegen gesetzliche Vorschriften",
			"Erhebliche, längere Geschäftsstörung und/oder Haftung von Geschäftsleitung und Aufsichtsorgan; strafrechtliche oder existenzielle Folgen",
		],
	},
	{
		key: "image",
		label: "Ansehen in der Öffentlichkeit",
		anchors: [
			"Kritische Berichterstattung in der lokalen Presse",
			"Kritische Berichterstattung in der Fachpresse und überregionalen Presse",
			"Negative Berichterstattung in der überregionalen Presse",
			"Umfassende negative Berichterstattung in der überregionalen Presse",
			"Umfassende, mehrfache oder lange negative Berichterstattung in der überregionalen Presse",
		],
	},
	{
		key: "customers",
		label: "Kunden und Dritte",
		frameworks: ["nis2", "dora", "micar", "zag", "zag-marisk", "kwg"],
		anchors: [
			"Keine Kunden oder Dienstempfänger:innen merklich betroffen",
			"Einzelne Kunden kurz betroffen, keine Folgeschäden",
			"Ein spürbarer Teil der Kunden (bis 10 %) betroffen oder Dienst bis 24 Stunden eingeschränkt",
			"Über 10 % oder über 100.000 Kunden betroffen, kritischer Dienst über 2 Stunden aus oder Wirkung in mehreren EU-Staaten",
			"Breite Wirkung auf Kunden, Märkte oder die Allgemeinheit; erheblicher Schaden für Dritte",
		],
	},
	{
		key: "clientAssets",
		label: "Kundenvermögen",
		frameworks: ["micar", "zag", "zag-marisk", "kwg"],
		anchors: [
			"Kundengelder und Kryptowerte nicht berührt",
			"Einzelne Kunden kommen vorübergehend nicht an Gelder oder Kryptowerte, kein Verlust",
			"Verzögerte Auszahlung oder Rücktausch für viele Kunden, kein endgültiger Verlust",
			"Endgültiger Verlust kleiner Beträge, Ausgleich aus Eigenmitteln möglich",
			"Verlust erheblicher Kundengelder oder Kryptowerte, Ausgleich aus Eigenmitteln nicht möglich",
		],
	},
	{
		key: "supervisory",
		label: "Aufsicht",
		frameworks: [
			"dora",
			"micar",
			"zag",
			"zag-marisk",
			"kwg",
			"gwg",
			"amlr",
			"tfr",
			"sanctions",
		],
		anchors: [
			"Keine aufsichtliche Relevanz",
			"Meldung oder Rückfrage der Aufsicht ohne Folgen",
			"Feststellung in einer Prüfung oder Anordnung zur Beseitigung",
			"Bußgeld, Sonderprüfung oder Maßnahmen gegen Geschäftsleiter:innen",
			"Einschränkung oder Entzug der Erlaubnis, Abberufung der Geschäftsleitung",
		],
	},
	{
		key: "persons",
		label: "Betroffene Personen (Datenschutz)",
		frameworks: ["dsgvo"],
		anchors: [
			"Keine oder nur geringfügige Beeinträchtigung",
			"Geringe Unannehmlichkeiten, leicht zu beheben",
			"Spürbare Folgen, mit Aufwand zu beheben (Kosten, Kontosperrung, Ängste)",
			"Erhebliche Folgen (Identitätsdiebstahl, finanzielle Verluste, Diskriminierung)",
			"Schwere oder dauerhafte Folgen für Gesundheit, Existenz oder Freiheit",
		],
	},
];

export const CLASS_TEMPLATE: readonly RiskClass[] = [
	{
		key: "rk1",
		label: "gering",
		min: 2,
		max: 4,
		zone: "acceptable",
		meaning:
			"Die umgesetzten Maßnahmen schützen ausreichend. Keine weiteren Maßnahmen nötig; das Risiko kann getragen und das Restrisiko akzeptiert werden.",
	},
	{
		key: "rk2",
		label: "mittel",
		min: 5,
		max: 7,
		zone: "tolerable",
		meaning:
			"Die umgesetzten Maßnahmen reichen eventuell nicht. Prüfe immer, ob weitere Maßnahmen das Risiko angemessen senken. Ist das wirtschaftlich nicht sinnvoll, kann das Restrisiko begründet akzeptiert werden.",
	},
	{
		key: "rk3",
		label: "hoch",
		min: 8,
		max: 10,
		zone: "unacceptable",
		meaning:
			"Die umgesetzten Maßnahmen reichen nicht. Weitere Maßnahmen müssen das Risiko senken. Akzeptieren darf nur die Geschäftsleitung, in begründeten Ausnahmefällen und nur, wenn keine sinnvolle Maßnahme gefunden wird.",
	},
];

export function templateDimensions(
	frameworks: readonly string[],
): RiskDimension[] {
	const set = new Set(frameworks);
	return DIMENSION_TEMPLATES.filter(
		(d) => !d.frameworks || d.frameworks.some((f) => set.has(f)),
	).map(({ frameworks: _f, ...d }) => ({
		...d,
		anchors: [...d.anchors] as Five<string>,
		enabled: true,
	}));
}

export function defaultRiskMethod(frameworks: readonly string[]): RiskMethod {
	return {
		aggregation: "sum",
		likelihood: LIKELIHOOD_TEMPLATE.map((l) => ({
			...l,
		})) as Five<RiskLevelText>,
		impact: [...IMPACT_TEMPLATE] as Five<string>,
		dimensions: templateDimensions(frameworks),
		classes: CLASS_TEMPLATE.map((c) => ({ ...c })),
	};
}

// Bestand: EW × SH, Klassen aus dem Appetit, „kritisch“ ab 15 wie die
// früheren Bänder. Zonen bleiben exakt wie vorher (≤ acceptable,
// ≤ tolerable, darüber unzumutbar).
export function legacyRiskMethod(
	scales: RiskScales | null | undefined,
	appetite: RiskAppetite,
	frameworks: readonly string[] = [],
): RiskMethod {
	const a = Math.max(1, Math.min(24, appetite.acceptable));
	const t = Math.max(a + 1, Math.min(25, appetite.tolerable));
	const classes: RiskClass[] = [
		{
			key: "low",
			label: "niedrig",
			min: 1,
			max: a,
			zone: "acceptable",
			meaning: CLASS_TEMPLATE[0]?.meaning ?? "",
		},
		{
			key: "medium",
			label: "mittel",
			min: a + 1,
			max: t,
			zone: "tolerable",
			meaning: CLASS_TEMPLATE[1]?.meaning ?? "",
		},
	];
	const high = CLASS_TEMPLATE[2]?.meaning ?? "";
	if (t < 14)
		classes.push({
			key: "high",
			label: "hoch",
			min: t + 1,
			max: 14,
			zone: "unacceptable",
			meaning: high,
		});
	if (t < 25)
		classes.push({
			key: "critical",
			label: "kritisch",
			min: Math.max(15, t + 1),
			max: 25,
			zone: "unacceptable",
			meaning: high,
		});
	const likelihood = LIKELIHOOD_TEMPLATE.map((l, i) => ({
		label: scales?.likelihood[i] ?? l.label,
		anchor: l.anchor,
	})) as Five<RiskLevelText>;
	return {
		aggregation: "product",
		likelihood,
		impact: (scales?.impact
			? [...scales.impact]
			: [
					"unwesentlich",
					"gering",
					"spürbar",
					"schwer",
					"existenzbedrohend",
				]) as Five<string>,
		dimensions: templateDimensions(frameworks),
		classes,
	};
}

export function resolveRiskMethod(
	settings:
		| {
				riskMethod?: RiskMethod | null;
				riskScales?: RiskScales | null;
				riskAppetite?: RiskAppetite | null;
		  }
		| null
		| undefined,
	frameworks: readonly string[] = [],
): RiskMethod {
	if (settings?.riskMethod) return settings.riskMethod;
	return legacyRiskMethod(
		settings?.riskScales,
		settings?.riskAppetite ?? { acceptable: 4, tolerable: 9 },
		frameworks,
	);
}

export function scoreRange(method: Pick<RiskMethod, "aggregation">): {
	min: number;
	max: number;
} {
	return method.aggregation === "sum"
		? { min: 2, max: 10 }
		: { min: 1, max: 25 };
}

export function clampLevel(n: number): 1 | 2 | 3 | 4 | 5 {
	const v = Math.round(Number.isFinite(n) ? n : 3);
	return Math.min(5, Math.max(1, v)) as 1 | 2 | 3 | 4 | 5;
}

export function aggregate(
	likelihood: number,
	impact: number,
	method: Pick<RiskMethod, "aggregation">,
): number {
	const l = clampLevel(likelihood);
	const i = clampLevel(impact);
	return method.aggregation === "sum" ? l + i : l * i;
}

export type ClassResult = {
	key: string;
	label: string;
	zone: RiskZone;
	meaning: string;
	index: number;
};

export function classify(
	score: number,
	method: Pick<RiskMethod, "classes">,
): ClassResult {
	const classes = method.classes;
	let idx = classes.findIndex((c) => score >= c.min && score <= c.max);
	if (idx < 0) {
		// Lücke oder außerhalb: nächstliegende Klasse (validateRiskMethod
		// verhindert das beim Speichern)
		idx = score < (classes[0]?.min ?? 0) ? 0 : classes.length - 1;
	}
	const c = classes[idx];
	return {
		key: c?.key ?? "unknown",
		label: c?.label ?? "—",
		zone: c?.zone ?? "unacceptable",
		meaning: c?.meaning ?? "",
		index: Math.max(0, idx),
	};
}

// Schadenshöhe aus den Einzelwerten: höchste aktive Schadensart zählt.
export function damageFrom(
	detail: Record<string, number> | null | undefined,
	method: Pick<RiskMethod, "dimensions">,
): number | null {
	if (!detail) return null;
	let max: number | null = null;
	for (const d of method.dimensions) {
		if (!d.enabled) continue;
		const v = detail[d.key];
		if (typeof v !== "number" || !Number.isFinite(v)) continue;
		const c = clampLevel(v);
		if (max === null || c > max) max = c;
	}
	return max;
}

// Welche Schadensart bestimmt den Wert (für „höchster Wert zählt: … wegen …“)
export function decisiveDimensions(
	detail: Record<string, number> | null | undefined,
	method: Pick<RiskMethod, "dimensions">,
): RiskDimension[] {
	const max = damageFrom(detail, method);
	if (max === null || !detail) return [];
	return method.dimensions.filter(
		(d) => d.enabled && clampLevel(detail[d.key] ?? 0) === max,
	);
}

// Appetit für Altcode/Notifications: höchste Grenze je Zone.
export function appetiteFromMethod(
	method: Pick<RiskMethod, "classes" | "aggregation">,
): RiskAppetite {
	const range = scoreRange(method);
	let acceptable = range.min - 1;
	let tolerable: number | null = null;
	for (const c of method.classes) {
		if (c.zone === "acceptable") acceptable = Math.max(acceptable, c.max);
		if (c.zone === "tolerable") tolerable = Math.max(tolerable ?? 0, c.max);
	}
	return { acceptable, tolerable: tolerable ?? acceptable };
}

export type RiskMethodIssue =
	| "no_classes"
	| "class_gap"
	| "class_order"
	| "class_range"
	| "zone_order"
	| "duplicate_key"
	| "empty_label"
	| "no_dimension";

export function validateRiskMethod(method: RiskMethod): RiskMethodIssue[] {
	const issues = new Set<RiskMethodIssue>();
	const range = scoreRange(method);
	const cls = method.classes;
	if (cls.length < 2) issues.add("no_classes");
	const ZONE_RANK: Record<RiskZone, number> = {
		acceptable: 0,
		tolerable: 1,
		unacceptable: 2,
	};
	cls.forEach((c, i) => {
		if (c.min > c.max) issues.add("class_order");
		if (!c.label.trim()) issues.add("empty_label");
		const prev = cls[i - 1];
		if (prev) {
			if (c.min !== prev.max + 1) issues.add("class_gap");
			if (ZONE_RANK[c.zone] < ZONE_RANK[prev.zone]) issues.add("zone_order");
		}
	});
	if (cls.length > 0) {
		if (cls[0]?.min !== range.min || cls.at(-1)?.max !== range.max)
			issues.add("class_range");
	}
	const keys = [
		...cls.map((c) => c.key),
		...method.dimensions.map((d) => d.key),
	];
	if (new Set(keys).size !== keys.length) issues.add("duplicate_key");
	if (!method.dimensions.some((d) => d.enabled)) issues.add("no_dimension");
	for (const d of method.dimensions)
		if (!d.label.trim()) issues.add("empty_label");
	for (const l of method.likelihood)
		if (!l.label.trim()) issues.add("empty_label");
	for (const l of method.impact) if (!l.trim()) issues.add("empty_label");
	return [...issues];
}

// Klassen beim Wechsel des Rechenwegs auf den neuen Wertebereich strecken
// (gleiche Anteile, ganzzahlig, lückenlos).
export function rescaleClasses(
	classes: readonly RiskClass[],
	from: RiskMethod["aggregation"],
	to: RiskMethod["aggregation"],
): RiskClass[] {
	if (from === to) return classes.map((c) => ({ ...c }));
	const a = scoreRange({ aggregation: from });
	const b = scoreRange({ aggregation: to });
	const scale = (v: number) =>
		Math.round(b.min + ((v - a.min) / (a.max - a.min)) * (b.max - b.min));
	const out: RiskClass[] = [];
	classes.forEach((c, i) => {
		const min = i === 0 ? b.min : (out[i - 1]?.max ?? b.min) + 1;
		const max = i === classes.length - 1 ? b.max : Math.max(min, scale(c.max));
		out.push({ ...c, min, max });
	});
	return out;
}

export function methodChangePreview(
	risks: readonly {
		likelihood: number;
		impact: number;
		residualLikelihood?: number | null;
		residualImpact?: number | null;
	}[],
	from: RiskMethod,
	to: RiskMethod,
): { changed: number; nowUnacceptable: number } {
	let changed = 0;
	let nowUnacceptable = 0;
	for (const r of risks) {
		const l =
			r.residualLikelihood != null && r.residualImpact != null
				? r.residualLikelihood
				: r.likelihood;
		const i =
			r.residualLikelihood != null && r.residualImpact != null
				? r.residualImpact
				: r.impact;
		const a = classify(aggregate(l, i, from), from);
		const b = classify(aggregate(l, i, to), to);
		if (a.label !== b.label || a.zone !== b.zone) changed++;
		if (b.zone === "unacceptable" && a.zone !== "unacceptable")
			nowUnacceptable++;
	}
	return { changed, nowUnacceptable };
}

export const ZONE_TONE: Record<
	RiskZone,
	"success" | "warning" | "destructive"
> = {
	acceptable: "success",
	tolerable: "warning",
	unacceptable: "destructive",
};

// Beschriftungen für Auswahllisten und Matrix-Achsen
export function scaleLabels(
	method: Pick<RiskMethod, "likelihood" | "impact">,
): {
	likelihood: string[];
	impact: string[];
} {
	return {
		likelihood: method.likelihood.map((l) => l.label),
		impact: [...method.impact],
	};
}
