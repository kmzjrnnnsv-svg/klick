import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type NonconformityStatus =
	| "open"
	| "in_progress"
	| "verified"
	| "closed";
export const NONCONFORMITY_STATUSES = [
	"open",
	"in_progress",
	"verified",
	"closed",
] as const;

// CAPA-Regelkreis: Korrektur → Korrekturmaßnahme → Wirksamkeitsprüfung
// („verified" nur mit Ergebnis) → Abschluss. Reopen immer mit Begründung.
export const NONCONFORMITY_STATUS: StatusMachine<NonconformityStatus> = {
	states: NONCONFORMITY_STATUSES,
	initial: "open",
	labelKey: {
		open: "ncOpen",
		in_progress: "ncInProgress",
		verified: "ncVerified",
		closed: "ncClosed",
	},
	tone: {
		open: "destructive",
		in_progress: "warning",
		verified: "default",
		closed: "muted",
	},
	transitions: transitions<NonconformityStatus>([
		["open", "in_progress", "startWork", undefined, true],
		["in_progress", "verified", "verifyNc", "note", true],
		["in_progress", "open", "reopen", "note"],
		["verified", "closed", "closeNc", undefined, true],
		["verified", "in_progress", "reopen", "note"],
		["closed", "open", "reopen", "note", true],
	]),
	done: ["closed"],
};

export const NONCONFORMITY_ENTITY: EntityDef<NonconformityStatus> = {
	kind: "nonconformity",
	route: "/abweichungen",
	i18nNamespace: "Nonconformities",
	statusMachine: NONCONFORMITY_STATUS,
};
