import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type IncidentStatus = "open" | "contained" | "resolved" | "closed";
export const INCIDENT_STATUSES = [
	"open",
	"contained",
	"resolved",
	"closed",
] as const;

export const INCIDENT_STATUS: StatusMachine<IncidentStatus> = {
	states: INCIDENT_STATUSES,
	initial: "open",
	labelKey: {
		open: "incOpen",
		contained: "incContained",
		resolved: "incResolved",
		closed: "incClosed",
	},
	tone: {
		open: "destructive",
		contained: "warning",
		resolved: "default",
		closed: "muted",
	},
	transitions: transitions<IncidentStatus>([
		["open", "contained", "contain", undefined, true],
		["contained", "resolved", "resolve", undefined, true],
		["contained", "open", "reopen", "note"],
		["resolved", "closed", "closeIncident", "approval:incident_closure", true],
		["resolved", "open", "reopen", "note"],
		["closed", "open", "reopen", "note", true],
	]),
	done: ["closed"],
};

export const INCIDENT_ENTITY: EntityDef<IncidentStatus> = {
	kind: "incident",
	route: "/vorfaelle",
	i18nNamespace: "Incidents",
	statusMachine: INCIDENT_STATUS,
};
