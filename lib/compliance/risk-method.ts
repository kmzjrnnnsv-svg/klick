import type {
	Five,
	Levels,
	RiskAcceptanceStep,
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

// Vier Stufen nach BSI-Standard 200-3 (vernachlässigbar, begrenzt,
// beträchtlich, existenzbedrohend) je Schadensart; Euro-Grenzen und
// Beschreibungen sind Vorschläge, je Org anzupassen (prüfen).
const ANCHORS_4: Record<string, string[]> = {
	financial: [
		"Belastung des Ergebnisses bis 5.000 €",
		"Belastung des Ergebnisses zwischen 5.001 € und 50.000 €",
		"Belastung des Ergebnisses zwischen 50.001 € und 500.000 €",
		"Belastung des Ergebnisses über 500.000 €, existenzbedrohend",
	],
	outage: [
		"Unter 4 Stunden, kaum spürbar für Nutzer:innen",
		"Bis 1 Tag, Arbeit mit Einschränkungen möglich",
		"Bis 1 Woche oder zeitkritische Prozesse betroffen",
		"Über 1 Woche oder Aufgabenerfüllung nicht mehr möglich",
	],
	data: [
		"Einzelne Daten mit niedriger Sensibilität",
		"Interne oder nicht besonders geschützte personenbezogene Daten",
		"Vertrauliche Daten oder personenbezogene Daten in erheblichem Umfang",
		"Streng geheime Daten oder besonders geschützte personenbezogene Daten in erheblichem Umfang",
	],
	legal: [
		"Geringfügige Verstöße ohne Folgen",
		"Verstöße mit geringen Strafen oder Vertragsstrafen",
		"Verstöße mit erheblichen Strafen oder Haftung der Geschäftsleitung",
		"Verstöße mit strafrechtlichen oder existenziellen Folgen",
	],
	image: [
		"Keine oder nur interne Wirkung",
		"Kritische Berichterstattung in lokaler oder Fachpresse",
		"Negative Berichterstattung in der überregionalen Presse",
		"Umfassender, dauerhafter Vertrauensverlust in der Öffentlichkeit",
	],
	customers: [
		"Keine Kunden oder Dienstempfänger:innen merklich betroffen",
		"Einzelne Kunden kurz betroffen, keine Folgeschäden",
		"Ein spürbarer Teil der Kunden betroffen oder Dienst über 24 Stunden eingeschränkt",
		"Breite Wirkung auf Kunden, Märkte oder die Allgemeinheit",
	],
	clientAssets: [
		"Kundengelder und Kryptowerte nicht berührt",
		"Verzögerter Zugriff einzelner Kunden, kein Verlust",
		"Verzögerte Auszahlung für viele Kunden oder Verlust kleiner Beträge",
		"Verlust erheblicher Kundengelder oder Kryptowerte",
	],
	supervisory: [
		"Keine aufsichtliche Relevanz",
		"Meldung oder Rückfrage der Aufsicht ohne Folgen",
		"Feststellung, Anordnung oder Bußgeld",
		"Einschränkung oder Entzug der Erlaubnis",
	],
	persons: [
		"Keine oder nur geringfügige Beeinträchtigung",
		"Geringe Unannehmlichkeiten, leicht zu beheben",
		"Erhebliche Folgen (finanzielle Verluste, Identitätsdiebstahl)",
		"Schwere oder dauerhafte Folgen für Gesundheit, Existenz oder Freiheit",
	],
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
		acceptance: [],
	},
	{
		key: "rk2",
		label: "mittel",
		min: 5,
		max: 7,
		zone: "tolerable",
		meaning:
			"Die umgesetzten Maßnahmen reichen eventuell nicht. Prüfe immer, ob weitere Maßnahmen das Risiko angemessen senken. Ist das wirtschaftlich nicht sinnvoll, kann das Restrisiko begründet akzeptiert werden.",
		acceptance: ["department_head"],
	},
	{
		key: "rk3",
		label: "hoch",
		min: 8,
		max: 10,
		zone: "unacceptable",
		meaning:
			"Die umgesetzten Maßnahmen reichen nicht. Weitere Maßnahmen müssen das Risiko senken. Akzeptieren darf nur die Geschäftsleitung, in begründeten Ausnahmefällen und nur, wenn keine sinnvolle Maßnahme gefunden wird.",
		acceptance: ["department_head", "management_body"],
	},
];

