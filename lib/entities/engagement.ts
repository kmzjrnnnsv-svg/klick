import type { EngagementStatus } from "@/db/schema/enums";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

// Sicherheitsauftrag (Pentest u. a.): geplant → beauftragt → in Arbeit →
// Bericht → geliefert → Nachtest → geschlossen. Fachliche Sperren prüft die
// Action (engagementGate): „beauftragt“ nur mit schriftlicher Beauftragung,
// Zielen und Zeitraum; „geliefert“ nur mit Management-Summary; „geschlossen“
// nur ohne offene, nicht nachgetestete Befunde.
export const ENGAGEMENT_STATUS_MACHINE: StatusMachine<EngagementStatus> = {
	states: [
		"planned",
		"authorized",
		"in_progress",
		"reporting",
		"delivered",
		"retest",
		"closed",
		"cancelled",
	],
	initial: "planned",
	labelKey: {
		planned: "egPlanned",
		authorized: "egAuthorized",
		in_progress: "egInProgress",
		reporting: "egReporting",
		delivered: "egDelivered",
		retest: "egRetest",
		closed: "egClosed",
		cancelled: "egCancelled",
	},
	tone: {
		planned: "muted",
		authorized: "default",
		in_progress: "warning",
		reporting: "warning",
		delivered: "success",
		retest: "warning",
		closed: "success",
		cancelled: "muted",
	},
	transitions: transitions<EngagementStatus>([
		["planned", "authorized", "egAuthorize", undefined, true],
		["planned", "cancelled", "egCancel", "note"],
		["authorized", "in_progress", "egStart", undefined, true],
		["authorized", "planned", "egBackToPlanning", "note"],
		["authorized", "cancelled", "egCancel", "note"],
		["in_progress", "reporting", "egReport", undefined, true],
		["in_progress", "cancelled", "egCancel", "note"],
		["reporting", "delivered", "egDeliver", undefined, true],
		["reporting", "in_progress", "egBackToTesting"],
		["delivered", "retest", "egStartRetest", undefined, true],
		["delivered", "closed", "egClose"],
		["retest", "closed", "egClose", undefined, true],
		["closed", "retest", "egReopenRetest", "note"],
		["cancelled", "planned", "egReopen", "note"],
	]),
	done: ["closed", "cancelled"],
};

export const SECURITY_ENGAGEMENT_ENTITY: EntityDef<EngagementStatus> = {
	kind: "security_engagement",
	route: "/sicherheit/auftraege",
	i18nNamespace: "Engagements",
	statusMachine: ENGAGEMENT_STATUS_MACHINE,
};
