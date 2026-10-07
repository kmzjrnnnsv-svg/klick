import { z } from "zod";
import { ENTITY_KINDS, IMPL_STATUS } from "@/db/schema/enums";
import { TASK_STATUSES } from "@/lib/entities/task";
import { longText, shortText, uuid } from "./common";

export const entityRefSchema = z.object({
	entityType: z.enum(ENTITY_KINDS),
	entityId: uuid,
});
export type EntityRef = z.infer<typeof entityRefSchema>;

export const setControlStatusSchema = z.object({
	implementationId: uuid,
	status: z.enum(IMPL_STATUS),
	note: z.string().trim().max(2000).optional(),
});

export const assignControlSchema = z.object({
	implementationId: uuid,
	ownerUserId: uuid.nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
	nextReviewAt: z.iso.date().nullable().optional(),
});

export const createTaskSchema = z.object({
	title: shortText,
	description: longText.optional(),
	assigneeUserId: uuid.nullable().optional(),
	dueAt: z.iso.date().nullable().optional(),
	priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
	entityType: z.enum(ENTITY_KINDS).optional(),
	entityId: uuid.optional(),
	sourceKind: z
		.enum([
			"manual",
			"remediation",
			"review",
			"evidence_request",
			"treatment",
			"incident_action",
		])
		.default("manual"),
});
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type CreateTaskFormInput = z.input<typeof createTaskSchema>;

export const setTaskStatusSchema = z.object({
	taskId: uuid,
	status: z.enum(TASK_STATUSES),
	note: z.string().trim().max(2000).optional(),
});

export const addCommentSchema = entityRefSchema.extend({
	bodyMarkdown: z.string().trim().min(1).max(10_000),
	parentId: uuid.optional(),
});

export const setApplicabilitySchema = z.object({
	framework: z.string().min(1),
	code: z.string().min(1),
	applicable: z.boolean(),
	note: z.string().trim().max(2000).optional(),
});

export const addFrameworksSchema = z.object({
	frameworks: z.array(z.string().min(1)).min(1).max(20),
});

export const evidenceLinkSchema = z.object({
	implementationId: uuid.optional(),
	title: shortText,
	description: longText.optional(),
	type: z
		.enum([
			"document",
			"screenshot",
			"link",
			"config_export",
			"attestation",
			"log_extract",
		])
		.default("link"),
	classification: z
		.enum(["public", "internal", "confidential", "secret"])
		.default("internal"),
	url: z.url().optional(),
	validUntil: z.iso.date().nullable().optional(),
});
export type EvidenceLinkInput = z.output<typeof evidenceLinkSchema>;
export type EvidenceLinkFormInput = z.input<typeof evidenceLinkSchema>;