export function templateDimensions(
	frameworks: readonly string[],
	levels: LevelCount = 5,
): RiskDimension[] {
	const set = new Set(frameworks);
	return DIMENSION_TEMPLATES.filter(
		(d) => !d.frameworks || d.frameworks.some((f) => set.has(f)),
	).map(({ frameworks: _f, ...d }) => ({
		...d,
		anchors:
			levels === 4
				? [...(ANCHORS_4[d.key] ?? rescaleAnchors(d.anchors, 4))]
				: [...d.anchors],
		enabled: true,
	}));
}

// Anker auf eine andere Stufenzahl bringen (je neuer Stufe der nächste alte
// Anker); nur für Schadensarten ohne eigene Vorlage
function rescaleAnchors(anchors: readonly string[], to: LevelCount): string[] {
	const from = anchors.length;
	return Array.from(
		{ length: to },
		(_, i) => anchors[rescaleLevel(i + 1, to, from) - 1] ?? "",
	);
}

export function defaultRiskMethod(frameworks: readonly string[]): RiskMethod {
	return {
		aggregation: "sum",
		likelihood: LIKELIHOOD_TEMPLATE.map((l) => ({ ...l })),
		impact: [...IMPACT_TEMPLATE],
		dimensions: templateDimensions(frameworks),
		classes: CLASS_TEMPLATE.map((c) => ({
			...c,
			acceptance: c.acceptance ? [...c.acceptance] : undefined,
		})),
	};
}

// Vorlage nach BSI-Standard 200-3: vier Stufen je Achse, Risikokategorie aus
// der Matrix (Abbildung „Matrix zur Einstufung von Risiken“). Häufigkeiten,
// Beschreibungen und Matrix nach Modellwissen, gegen den Standard prüfen.
export const BSI_LIKELIHOOD: Levels<RiskLevelText> = [
	{
		label: "selten",
		anchor:
			"Das Ereignis könnte nach heutigem Kenntnisstand höchstens alle fünf Jahre eintreten.",
	},
	{
		label: "mittel",
		anchor: "Das Ereignis tritt einmal alle fünf Jahre bis einmal im Jahr ein.",
	},
	{
		label: "häufig",
		anchor: "Das Ereignis tritt einmal im Jahr bis einmal pro Monat ein.",
	},
	{
		label: "sehr häufig",
		anchor: "Das Ereignis tritt mehrmals im Monat ein.",
	},
];

export const BSI_IMPACT: Levels<string> = [
	"vernachlässigbar",
	"begrenzt",
	"beträchtlich",
	"existenzbedrohend",
];

export const BSI_CLASSES: readonly RiskClass[] = [
	{
		key: "gering",
		label: "gering",
		min: 1,
		max: 1,
		zone: "acceptable",
		meaning:
			"Die umgesetzten Sicherheitsmaßnahmen bieten einen ausreichenden Schutz. Das Risiko kann akzeptiert werden.",
		acceptance: [],
	},
	{
		key: "mittel",
		label: "mittel",
		min: 2,
		max: 2,
		zone: "tolerable",
		meaning:
			"Die umgesetzten Sicherheitsmaßnahmen reichen möglicherweise nicht aus. Prüfe weitere Maßnahmen; ein Restrisiko kann begründet akzeptiert werden.",
		acceptance: ["department_head"],
	},
	{
		key: "hoch",
		label: "hoch",
		min: 3,
		max: 3,
		zone: "unacceptable",
		meaning:
			"Die umgesetzten Sicherheitsmaßnahmen bieten keinen ausreichenden Schutz. Weitere Maßnahmen sind nötig; akzeptieren nur durch die Leitung.",
		acceptance: ["department_head", "management_body"],
	},
	{
		key: "sehr_hoch",
		label: "sehr hoch",
		min: 4,
		max: 4,
		zone: "unacceptable",
		meaning:
			"Die umgesetzten Sicherheitsmaßnahmen bieten keinen ausreichenden Schutz. Das Risiko muss umgehend gesenkt werden; akzeptieren nur in begründeten Ausnahmen durch die Leitung.",
		acceptance: ["department_head", "management_body"],
	},
];

