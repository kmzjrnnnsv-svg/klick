import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;

export const TASK_STATUS: StatusMachine<TaskStatus> = {
	states: TASK_STATUSES,
	initial: "todo",
	labelKey: { todo: "todo", doing: "doing", blocked: "blocked", done: "done" },
	tone: {
		todo: "muted",
		doing: "warning",
		blocked: "destructive",
		done: "success",
	},
	transitions: transitions<TaskStatus>([
		["todo", "doing", "startWork", undefined, true],
		["todo", "done", "complete"],
		["doing", "done", "complete", undefined, true],
		["doing", "blocked", "block", "note"],
		["doing", "todo", "pause"],
		["blocked", "doing", "unblock", undefined, true],
		["done", "todo", "reopen", undefined, true],
	]),
	done: ["done"],
};

export const TASK_ENTITY: EntityDef<TaskStatus> = {
	kind: "task",
	route: "/heute/aufgaben",
	i18nNamespace: "Tasks",
	statusMachine: TASK_STATUS,
};
