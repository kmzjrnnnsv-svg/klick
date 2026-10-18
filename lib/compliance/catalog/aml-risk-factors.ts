// Risikofaktoren für die unternehmensweite Geldwäsche-Risikoanalyse
// (§ 5 GwG / Art. 10 AMLR) je Dimension: erhöhend (Anlage 2 GwG, AMLR
// Anhang III, Leitlinien der EBA zu Risikofaktoren) oder mindernd (Anlage 1
// GwG, AMLR Anhang II), dazu Krypto-, Travel-Rule- und Sanktionsfaktoren.
// Nach Modellwissen zusammengestellt — mit der/dem Geldwäschebeauftragten
// und den aktuellen Leitlinien abgleichen.

export type AmlDimensionKey = "customer" | "product" | "country" | "channel";

export type AmlFactor = {
	code: string;
	dimension: AmlDimensionKey;
	direction: "higher" | "lower";
	// 2 = starker Faktor (z. B. Hochrisikoland, Sanktionsbezug, PEP)
	weight: 1 | 2;
	text: string;
	source: string;
	// leer = immer; sonst genügt eines
	frameworks?: readonly string[];
};

const CRYPTO = ["micar", "tfr"] as const;

export const AML_FACTORS: readonly AmlFactor[] = [
	// ── Kunden ──
	{
		code: "AF-C-01",
		dimension: "customer",
		direction: "higher",
		weight: 2,
		text: "Politisch exponierte Personen (PEP), Familienangehörige oder bekanntermaßen nahestehende Personen",
		source: "§ 15 Abs. 3 Nr. 1 GwG · Art. 42 AMLR",
	},
	{
		code: "AF-C-02",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Komplexe oder undurchsichtige Eigentums- und Kontrollstrukturen",
		source: "Anlage 2 Nr. 1 e GwG",
	},
	{
		code: "AF-C-03",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Gesellschaften mit nominellen Anteilseignern oder Inhaberaktien",
		source: "Anlage 2 Nr. 1 c GwG",
	},
	{
		code: "AF-C-04",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Rechtsgestaltungen zur privaten Vermögensverwaltung (Trusts, Stiftungen)",
		source: "Anlage 2 Nr. 1 b GwG",
	},
	{
		code: "AF-C-05",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Bargeldintensive Unternehmen oder Branchen mit erhöhtem Risiko (Glücksspiel, Edelmetalle, Waffen)",
		source: "Anlage 2 Nr. 1 d GwG",
	},
	{
		code: "AF-C-06",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Ungewöhnliche Umstände der Geschäftsbeziehung (Zweck unklar, Verhalten passt nicht zum Profil)",
		source: "Anlage 2 Nr. 1 a GwG",
	},
	{
		code: "AF-C-07",
		dimension: "customer",
		direction: "higher",
		weight: 1,
		text: "Kryptowerte unklarer Herkunft oder hohe Einzahlungen kurz nach Eröffnung",
		source: "EBA-Leitlinien Risikofaktoren, Titel II (Krypto-Dienstleister)",
		frameworks: CRYPTO,
	},
	{
		code: "AF-C-08",
		dimension: "customer",
		direction: "lower",
		weight: 1,
		text: "Börsennotierte Unternehmen mit Offenlegungspflichten",
		source: "Anlage 1 Nr. 1 a GwG",
	},
	{
		code: "AF-C-09",
		dimension: "customer",
		direction: "lower",
		weight: 1,
		text: "Öffentliche Verwaltungen oder Unternehmen in öffentlicher Hand",
		source: "Anlage 1 Nr. 1 b GwG",
	},
	{
		code: "AF-C-10",
		dimension: "customer",
		direction: "lower",
		weight: 1,
		text: "Überwiegend Privatkunden mit Wohnsitz in Ländern mit geringem Risiko",
		source: "Anlage 1 Nr. 1 c GwG",
	},
	// ── Produkte / Transaktionen ──
	{
		code: "AF-P-01",
		dimension: "product",
		direction: "higher",
		weight: 2,
		text: "Produkte oder Transaktionen, die Anonymität begünstigen",
		source: "Anlage 2 Nr. 2 b GwG",
	},
	{
		code: "AF-P-02",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Zahlungen von unbekannten oder nicht verbundenen Dritten",
		source: "Anlage 2 Nr. 2 d GwG",
	},
	{
		code: "AF-P-03",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Neue Produkte, Vertriebswege oder Technologien",
		source: "Anlage 2 Nr. 2 e GwG",
	},
	{
		code: "AF-P-04",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Hohe Beträge, schnelle Abfolge oder grenzüberschreitende Transfers ohne Betragsgrenzen",
		source: "EBA-Leitlinien Risikofaktoren",
	},
	{
		code: "AF-P-05",
		dimension: "product",
		direction: "higher",
		weight: 2,
		text: "Annahme von Privacy Coins oder Kryptowerten mit Mixer- oder Darknet-Bezug",
		source: "EBA-Leitlinien Titel II · FATF-Leitfaden virtuelle Vermögenswerte",
		frameworks: CRYPTO,
	},
	{
		code: "AF-P-06",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Transfers von und an selbst gehostete Adressen",
		source: "Art. 14 Abs. 5, Art. 16 Abs. 2 TFR",
		frameworks: CRYPTO,
	},
	{
		code: "AF-P-07",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Interaktion mit DeFi-Protokollen, Bridges oder Peer-to-Peer-Handel",
		source: "EBA-Leitlinien Titel II",
		frameworks: CRYPTO,
	},
	{
		code: "AF-P-08",
		dimension: "product",
		direction: "higher",
		weight: 1,
		text: "Umtausch zwischen Kryptowerten und Fiat (On-/Off-Ramp) ohne Herkunftsprüfung",
		source: "EBA-Leitlinien Titel II",
		frameworks: CRYPTO,
	},
	{
		code: "AF-P-09",
		dimension: "product",
		direction: "lower",
		weight: 1,
		text: "Betragsgrenzen je Transaktion und Monat (z. B. E-Geld mit niedrigen Limits)",
		source: "Anlage 1 Nr. 2 GwG · § 25i KWG",
	},
	{
		code: "AF-P-10",
		dimension: "product",
		direction: "lower",
		weight: 1,
		text: "Einzahlungen nur von Konten des Kunden bei EU-Kreditinstituten",
		source: "Anlage 1 Nr. 2 GwG",
	},
	// ── Länder ──
	{
		code: "AF-L-01",
		dimension: "country",
		direction: "higher",
		weight: 2,
		text: "Bezug zu Drittstaaten mit hohem Risiko (EU-Liste, FATF „Call for Action“/„Increased Monitoring“)",
		source: "§ 15 Abs. 3 Nr. 2 GwG · Delegierte VO (EU) 2016/1675",
	},
	{
		code: "AF-L-02",
		dimension: "country",
		direction: "higher",
		weight: 2,
		text: "Bezug zu Ländern oder Personen unter Sanktionen oder Embargo",
		source: "EU-Sanktionsverordnungen · AWG/AWV",
		frameworks: ["sanctions", "gwg", "amlr"],
	},
	{
		code: "AF-L-03",
		dimension: "country",
		direction: "higher",
		weight: 1,
		text: "Länder mit hoher Korruption oder schwacher Aufsicht",
		source: "Anlage 2 Nr. 3 GwG",
	},
	{
		code: "AF-L-04",
		dimension: "country",
		direction: "higher",
		weight: 1,
		text: "Länder mit Bezug zu Terrorismusfinanzierung oder Offshore-Zentren",
		source: "Anlage 2 Nr. 3 GwG",
	},
	{
		code: "AF-L-05",
		dimension: "country",
		direction: "lower",
		weight: 1,
		text: "Geschäft überwiegend in EU-Mitgliedstaaten",
		source: "Anlage 1 Nr. 3 a GwG",
	},
	{
		code: "AF-L-06",
		dimension: "country",
		direction: "lower",
		weight: 1,
		text: "Drittstaaten mit wirksamen Systemen gegen Geldwäsche",
		source: "Anlage 1 Nr. 3 b GwG",
	},
	// ── Vertriebswege ──
	{
		code: "AF-V-01",
		dimension: "channel",
		direction: "higher",
		weight: 2,
		text: "Geschäftsbeziehung ohne persönlichen Kontakt und ohne sichere Identifizierung (eID, Video-Ident, QES)",
		source: "Anlage 2 Nr. 2 c GwG",
	},
	{
		code: "AF-V-02",
		dimension: "channel",
		direction: "higher",
		weight: 1,
		text: "Vertrieb über Vermittler, Agenten oder Partner (Introducer)",
		source: "EBA-Leitlinien Risikofaktoren · § 17 GwG",
	},
	{
		code: "AF-V-03",
		dimension: "channel",
		direction: "higher",
		weight: 1,
		text: "Vollständig digitale Kanäle ohne Gerätebindung oder mit API-Zugang für Dritte",
		source: "EBA-Leitlinien Risikofaktoren",
	},
	{
		code: "AF-V-04",
		dimension: "channel",
		direction: "lower",
		weight: 1,
		text: "Identifizierung mit eID, qualifizierter Signatur oder vor Ort",
		source: "§ 12 GwG · GwG-Leitfaden",
	},
	{
		code: "AF-V-05",
		dimension: "channel",
		direction: "lower",
		weight: 1,
		text: "Kunden kommen über regulierte Partner in der EU",
		source: "§ 17 GwG",
	},
];

