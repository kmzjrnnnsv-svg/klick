import { z } from "zod";
import { GOVERNANCE_MODES } from "@/db/schema/enums";
import { uuid } from "./common";

// Freigabe-Designer (Einstellungen → Freigaben). Form der Eingabe hier;
// ob Felder und Stellen zum Auslöser bzw. zur Organisation passen, prüft
// checkWorkflowDraft (lib/approvals/designer.ts).

const rule = z
	.string()
	.trim()
	.max(80)
	.regex(
		/^(function:[a-z_]+|role:[A-Za-z0-9_-]+|user:[A-Za-z0-9_-]+|owner_of_entity|approver_of_entity|not_requester)$/,
	);

export const conditionSchema = z.object({
	field: z.string().trim().min(1).max(40),
	op: z.enum(["eq", "neq", "in", "gte", "lte", "is_true", "is_false"]),
	value: z
		.union([
			z.string().trim().max(80),
			z.number().finite(),
			z.array(z.string().trim().max(80)).max(20),
		])
		.optional(),
});

export const workflowStepSchema = z.object({
	label: z.string().trim().max(80).optional(),
	// leer erlaubt: checkWorkflowDraft meldet „no_approvers“ am Feld
	approvers: z.array(rule).max(8),
	mode: z.enum(["any", "all"]).default("any"),
	// alle Personen der Stellen stimmen zu (beim Antrag aufgelöst)
	everyone: z.boolean().optional(),
	minApprovers: z.number().int().min(1).max(5).optional(),
	slaDays: z.number().int().min(0).max(90).optional(),
	skipIf: z.array(rule).max(8).optional(),
	onlyIf: z.array(conditionSchema).max(8).optional(),
});

export const workflowSchema = z.object({
	id: uuid.optional(),
	trigger: z.string().trim().min(1).max(60),
	name: z.string().trim().min(3).max(140),
	description: z.string().trim().max(600).optional(),
	enabled: z.boolean(),
	conditions: z.array(conditionSchema).max(8).default([]),
	priority: z.number().int().min(0).max(100).default(0),
	steps: z.array(workflowStepSchema).max(8),
});

export const deleteWorkflowSchema = z.object({ id: uuid });

export const applyPresetSchema = z.object({
	key: z.string().trim().min(1).max(60),
});

export const dryRunSchema = z.object({
	trigger: z.string().trim().min(1).max(60),
	conditions: z.array(conditionSchema).max(8).default([]),
	steps: z.array(workflowStepSchema).min(1).max(8),
	requesterUserId: z.string().trim().min(1).max(64),
	entityOwnerUserId: z.string().trim().max(64).optional(),
	facts: z
		.record(
			z.string().max(40),
			z.union([z.string().max(80), z.number(), z.boolean(), z.null()]),
		)
		.default({}),
});

// Standard oder individuell (ADR-024)
export const governanceModeSchema = z.object({
	mode: z.enum(GOVERNANCE_MODES),
});
