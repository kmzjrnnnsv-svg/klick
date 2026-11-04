import type {
	BcmPlanContent,
	ExerciseParticipant,
	ExerciseScriptStep,
} from "@/db/schema/bcm";
import type { ExerciseKind } from "@/db/schema/enums";

// Notfallübungen (BSI 200-4 Kap. 9, ISO 22301 8.5, DORA Art. 11 Abs. 6 und
// Art. 24/25): Drehbuch aus dem Notfallplan, Ergebnis aus der Messung gegen
// RTO/RPO. Pure, ohne Datenbank.

// Welches Control die Übung belegt: Wiederherstellungstest = Datensicherung,
// Umschalttest = Redundanz, sonst Notfallübungen. Alle zählen im
// Testprogramm als Notfallübung des Prozesses (Methode bcm_exercise).
export function exerciseControl(kind: ExerciseKind): string {
	if (kind === "restore_test") return "CC-BCM-03";
	if (kind === "failover") return "CC-BCM-04";
	return "CC-BCM-05";
}

// Übungen, bei denen etwas wirklich wiederhergestellt oder umgeschaltet
// wird: dort gehören gemessene Zeiten zum Ergebnis
export function measuresTime(kind: ExerciseKind): boolean {
	return kind !== "tabletop" && kind !== "walkthrough";
}

// Drehbuch aus dem Notfallplan: Sofortmaßnahmen, Alarmierung, Wiederanlauf
// mit Soll-Zeit (Minuten ab Beginn)
export function seedScript(
	plan: BcmPlanContent | null,
	whoLabel: (ref: string) => string,
): ExerciseScriptStep[] {
	if (!plan)
		return [
			step("Notfall ausrufen und Alarmierung starten", 15),
			step("Notbetrieb aufnehmen", null),
			step("Wiederanlauf durchführen und prüfen", null),
			step("Rückkehr zum Normalbetrieb", null),
		];
	return [
		...plan.immediate.map((x) => step(x.text, null)),
		...plan.alert.map((x) =>
			step(`${whoLabel(x.who)} alarmieren`, x.withinMinutes),
		),
		...plan.recovery.map((x) =>
			step(x.text, x.targetHours === null ? null : x.targetHours * 60),
		),
	];
}

function step(
	text: string,
	expectedMinutes: number | null,
): ExerciseScriptStep {
	return { text, expectedMinutes, actualMinutes: null, ok: null, note: "" };
}

export type ExerciseOutcome = {
	result: "pass" | "partial" | "fail";
	// null = nicht gemessen oder kein Ziel am Prozess
	rtoMet: boolean | null;
	rpoMet: boolean | null;
	stepsFailed: number;
	stepsLate: number;
	stepsOpen: number;
};

// Ergebnis: Ziel verfehlt (RTO oder RPO) = nicht bestanden; ein Schritt
// nicht in Ordnung, zu spät, offen oder Messung fehlt bei einem echten Test
// = teilweise; sonst bestanden
export function exerciseOutcome(
	kind: ExerciseKind,
	target: { rtoHours: number | null; rpoHours: number | null },
	measured: { recoveryMinutes: number | null; dataLossMinutes: number | null },
	script: readonly ExerciseScriptStep[],
): ExerciseOutcome {
	const rtoMet =
		target.rtoHours === null || measured.recoveryMinutes === null
			? null
			: measured.recoveryMinutes <= target.rtoHours * 60;
	const rpoMet =
		target.rpoHours === null || measured.dataLossMinutes === null
			? null
			: measured.dataLossMinutes <= target.rpoHours * 60;
	const stepsFailed = script.filter((s) => s.ok === false).length;
	const stepsOpen = script.filter((s) => s.ok === null).length;
	const stepsLate = script.filter(
		(s) =>
			s.expectedMinutes !== null &&
			s.actualMinutes !== null &&
			s.actualMinutes > s.expectedMinutes,
	).length;
	let result: ExerciseOutcome["result"] = "pass";
	if (rtoMet === false || rpoMet === false) result = "fail";
	else if (
		stepsFailed > 0 ||
		stepsLate > 0 ||
		stepsOpen > 0 ||
		(measuresTime(kind) &&
			target.rtoHours !== null &&
			measured.recoveryMinutes === null)
	)
		result = "partial";
	return { result, rtoMet, rpoMet, stepsFailed, stepsLate, stepsOpen };
}

const clip = (s: string, n: number) => s.trim().slice(0, n);
const minutes = (v: number | null) =>
	v === null || !Number.isFinite(v)
		? null
		: Math.min(525_600, Math.max(0, Math.round(v)));

// Bereinigen vor dem Speichern
export function normalizeExercise(e: {
	title: string;
	scenario: string;
	script: ExerciseScriptStep[];
	participants: ExerciseParticipant[];
	lessons: string;
	measures: string[];
	recoveryMinutes: number | null;
	dataLossMinutes: number | null;
}) {
	return {
		title: clip(e.title, 200) || "Notfallübung",
		scenario: clip(e.scenario, 4000),
		script: e.script
			.map((s) => ({
				text: clip(s.text, 300),
				expectedMinutes: minutes(s.expectedMinutes),
				actualMinutes: minutes(s.actualMinutes),
				ok: s.ok,
				note: clip(s.note, 500),
			}))
			.filter((s) => s.text)
			.slice(0, 60),
		participants: e.participants
			.map((p) => ({ who: clip(p.who, 120), role: clip(p.role, 120) }))
			.filter((p) => p.who)
			.slice(0, 60),
		lessons: clip(e.lessons, 4000),
		measures: e.measures
			.map((m) => clip(m, 300))
			.filter(Boolean)
			.slice(0, 30),
		recoveryMinutes: minutes(e.recoveryMinutes),
		dataLossMinutes: minutes(e.dataLossMinutes),
	};
}

// Dauer in Minuten lesbar: 45 Min., 2 h 30 Min., 3 Tage 4 h
export function formatMinutes(m: number): string {
	if (m < 60) return `${m} Min.`;
	const h = Math.floor(m / 60);
	const rest = m % 60;
	if (h < 24) return rest ? `${h} h ${rest} Min.` : `${h} h`;
	const d = Math.floor(h / 24);
	const hr = h % 24;
	return `${d} ${d === 1 ? "Tag" : "Tage"}${hr ? ` ${hr} h` : ""}`;
}
