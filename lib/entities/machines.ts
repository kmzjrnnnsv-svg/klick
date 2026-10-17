import { CONTROL_STATUS } from "./control";
import { DOCUMENT_STATUS_MACHINE } from "./document";
import { ENGAGEMENT_STATUS_MACHINE } from "./engagement";
import { INCIDENT_STATUS } from "./incident";
import { NONCONFORMITY_STATUS } from "./nonconformity";
import { PROCESS_STATUS } from "./process";
import { PRODUCT_STATUS } from "./product";
import { RISK_STATUS } from "./risk";
import { FINDING_STATUS_MACHINE } from "./security-finding";
import { TASK_STATUS } from "./task";

// Alle Status-Maschinen nach Art — eine Quelle für StatusButton, StatusGuide
// und die Tests (jede Maschine mit Hinweisen hat sie für alle Zustände).
export const MACHINES = {
	control: CONTROL_STATUS,
	task: TASK_STATUS,
	risk: RISK_STATUS,
	incident: INCIDENT_STATUS,
	process: PROCESS_STATUS,
	nonconformity: NONCONFORMITY_STATUS,
	document: DOCUMENT_STATUS_MACHINE,
	product: PRODUCT_STATUS,
	security_finding: FINDING_STATUS_MACHINE,
	security_engagement: ENGAGEMENT_STATUS_MACHINE,
} as const;

export type MachineKind = keyof typeof MACHINES;
