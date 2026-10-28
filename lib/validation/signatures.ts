import { z } from "zod";
import { SIGN_PURPOSES } from "@/lib/signatures/canonical";

const ids = z.array(z.uuid()).min(1).max(200);
// Funktion, eigene Rolle `role:<uuid>` (ADR-024) oder "-" (ohne)
const fn = z
	.string()
	.regex(
		/^(-|[a-z][a-z_]{1,39}|role:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
	);

export const prepareSignatureSchema = z.object({
	evidenceIds: ids,
	function: fn.default("-"),
	purpose: z.enum(SIGN_PURPOSES).default("approve"),
});

const b64u = z
	.string()
	.regex(/^[A-Za-z0-9_-]+$/)
	.max(16_384);

export const submitSignatureSchema = z.object({
	evidenceIds: ids,
	text: z.string().max(400),
	seal: b64u.max(100),
	response: z.object({
		id: b64u.max(1_024),
		rawId: b64u.max(1_024),
		type: z.literal("public-key"),
		clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
		authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
		response: z.object({
			authenticatorData: b64u,
			clientDataJSON: b64u,
			signature: b64u,
			userHandle: b64u.optional(),
		}),
	}),
});

// Dokument-Fassung im Umlauf unterschreiben (Dokumentenlenkung)
export const prepareDocumentSignatureSchema = z.object({
	documentId: z.uuid(),
	function: fn.default("-"),
});

export const submitDocumentSignatureSchema = submitSignatureSchema
	.omit({ evidenceIds: true })
	.extend({ documentId: z.uuid() });
