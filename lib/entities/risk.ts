import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type RiskStatus = "open" | "in_treatment" | "accepted" | "closed";
export const RISK_STATUSES = [
	"open",
	"in_treatment",
	"accepted",
	"closed",
] as const;

// Akzeptieren läuft über den Workflow risk_acceptance, wenn das Restrisiko
// über dem tolerierbaren Appetit liegt (app/actions/risks.ts prüft das).
export const RISK_STATUS: StatusMachine<RiskStatus> = {
	states: RISK_STATUSES,
	initial: "open",
	labelKey: {
		open: "riskOpen",
		in_treatment: "riskInTreatment",
		accepted: "riskAccepted",
		closed: "riskClosed",
	},
	tone: {
		open: "warning",
		in_treatment: "default",
		accepted: "success",
		closed: "muted",
	},
	transitions: transitions<RiskStatus>([
		["open", "in_treatment", "startTreatment", undefined, true],
		["open", "accepted", "acceptRisk", "note"],
		["in_treatment", "accepted", "acceptRisk", "note", true],
		["in_treatment", "closed", "closeRisk", "note"],
		["in_treatment", "open", "reopen"],
		["accepted", "in_treatment", "reopen", undefined, true],
		["accepted", "closed", "closeRisk", "note"],
		["closed", "open", "reopen", "note", true],
	]),
	done: ["accepted", "closed"],
};

export const RISK_ENTITY: EntityDef<RiskStatus> = {
	kind: "risk",
	route: "/risiken",
	i18nNamespace: "Risks",
	statusMachine: RISK_STATUS,
};
