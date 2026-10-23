// Parameter aus Anforderungstexten (Nachweis-Werkstatt, pure): Intervalle,
// Fristen und Aufbewahrung lesen, je Control die strengste Vorgabe bestimmen
// und Widersprüche erkennen. Abgeleitet aus dem Text — der Katalog kann
// `params` kuratiert vorgeben, die dann Vorrang haben. Ergebnisse sind
// Hinweise für die Bearbeitung, keine Rechtsauslegung.

export type ParamType = "interval" | "deadline" | "retention" | "deletion";

export type IntervalSubject = "review" | "test" | "report" | "training";
export type DeadlineSubject =
	| "early_warning"
	| "initial"
	| "intermediate"
	| "final"
	| "notification"
	| "documentation"
	| "remediation"
	| "other";

export type Param =
	| {
			type: "interval";
			subject: IntervalSubject;
			months: number;
			quote: string;
	  }
	| {
			type: "deadline";
			subject: DeadlineSubject;
			hours: number;
			// Arbeits-/Werktage sind nur näherungsweise in Stunden vergleichbar
			approx: boolean;
			quote: string;
	  }
	| { type: "retention"; years: number; quote: string }
	| { type: "deletion"; quote: string };

export type SourcedParam = Param & { source: string };

const NUM: Record<string, number> = {
	ein: 1,
	einen: 1,
	einem: 1,
	zwei: 2,
	drei: 3,
	vier: 4,
	fünf: 5,
	sechs: 6,
	sieben: 7,
	zehn: 10,
	zwölf: 12,
};
const num = (s: string): number =>
	/^\d+$/.test(s) ? Number(s) : (NUM[s.toLowerCase()] ?? Number.NaN);

const N = String.raw`(\d+|ein|einen|einem|zwei|drei|vier|fünf|sechs|sieben|zehn|zwölf)`;

// Sätze (Fristen) und Teilsätze (Intervalle): „quartalsweise, aller anderen
// mindestens jährlich“ sind zwei Intervalle in einem Satz.
const sentences = (text: string): string[] =>
	text
		.split(/(?<=[.;])\s+|\s+‖\s+|\n+/)
		.map((c) => c.trim())
		.filter((c) => c.length > 2);
