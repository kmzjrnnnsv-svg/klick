import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type ProcessStatus = "draft" | "active" | "retired";
export const PROCESS_STATUSES = ["draft", "active", "retired"] as const;

export const PROCESS_STATUS: StatusMachine<ProcessStatus> = {
	states: PROCESS_STATUSES,
	initial: "draft",
	labelKey: {
		draft: "procDraft",
		active: "procActive",
		retired: "procRetired",
	},
	tone: { draft: "muted", active: "success", retired: "muted" },
	transitions: transitions<ProcessStatus>([
		["draft", "active", "activate", undefined, true],
		["active", "retired", "retire", "note", true],
		["active", "draft", "backToDraft"],
		["retired", "active", "reactivate", "note", true],
	]),
	done: ["retired"],
};

export const PROCESS_ENTITY: EntityDef<ProcessStatus> = {
	kind: "process",
	route: "/prozesse",
	i18nNamespace: "Processes",
	statusMachine: PROCESS_STATUS,
};
