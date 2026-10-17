import { DOCUMENT_STATUS } from "@/db/schema/grc";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

// Für Nutzer:innen vier Schritte: Entwurf → In Prüfung → Gültig →
// Archiviert. Die letzte Freigabe (Workflow document_publish) macht das
// Dokument direkt gültig (lib/documents/publish.ts); „Freigegeben“ gibt es nur
// noch für Altbestand bzw. ohne Workflow und ohne Veröffentlichungsrecht.
// Neue Version immer über den Dialog (Versionssprung), nie per Status.
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
		[
			"in_review",
			"published",
			"approveDoc",
			"approval:document_publish",
			true,
			"auto",
		],
		["approved", "published", "publishDoc", undefined, true],
		["approved", "draft", "backToDraft", "note"],
		["published", "retired", "retireDoc", "note", true],
	]),
	done: ["published", "retired", "superseded"],
};

export const DOCUMENT_ENTITY: EntityDef<DocumentStatus> = {
	kind: "document",
	route: "/dokumente",
	i18nNamespace: "Documents",
	statusMachine: DOCUMENT_STATUS_MACHINE,
};