// Zeile = Eintrittshäufigkeit (selten … sehr häufig), Spalte = Schadenshöhe
// (vernachlässigbar … existenzbedrohend)
export const BSI_MATRIX: readonly (readonly string[])[] = [
	["gering", "gering", "mittel", "hoch"],
	["gering", "mittel", "hoch", "sehr_hoch"],
	["mittel", "mittel", "hoch", "sehr_hoch"],
	["mittel", "hoch", "sehr_hoch", "sehr_hoch"],
];

export function bsiRiskMethod(frameworks: readonly string[]): RiskMethod {
	return {
		aggregation: "matrix",
		likelihood: BSI_LIKELIHOOD.map((l) => ({ ...l })),
		impact: [...BSI_IMPACT],
		dimensions: templateDimensions(frameworks, 4),
		classes: BSI_CLASSES.map((c) => ({
			...c,
			acceptance: c.acceptance ? [...c.acceptance] : undefined,
		})),
		matrix: BSI_MATRIX.map((r) => [...r]),
	};
}

export const RISK_METHOD_PRESETS = [
	{
		key: "standard",
		label: "Standardvorlage",
		hint: "Fünf Stufen, Eintrittswahrscheinlichkeit + Schadenshöhe, drei Klassen",
	},
	{
		key: "bsi-200-3",
		label: "BSI-Standard 200-3",
		hint: "Vier Stufen, Risikokategorie aus der Matrix (gering bis sehr hoch)",
	},
] as const;
export type RiskMethodPreset = (typeof RISK_METHOD_PRESETS)[number]["key"];

export function presetRiskMethod(
	key: RiskMethodPreset,
	frameworks: readonly string[],
): RiskMethod {
	return key === "bsi-200-3"
		? bsiRiskMethod(frameworks)
		: defaultRiskMethod(frameworks);
}

