import { z } from "zod";
import {
	PLATFORM_ACCESS_SCOPES,
	PLATFORM_EMERGENCY_CATEGORIES,
} from "@/db/schema/enums";
import {
	MAX_DURATION_MIN,
	MIN_DURATION_MIN,
} from "@/lib/platform-access/rules";

// Lockbox (Härtung A3): Antrag der Plattform, Entscheidung der Org.

export const platformAccessRequestSchema = z.object({
	orgId: z.uuid(),
	scope: z.enum(PLATFORM_ACCESS_SCOPES),
	targetUserId: z
		.uuid()
		.nullish()
		.transform((v) => v ?? null),
	reason: z.string().trim().min(10).max(1000),
	durationMinutes: z.coerce
		.number()
		.int()
		.min(MIN_DURATION_MIN)
		.max(MAX_DURATION_MIN),
	emergency: z
		.enum(PLATFORM_EMERGENCY_CATEGORIES)
		.nullish()
		.transform((v) => v ?? null),
	waiting: z.boolean().default(false),
});
export type PlatformAccessRequestInput = z.input<
	typeof platformAccessRequestSchema
>;

export const platformAccessDecisionSchema = z.object({
	id: z.uuid(),
	approve: z.boolean(),
	note: z
		.string()
		.trim()
		.max(500)
		.nullish()
		.transform((v) => v || null),
});

export const platformAccessReportSchema = z.object({
	id: z.uuid(),
	report: z.string().trim().min(20).max(5000),
});