const clausesOf = (sentence: string): string[] =>
	sentence
		.split(/\s*[,(]\s*/)
		.map((c) => c.trim())
		.filter((c) => c.length > 2);

function intervalSubject(c: string): IntervalSubject {
	if (/schul/i.test(c)) return "training";
	if (/test|übung|üben|restore|wiederanlauf/i.test(c)) return "test";
	if (/bericht|vorleg|übermitt|meld|report/i.test(c)) return "report";
	return "review";
}

function deadlineSubject(c: string): DeadlineSubject | null {
	if (/frühwarnung/i.test(c)) return "early_warning";
	if (/erstmeldung|erste meldung|erstbewertung/i.test(c)) return "initial";
	if (/zwischen/i.test(c)) return "intermediate";
	if (/abschluss/i.test(c)) return "final";
	if (/patch|schwachstell|kritisch|hoch\b/i.test(c)) return "remediation";
	if (/dokumentier/i.test(c)) return "documentation";
	if (/meld|anzeig|übermitt|liefer/i.test(c)) return "notification";
	return null;
}

const INTERVALS: { re: RegExp; months: (m: RegExpMatchArray) => number }[] = [
	{ re: /halbjährlich|alle (6|sechs) monate/i, months: () => 6 },
	{
		re: /vierteljährlich|quartalsweise|pro quartal|je quartal/i,
		months: () => 3,
	},
	{ re: /\bmonatlich/i, months: () => 1 },
	{
		re: new RegExp(String.raw`alle ${N} jahre`, "i"),
		months: (m) => 12 * num(m[1] ?? ""),
	},
	{
		re: new RegExp(String.raw`alle ${N} monate`, "i"),
		months: (m) => num(m[1] ?? ""),
	},
	{
		re: /(?<![a-zäöü])jährlich|pro jahr|einmal im jahr|alle 12 monate/i,
		months: () => 12,
	},
];

const UNIT_HOURS: { re: RegExp; hours: number; approx: boolean }[] = [
	{ re: /^(stunden?|h)$/i, hours: 1, approx: false },
	{ re: /^(kalender)?tag(e|en)?$/i, hours: 24, approx: false },
	{ re: /^(arbeits|werk|bank)tag(e|en)?$/i, hours: 24, approx: true },
	{ re: /^wochen?$/i, hours: 168, approx: false },
	{ re: /^monat(e|en)?$/i, hours: 720, approx: true },
];

const DEADLINE = new RegExp(
	String.raw`${N}\s*(stunden|stunde|h|kalendertagen|kalendertage|tagen|tage|tag|arbeitstagen|arbeitstage|werktagen|werktage|banktagen|wochen|woche|monaten|monate|monat)\b`,
	"gi",
);
const DEADLINE_CONTEXT =
	/spätestens|binnen|innerhalb|nach (kenntnis|einstufung|abgabe|bekanntwerden|eintritt)|frist|meld|frühwarnung|abschluss|kritisch|hoch/i;

export function extractParams(text: string): Param[] {
	const out: Param[] = [];
	for (const sentence of sentences(text)) {
		for (const c of clausesOf(sentence)) {
			const quote = c.slice(0, 160);
			for (const { re, months } of INTERVALS) {
				const m = c.match(re);
				if (!m) continue;
				const v = months(m);
				if (Number.isFinite(v) && v > 0)
					out.push({
						type: "interval",
						subject: intervalSubject(c),
						months: v,
						quote,
					});
				break;
			}
			if (/aufbewahr|aufzubewahr|archivier|vorzuhalten|vorhalten/i.test(c)) {
				const m = c.match(new RegExp(String.raw`${N}\s*jahre?n?\b`, "i"));
				const y = m ? num(m[1] ?? "") : Number.NaN;
				if (Number.isFinite(y) && y > 0)
					out.push({ type: "retention", years: y, quote });
			}
			if (
				/lösch/i.test(c) &&
				/unverzüglich|sobald|nicht mehr erforderlich|frist/i.test(c)
			)
				out.push({ type: "deletion", quote });
		}
		// Fristen: Thema aus dem Text seit der vorigen Frist; ohne eigenes
		// Stichwort gilt das vorige („Erstmeldung 4 h …, 24 h nach Kenntnis“)
		if (
			!DEADLINE_CONTEXT.test(sentence) ||
			/aufbewahr|aufzubewahr|archiv/i.test(sentence)
		)
			continue;
		let from = 0;
		let last: DeadlineSubject = "other";
		for (const m of sentence.matchAll(DEADLINE)) {
			const start = m.index ?? 0;
			const end = start + m[0].length;
			// Schwellen („Ausfallzeit über 2 h“) sind keine Fristen
			if (
				/(über|mehr als|ab|bis zu|unter|weniger als)\s*$/i.test(
					sentence.slice(Math.max(0, start - 14), start),
				)
			) {
				from = end;
				continue;
			}
			const n = num(m[1] ?? "");
			const unit = UNIT_HOURS.find((u) => u.re.test(m[2] ?? ""));
			// Thema: davor seit der vorigen Frist, sonst im Rest des Teilsatzes
			// („binnen 72 Stunden … gemeldet“), sonst wie die vorige Frist
			const after = sentence.slice(end).split(/[,;(]/)[0] ?? "";
			const subject: DeadlineSubject =
				deadlineSubject(sentence.slice(from, end)) ??
				deadlineSubject(after) ??
				last;
			from = end;
			last = subject;
			if (!unit || !Number.isFinite(n) || n <= 0) continue;
			out.push({
				type: "deadline",
				subject,
				hours: n * unit.hours,
				approx: unit.approx,
				quote: sentence.slice(Math.max(0, (m.index ?? 0) - 60), end + 40),
			});
		}
	}
	return out;
}

// Herkunft: Anforderungsschlüssel „dora:Art.19“ oder „control:CC-INC-03“
export const frameworkOfSource = (source: string): string =>
	source.startsWith("control:")
		? "control"
		: source.slice(0, source.indexOf(":"));

export type ParamTopic = `${"interval" | "deadline"}:${string}` | "retention";

export const topicOf = (p: Param): ParamTopic | null =>
	p.type === "interval"
		? `interval:${p.subject}`
		: p.type === "deadline"
			? `deadline:${p.subject}`
			: p.type === "retention"
				? "retention"
				: null;

// Vergleichswert: kleiner = strenger (Aufbewahrung: länger = strenger)
export const strictness = (p: Param): number =>
	p.type === "interval"
		? p.months
		: p.type === "deadline"
			? p.hours
			: p.type === "retention"
				? -p.years
				: 0;

// Jedes Rahmenwerk behält seine eigene Vorgabe — DORA 4 h an die BaFin und
// NIS2 24 h an das BSI sind zwei Pflichten, keine, die sich gegenseitig
// ersetzt. Je Thema: Werte je Rahmenwerk (ohne Dubletten), `differs` wenn
// die Rahmenwerke Unterschiedliches verlangen (Hinweis, kein Fehler).
export type ParamRow = {
	topic: ParamTopic;
	perFramework: { framework: string; params: SourcedParam[] }[];
	differs: boolean;
};

export function paramTable(params: readonly SourcedParam[]): ParamRow[] {
	const rows = new Map<ParamTopic, Map<string, SourcedParam[]>>();
	for (const p of params) {
		const topic = topicOf(p);
		if (!topic) continue;
		const byFw = rows.get(topic) ?? new Map<string, SourcedParam[]>();
		const fw = frameworkOfSource(p.source);
		const list = byFw.get(fw) ?? [];
		if (!list.some((q) => strictness(q) === strictness(p))) list.push(p);
		byFw.set(fw, list);
		rows.set(topic, byFw);
	}
	return [...rows.entries()].map(([topic, byFw]) => {
		const perFramework = [...byFw.entries()]
			.map(([framework, list]) => ({
				framework,
				params: [...list].sort((a, b) => strictness(a) - strictness(b)),
			}))
			.sort((a, b) => a.framework.localeCompare(b.framework));
		const values = new Set(
			perFramework.flatMap((f) => f.params.map((p) => strictness(p))),
		);
		return {
			topic,
			perFramework,
			differs: perFramework.length > 1 && values.size > 1,
		};
	});
}

// Eigene Gestaltung je Rahmenwerk und Thema (z. B. interne Frist 2 h für
// DORA-Erstmeldungen). Gespeichert je Control; geprüft wird gegen die
// strengste Vorgabe *dieses* Rahmenwerks.
export type OwnSetting = {
	framework: string;
	topic: ParamTopic;
	// Monate (Intervall), Stunden (Frist) oder Jahre (Aufbewahrung)
	value: number;
};

export type ParamFinding =
	| {
			kind: "violation";
			framework: string;
			topic: ParamTopic;
			own: number;
			required: SourcedParam;
	  }
	| {
			kind: "conflict";
			type: "retention_vs_deletion";
			params: SourcedParam[];
			hint: string;
	  };

const ownStrictness = (topic: ParamTopic, value: number) =>
	topic === "retention" ? -value : value;

export function paramFindings(
	params: readonly SourcedParam[],
	own: readonly OwnSetting[] = [],
): ParamFinding[] {
	const findings: ParamFinding[] = [];
	const table = paramTable(params);
	for (const o of own) {
		const row = table.find((r) => r.topic === o.topic);
		const required = row?.perFramework.find((f) => f.framework === o.framework)
			?.params[0];
		if (required && ownStrictness(o.topic, o.value) > strictness(required))
			findings.push({
				kind: "violation",
				framework: o.framework,
				topic: o.topic,
				own: o.value,
				required,
			});
	}
	const retention = params.filter((p) => p.type === "retention");
	const deletion = params.filter((p) => p.type === "deletion");
	if (retention.length > 0 && deletion.length > 0)
		findings.push({
			kind: "conflict",
			type: "retention_vs_deletion",
			params: [...retention, ...deletion],
			hint: "Aufbewahrungspflicht und Löschpflicht treffen aufeinander: Daten bis zum Ende der Aufbewahrungsfrist sperren statt löschen (Art. 17 Abs. 3 lit. b DSGVO), danach löschen – im Löschkonzept je Datenart festhalten (prüfen).",
		});
	return findings;
}

// Eigene Einstellung in Monaten (Prüfzyklus eines Dokuments, Gültigkeit
// eines Nachweises) gegen die Vorgabe eines Rahmenwerks.
export function exceedsInterval(
	ownMonths: number | null | undefined,
	required: SourcedParam | undefined,
): boolean {
	return (
		required?.type === "interval" &&
		typeof ownMonths === "number" &&
		ownMonths > required.months
	);
}

export function formatParam(p: Param): string {
	switch (p.type) {
		case "interval":
			return p.months === 12
				? "jährlich"
				: p.months === 6
					? "halbjährlich"
					: p.months === 3
						? "vierteljährlich"
						: p.months === 1
							? "monatlich"
							: p.months % 12 === 0
								? `alle ${p.months / 12} Jahre`
								: `alle ${p.months} Monate`;
		case "deadline":
			if (p.hours >= 720 && p.hours % 720 === 0)
				return p.hours === 720 ? "1 Monat" : `${p.hours / 720} Monate`;
			return p.hours < 48 || p.hours % 24 !== 0
				? `${p.hours} h`
				: `${p.hours / 24}${p.approx ? " Arbeitstage" : " Tage"}`;
		case "retention":
			return `${p.years} Jahre aufbewahren`;
		case "deletion":
			return "löschen, sobald nicht mehr erforderlich";
	}
}

// Parameter einer Anforderung: kuratiert vor abgeleitet
export function requirementParams(
	r: {
		requirementText: string;
		guidance?: string;
		evidenceHints?: string[];
		params?: Param[];
	},
	source: string,
): SourcedParam[] {
	const list =
		r.params ??
		extractParams(
			[r.requirementText, r.guidance ?? "", ...(r.evidenceHints ?? [])].join(
				"\n",
			),
		);
	return list.map((p) => ({ ...p, source }));
}
