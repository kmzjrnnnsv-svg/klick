import { DOCUMENT_STATUS } from "@/db/schema/grc";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

// draft → in_review (Review-Workflow) → approved (Freigabe) → published
// (Verteilung + Kenntnisnahme) → retired | superseded. Freigabe/
// Veröffentlichung laufen über den Workflow document_publish.
export const DOCUMENT_STATUS_MACHINE: StatusMachine<DocumentStatus> = {
	states: DOCUMENT_STATUS,
	initial: "draft",
	labelKey: {
		draft: "docDraft",
		in_review: "docInReview",
		approved: "docApproved",
		published: "docPublished",
		retired: "docRetired",
		superseded: "docSuperseded",
	},
	tone: {
		draft: "muted",
		in_review: "warning",
		approved: "default",
		published: "success",
		retired: "muted",
		superseded: "muted",
	},
	transitions: transitions<DocumentStatus>([
		["draft", "in_review", "submitReview", "approval:document_publish", true],
		["in_review", "draft", "backToDraft", "note"],
		["in_review", "approved", "approveDoc", "approval:document_publish", true],
		["approved", "published", "publishDoc", undefined, true],
		["approved", "draft", "backToDraft", "note"],
		["published", "retired", "retireDoc", "note", true],
		["published", "draft", "newVersion"],
		["retired", "draft", "newVersion", undefined, true],
	]),
	done: ["published", "retired", "superseded"],
};

export const DOCUMENT_ENTITY: EntityDef<DocumentStatus> = {
	kind: "document",
	route: "/dokumente",
	i18nNamespace: "Documents",
	statusMachine: DOCUMENT_STATUS_MACHINE,
};