// Matrix als Startwert, wenn eine Org auf „Matrix“ umstellt: jedes Feld
// bekommt die Klasse, die das Produkt EW × SH auf die Klassen verteilt.
export function defaultMatrix(
	levels: number,
	classes: readonly Pick<RiskClass, "key">[],
): string[][] {
	const n = Math.max(1, levels);
	const k = Math.max(1, classes.length);
	return Array.from({ length: n }, (_, li) =>
		Array.from({ length: n }, (_, ii) => {
			const share = ((li + 1) * (ii + 1) - 1) / (n * n - 1 || 1);
			const idx = Math.min(k - 1, Math.floor(share * k));
			return classes[idx]?.key ?? "";
		}),
	);
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
	const likelihood: Levels<RiskLevelText> = LIKELIHOOD_TEMPLATE.map((l, i) => ({
		label: scales?.likelihood[i] ?? l.label,
		anchor: l.anchor,
	}));
	return {
		aggregation: "product",
		likelihood,
		impact: scales?.impact
			? [...scales.impact]
			: ["unwesentlich", "gering", "spürbar", "schwer", "existenzbedrohend"],
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

export type LevelCount = 4 | 5;

// Was Wertebereich und Rechnung brauchen; ohne Stufen gelten fünf
export type ScoreBasis = Pick<RiskMethod, "aggregation"> & {
	likelihood?: readonly unknown[];
	classes?: readonly Pick<RiskClass, "key">[];
	matrix?: readonly (readonly string[])[];
};

export function levelCount(method: {
	likelihood?: readonly unknown[];
}): LevelCount {
	return method.likelihood?.length === 4 ? 4 : 5;
}

export function scoreRange(method: ScoreBasis): {
	min: number;
	max: number;
} {
	const n = levelCount(method);
	if (method.aggregation === "matrix")
		return { min: 1, max: Math.max(1, method.classes?.length ?? n) };
	return method.aggregation === "sum"
		? { min: 2, max: 2 * n }
		: { min: 1, max: n * n };
}

export function clampLevel(n: number, max = 5): number {
	const v = Math.round(Number.isFinite(n) ? n : Math.ceil(max / 2));
	return Math.min(max, Math.max(1, v));
}

// Stufe auf eine andere Stufenzahl umrechnen (gleiche Lage, ganzzahlig)
export function rescaleLevel(v: number, from: number, to: number): number {
	if (from === to || from < 2) return clampLevel(v, to);
	return clampLevel(
		1 + ((clampLevel(v, from) - 1) * (to - 1)) / (from - 1),
		to,
	);
}

// Wert einer Bewertung: Summe, Produkt bzw. bei matrix die Nummer der
// Klasse im Feld (1 = erste Klasse); classify ordnet ihn der Klasse zu.
export function aggregate(
	likelihood: number,
	impact: number,
	method: ScoreBasis,
): number {
	const n = levelCount(method);
	const l = clampLevel(likelihood, n);
	const i = clampLevel(impact, n);
	if (method.aggregation === "matrix") {
		const key = method.matrix?.[l - 1]?.[i - 1];
		const idx = method.classes?.findIndex((c) => c.key === key) ?? -1;
		return idx >= 0 ? idx + 1 : 1;
	}
	return method.aggregation === "sum" ? l + i : l * i;
}

export type ClassResult = {
	key: string;
	label: string;
	zone: RiskZone;
	meaning: string;
	index: number;
	acceptance?: RiskAcceptanceStep[];
};

// Freigabestufen für die Akzeptanz eines Risikos dieser Klasse (B4):
// null = bisheriges Verhalten (Workflow nur über dem Appetit), [] = die
// verantwortliche Person akzeptiert allein, sonst Stufe für Stufe.
export function acceptanceSteps(
	cls: Pick<ClassResult, "acceptance">,
	slaDays = 5,
): { order: number; approverRule: string; slaDays: number }[] | null {
	if (!cls.acceptance) return null;
	return cls.acceptance.map((f, i) => ({
		order: i + 1,
		approverRule: `function:${f}`,
		slaDays,
	}));
}

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
		acceptance: c?.acceptance,
	};
}

// Schadenshöhe aus den Einzelwerten: höchste aktive Schadensart zählt.
export function damageFrom(
	detail: Record<string, number> | null | undefined,
	method: Pick<RiskMethod, "dimensions"> & { likelihood?: readonly unknown[] },
): number | null {
	if (!detail) return null;
	const n = levelCount(method);
	let max: number | null = null;
	for (const d of method.dimensions) {
		if (!d.enabled) continue;
		const v = detail[d.key];
		if (typeof v !== "number" || !Number.isFinite(v)) continue;
		const c = clampLevel(v, n);
		if (max === null || c > max) max = c;
	}
	return max;
}

// Welche Schadensart bestimmt den Wert (für „höchster Wert zählt: … wegen …“)
export function decisiveDimensions(
	detail: Record<string, number> | null | undefined,
	method: Pick<RiskMethod, "dimensions"> & { likelihood?: readonly unknown[] },
): RiskDimension[] {
	const max = damageFrom(detail, method);
	if (max === null || !detail) return [];
	const n = levelCount(method);
	return method.dimensions.filter(
		(d) => d.enabled && clampLevel(detail[d.key] ?? 0, n) === max,
	);
}

