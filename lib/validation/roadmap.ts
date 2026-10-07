import { z } from "zod";
import { LICENCE_STAGES } from "@/db/schema/enums";
import { longText, shortText, uuid } from "./common";

export const MILESTONE_STATUSES = ["todo", "doing", "done"] as const;

export const applyRoadmapSchema = z.object({
	targetStage: z.enum(LICENCE_STAGES),
	startDate: z.iso.date().optional(),
});

export const milestoneSchema = z.object({
	id: uuid.optional(),
	title: shortText,
	description: longText.optional(),
	phase: z.string().trim().max(40).nullable().optional(),
	dueAt: z.iso.date().nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
	controlCodes: z.array(z.string().min(1).max(20)).max(30).optional(),
});

export const moveMilestoneSchema = z.object({
	id: uuid,
	status: z.enum(MILESTONE_STATUSES),
	orderedIds: z.array(uuid).max(500),
});

export const milestoneTaskSchema = z.object({
	id: uuid,
	assigneeUserId: uuid.nullable().optional(),
});
