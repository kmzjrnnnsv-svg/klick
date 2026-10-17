import type { FindingSeverity } from "@/db/schema/enums";

// CVSS für manuell erfasste Befunde — rein.
//   • v3.1: Basiswert nach der Spezifikation von FIRST (Abschnitt 7.1,
//     Formeln und Gewichte), Rundung mit „Roundup“ aus Anhang A.
//   • v4.0: nur Form und Pflichtmetriken prüfen. Der Basiswert hängt an der
//     Makrovektor-Tabelle des Referenzrechners; den Wert trägt die Person aus
//     ihrem Bericht ein (keine nachgebaute Tabelle).
// Schwere nach der qualitativen Skala (0 / 0,1–3,9 / 4–6,9 / 7–8,9 / 9–10).

type Parsed31 = {
	AV: "N" | "A" | "L" | "P";
	AC: "L" | "H";
	PR: "N" | "L" | "H";
	UI: "N" | "R";
	S: "U" | "C";
	C: "N" | "L" | "H";
	I: "N" | "L" | "H";
	A: "N" | "L" | "H";
};

const V31_ALLOWED: Record<keyof Parsed31, readonly string[]> = {
	AV: ["N", "A", "L", "P"],
	AC: ["L", "H"],
	PR: ["N", "L", "H"],
	UI: ["N", "R"],
	S: ["U", "C"],
	C: ["N", "L", "H"],
	I: ["N", "L", "H"],
	A: ["N", "L", "H"],
};

// Zeitliche/Umgebungsmetriken sind erlaubt, fließen aber nicht in den
// Basiswert.
const V31_OPTIONAL = new Set([
	"E",
	"RL",
	"RC",
	"CR",
	"IR",
	"AR",
	"MAV",
	"MAC",
	"MPR",
	"MUI",
	"MS",
	"MC",
	"MI",
	"MA",
]);

const V40_REQUIRED: Record<string, readonly string[]> = {
	AV: ["N", "A", "L", "P"],
	AC: ["L", "H"],
	AT: ["N", "P"],
	PR: ["N", "L", "H"],
	UI: ["N", "P", "A"],
	VC: ["H", "L", "N"],
	VI: ["H", "L", "N"],
	VA: ["H", "L", "N"],
	SC: ["H", "L", "N"],
	SI: ["H", "L", "N"],
	SA: ["H", "L", "N"],
};

export type CvssParse =
	| { ok: true; version: "3.1"; vector: string; score: number }
	| { ok: true; version: "4.0"; vector: string; score: null }
	| { ok: false; error: "cvss_format" | "cvss_metric" | "cvss_missing" };

function metrics(body: string): Map<string, string> | null {
	const out = new Map<string, string>();
	for (const part of body.split("/")) {
		const [k, v, rest] = part.split(":");
		if (!k || !v || rest !== undefined || out.has(k)) return null;
		out.set(k, v);
	}
	return out;
}

// Roundup aus Anhang A der v3.1-Spezifikation (vermeidet Gleitkomma-Fehler).
export function roundUp1(x: number): number {
	const i = Math.round(x * 100_000);
	return i % 10_000 === 0 ? i / 100_000 : (Math.floor(i / 10_000) + 1) / 10;
}

function score31(m: Parsed31): number {
	const cia = { H: 0.56, L: 0.22, N: 0 } as const;
	const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[m.AV];
	const ac = { L: 0.77, H: 0.44 }[m.AC];
	const changed = m.S === "C";
	const pr = (
		changed ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 }
	)[m.PR];
	const ui = { N: 0.85, R: 0.62 }[m.UI];
	const iss = 1 - (1 - cia[m.C]) * (1 - cia[m.I]) * (1 - cia[m.A]);
	const impact = changed
		? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
		: 6.42 * iss;
	const exploitability = 8.22 * av * ac * pr * ui;
	if (impact <= 0) return 0;
	return changed
		? roundUp1(Math.min(1.08 * (impact + exploitability), 10))
		: roundUp1(Math.min(impact + exploitability, 10));
}

export function parseCvss(input: string): CvssParse {
	const vector = input.trim();
	const m = /^CVSS:(3\.1|4\.0)\/(.+)$/.exec(vector);
	if (!m?.[2]) return { ok: false, error: "cvss_format" };
	const map = metrics(m[2]);
	if (!map) return { ok: false, error: "cvss_format" };
	if (m[1] === "3.1") {
		for (const [k, allowed] of Object.entries(V31_ALLOWED)) {
			const v = map.get(k);
			if (!v) return { ok: false, error: "cvss_missing" };
			if (!allowed.includes(v)) return { ok: false, error: "cvss_metric" };
		}
		for (const k of map.keys())
			if (!(k in V31_ALLOWED) && !V31_OPTIONAL.has(k))
				return { ok: false, error: "cvss_metric" };
		return {
			ok: true,
			version: "3.1",
			vector,
			score: score31(Object.fromEntries(map) as Parsed31),
		};
	}
	for (const [k, allowed] of Object.entries(V40_REQUIRED)) {
		const v = map.get(k);
		if (!v) return { ok: false, error: "cvss_missing" };
		if (!allowed.includes(v)) return { ok: false, error: "cvss_metric" };
	}
	return { ok: true, version: "4.0", vector, score: null };
}

export function severityFromScore(score: number): FindingSeverity {
	if (score >= 9) return "critical";
	if (score >= 7) return "high";
	if (score >= 4) return "medium";
	if (score > 0) return "low";
	return "info";
}