export const AML_FACTOR_BY_CODE = new Map(AML_FACTORS.map((f) => [f.code, f]));

export function applicableAmlFactors(
	frameworks: readonly string[],
): AmlFactor[] {
	const set = new Set(frameworks);
	return AML_FACTORS.filter(
		(f) => !f.frameworks || f.frameworks.some((x) => set.has(x)),
	);
}

export const AML_SCORE_LABELS = [
	"gering",
	"eher gering",
	"mittel",
	"erhöht",
	"hoch",
] as const;

// Vorschlag je Dimension: Ausgangswert 2, jeder erhöhende Faktor +Gewicht,
// mindernde Faktoren zusammen höchstens −1; ein starker Faktor hebt auf
// mindestens 4. Die Entscheidung bleibt bei der Person, die bewertet.
export function suggestDimensionScore(
	dimension: AmlDimensionKey,
	codes: readonly string[],
): { score: number; higher: AmlFactor[]; lower: AmlFactor[] } {
	const ticked = codes
		.map((c) => AML_FACTOR_BY_CODE.get(c))
		.filter((f): f is AmlFactor => Boolean(f) && f?.dimension === dimension);
	const higher = ticked.filter((f) => f.direction === "higher");
	const lower = ticked.filter((f) => f.direction === "lower");
	let score = 2 + higher.reduce((s, f) => s + f.weight, 0);
	if (lower.length > 0) score -= 1;
	if (higher.some((f) => f.weight === 2)) score = Math.max(score, 4);
	return { score: Math.min(5, Math.max(1, score)), higher, lower };
}
