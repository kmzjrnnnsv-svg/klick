import { IMPL_STATUS, type ImplStatus } from "@/db/schema/enums";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

// Control-Umsetzungsstatus. „implemented" ≠ „wirksam" — Wirksamkeit messen
// control_tests (P2). Übergang auf not_applicable verlangt eine Begründung
// (SoA), zurück ebenso.
export const CONTROL_STATUS: StatusMachine<ImplStatus> = {
	states: IMPL_STATUS,
	initial: "not_started",
	labelKey: {
		not_started: "notStarted",
		planned: "planned",
		in_progress: "inProgress",
		implemented: "implemented",
		not_applicable: "notApplicable",
	},
	tone: {
		not_started: "muted",
		planned: "default",
		in_progress: "warning",
		implemented: "success",
		not_applicable: "muted",
	},
	transitions: transitions<ImplStatus>([
		["not_started", "planned", "plan", undefined, true],
		["not_started", "in_progress", "startWork"],
		["not_started", "not_applicable", "markNotApplicable", "note"],
		["planned", "in_progress", "startWork", undefined, true],
		["planned", "implemented", "markImplemented"],
		["planned", "not_started", "unplan"],
		["planned", "not_applicable", "markNotApplicable", "note"],
		["in_progress", "implemented", "markImplemented", undefined, true],
		["in_progress", "planned", "backToPlanned"],
		["in_progress", "not_applicable", "markNotApplicable", "note"],
		["implemented", "in_progress", "reopen", "note", true],
		["not_applicable", "not_started", "reactivate", "note", true],
	]),
	done: ["implemented", "not_applicable"],
};

export const CONTROL_ENTITY: EntityDef<ImplStatus> = {
	kind: "control",
	route: "/controls",
	i18nNamespace: "Controls",
	statusMachine: CONTROL_STATUS,
};
