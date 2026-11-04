import type { FindingSeverity, FindingStatus } from "@/db/schema/enums";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

// Lebenszyklus eines Sicherheitsbefunds. „Akzeptieren“ läuft nicht über den
// StatusButton, sondern über einen eigenen Dialog mit Begründung und Ablauf
// (acceptFinding) — hier steht nur der Weg zurück.
export const FINDING_STATUS_MACHINE: StatusMachine<FindingStatus> = {
	states: ["open", "in_progress", "accepted", "resolved", "false_positive"],
	initial: "open",
	labelKey: {
		open: "sfOpen",
		in_progress: "sfInProgress",
		accepted: "sfAccepted",
		resolved: "sfResolved",
		false_positive: "sfFalsePositive",
	},
	tone: {
		open: "destructive",
		in_progress: "warning",
		accepted: "muted",
		resolved: "success",
		false_positive: "muted",
	},
	transitions: transitions<FindingStatus>([
		["open", "in_progress", "startWork", undefined, true],
		["open", "resolved", "markFixed", "note"],
		["open", "false_positive", "markFalsePositive", "note"],
		["in_progress", "resolved", "markFixed", undefined, true],
		["in_progress", "open", "reopen"],
		["in_progress", "false_positive", "markFalsePositive", "note"],
		["accepted", "open", "reopen", "note", true],
		["resolved", "open", "reopen", "note", true],
		["false_positive", "open", "reopen", "note", true],
	]),
	done: ["resolved", "false_positive", "accepted"],
};

export const SECURITY_FINDING_ENTITY: EntityDef<FindingStatus> = {
	kind: "security_finding",
	route: "/sicherheit?tab=befunde",
	i18nNamespace: "Security",
	statusMachine: FINDING_STATUS_MACHINE,
};

// Badge-Ton je Schwere (Listen, Detail, Produkt-Reiter).
export const SEVERITY_TONE: Record<
	FindingSeverity,
	"destructive" | "warning" | "default" | "muted" | "outline"
> = {
	critical: "destructive",
	high: "warning",
	medium: "default",
	low: "outline",
	info: "muted",
};