// Appetit für Altcode/Notifications: höchste Grenze je Zone.
export function appetiteFromMethod(
	method: Pick<RiskMethod, "classes" | "aggregation"> & ScoreBasis,
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
	| "no_dimension"
	| "level_count"
	| "matrix_invalid";

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
	// Stufen: vier oder fünf, gleich viele auf jeder Achse und je Schadensart
	const n = method.likelihood.length;
	if (
		(n !== 4 && n !== 5) ||
		method.impact.length !== n ||
		method.dimensions.some((d) => d.anchors.length !== n)
	)
		issues.add("level_count");
	if (method.aggregation === "matrix") {
		const keys = new Set(cls.map((c) => c.key));
		const m = method.matrix;
		if (
			!m ||
			m.length !== n ||
			m.some((row) => row.length !== n || row.some((k) => !keys.has(k)))
		)
			issues.add("matrix_invalid");
	}
	return [...issues];
}

// Klassen beim Wechsel des Rechenwegs auf den neuen Wertebereich strecken
// (gleiche Anteile, ganzzahlig, lückenlos).
export function rescaleClasses(
	classes: readonly RiskClass[],
	from: ScoreBasis,
	to: ScoreBasis,
): RiskClass[] {
	if (to.aggregation === "matrix")
		return classes.map((c, i) => ({ ...c, min: i + 1, max: i + 1 }));
	const a = scoreRange({ ...from, classes });
	const b = scoreRange({ ...to, classes });
	if (a.min === b.min && a.max === b.max) return classes.map((c) => ({ ...c }));
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
		const nf = levelCount(from);
		const nt = levelCount(to);
		const b = classify(
			aggregate(rescaleLevel(l, nf, nt), rescaleLevel(i, nf, nt), to),
			to,
		);
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

// Bewertungen eines Risikos auf eine neue Stufenzahl umrechnen (beim
// Wechsel der Methode, z. B. von fünf auf vier Stufen)
export function rescaleRiskValues<
	T extends {
		likelihood: number;
		impact: number;
		residualLikelihood?: number | null;
		residualImpact?: number | null;
		impactDetail?: Record<string, number> | null;
	},
>(risk: T, from: number, to: number): T {
	if (from === to) return risk;
	const r = (v: number) => rescaleLevel(v, from, to);
	return {
		...risk,
		likelihood: r(risk.likelihood),
		impact: r(risk.impact),
		residualLikelihood:
			risk.residualLikelihood == null
				? risk.residualLikelihood
				: r(risk.residualLikelihood),
		residualImpact:
			risk.residualImpact == null
				? risk.residualImpact
				: r(risk.residualImpact),
		impactDetail: risk.impactDetail
			? Object.fromEntries(
					Object.entries(risk.impactDetail).map(([k, v]) => [k, r(v)]),
				)
			: risk.impactDetail,
	};
}

// Eingaben auf die Stufen der Methode begrenzen (Formulare bieten nur 1 … n,
// das hier fängt alte Werte und fremde Aufrufe ab). Nur gesetzte Felder.
export function fitLevels<
	T extends {
		likelihood?: number;
		impact?: number;
		residualLikelihood?: number | null;
		residualImpact?: number | null;
	},
>(values: T, method: { likelihood?: readonly unknown[] }): Partial<T> {
	const n = levelCount(method);
	const out: Partial<T> = {};
	for (const k of [
		"likelihood",
		"impact",
		"residualLikelihood",
		"residualImpact",
	] as const) {
		const v = values[k];
		if (typeof v === "number")
			(out as Record<string, number>)[k] = clampLevel(v, n);
	}
	return out;
}

// Anzeige einer Bewertung: „12 · hoch“, bei der Matrix nur „hoch“
export function pointLabel(
	p: { score: number; cls: { label: string } },
	method: Pick<RiskMethod, "aggregation">,
): string {
	return method.aggregation === "matrix"
		? p.cls.label
		: `${p.score} · ${p.cls.label}`;
}
