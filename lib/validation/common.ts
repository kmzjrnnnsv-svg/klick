import { z } from "zod";

export const uuid = z.uuid();
export const slug = z
	.string()
	.min(2)
	.max(48)
	.regex(
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
		"nur Kleinbuchstaben, Ziffern, Bindestriche",
	);
export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().max(20_000);
export const email = z.email().transform((v) => v.trim().toLowerCase());

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function fail(
	error: string,
	fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
	return { ok: false, error, fieldErrors };
}

export function fromZod(err: z.ZodError): ActionResult<never> {
	const fieldErrors: Record<string, string[]> = {};
	for (const issue of err.issues) {
		const key = issue.path.join(".") || "_";
		const list = fieldErrors[key] ?? [];
		list.push(issue.message);
		fieldErrors[key] = list;
	}
	return { ok: false, error: "Eingaben prüfen", fieldErrors };
}
