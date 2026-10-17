import { z } from "zod";
import {
	ENGAGEMENT_KINDS,
	ENGAGEMENT_STATUS,
	FINDING_CATEGORIES,
	FINDING_SEVERITIES,
} from "@/db/schema/enums";
import { uuid } from "./common";

// Sicherheitsaufträge (S7).

const isoDate = z.iso.date();
const optText = (max: number) => z.string().trim().max(max).optional();

export const createEngagementSchema = z.object({
	kind: z.enum(ENGAGEMENT_KINDS),
	title: z.string().trim().min(3).max(200),
	productId: uuid.nullable().optional(),
});

export const updateEngagementSchema = z
	.object({
		engagementId: uuid,
		title: z.string().trim().min(3).max(200).optional(),
		productId: uuid.nullable().optional(),
		scope: optText(8000),
		targets: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
		outOfScope: optText(4000),
		rulesOfEngagement: optText(8000),
		methodology: optText(4000),
		testerExternal: z.boolean().optional(),
		testerName: optText(200),
		testerOrg: optText(200),
		testerEmail: z
			.union([z.email().max(200), z.literal("")])
			.optional()
			.transform((v) => (v ? v.toLowerCase() : v)),
		startAt: isoDate.nullable().optional(),
		endAt: isoDate.nullable().optional(),
		summary: optText(20_000),
		retestDueAt: isoDate.nullable().optional(),
	})
	.refine((v) => !v.startAt || !v.endAt || v.endAt >= v.startAt, {
		message: "Ende liegt vor dem Beginn",
		path: ["endAt"],
	});

export const engagementStatusSchema = z.object({
	engagementId: uuid,
	status: z.enum(ENGAGEMENT_STATUS),
	note: z.string().trim().max(2000).optional(),
});

export const engagementFindingSchema = z
	.object({
		engagementId: uuid,
		title: z.string().trim().min(3).max(300),
		category: z.enum(FINDING_CATEGORIES),
		severity: z.enum(FINDING_SEVERITIES).optional(),
		cvssVector: z.string().trim().max(300).optional(),
		// nur für CVSS 4.0: Wert aus dem Bericht
		cvssScore: z.number().min(0).max(10).optional(),
		cwe: z
			.string()
			.trim()
			.regex(/^CWE-\d{1,5}$/, "Format CWE-79")
			.optional()
			.or(z.literal("").transform(() => undefined)),
		target: optText(300),
		location: optText(500),
		description: z.string().trim().min(10).max(8000),
		steps: optText(8000),
		remediation: optText(4000),
	})
	.refine((v) => Boolean(v.severity) || Boolean(v.cvssVector), {
		message: "Schwere oder CVSS-Vektor angeben",
		path: ["severity"],
	});

export const retestFindingSchema = z
	.object({
		findingId: uuid,
		result: z.enum(["passed", "failed"]),
		note: z.string().trim().max(2000).optional(),
	})
	.refine((v) => v.result === "passed" || (v.note ?? "").length >= 3, {
		message: "Was ist noch offen?",
		path: ["note"],
	});
