import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";

// Protokoll zwischen App und Parser-Prozess (N6): eine Anfrage je Prozess.
// Anfrage = u32 Kopf-Länge ‖ u32 Daten-Länge ‖ Kopf (JSON) ‖ Daten,
// Antwort = u32 Länge ‖ JSON. Beide Seiten prüfen Längen, die App prüft die
// Antwort mit zod — der Parser gilt als nicht vertrauenswürdig.

export const MAX_HEADER = 4_096;
export const MAX_BODY = MAX_UPLOAD_BYTES + 1_024;
// Scan-Berichte mit bis zu 20 000 Befunden und SBOMs mit 200 000 Komponenten
// werden als JSON größer als die Eingabe (Feldnamen je Eintrag)
export const MAX_RESPONSE = 64 * 1024 * 1024;

export const parseJobSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("screen"),
		name: z.string().max(300),
		declaredMime: z.string().max(200).optional(),
		// Text zurückgeben (Fassungsvergleich) — sonst nie
		withText: z.boolean().optional(),
	}),
	z.object({ op: z.literal("sbom") }),
	z.object({ op: z.literal("scan"), name: z.string().max(300) }),
]);
export type ParseJob = z.infer<typeof parseJobSchema>;

export function encodeRequest(job: ParseJob, body: Uint8Array): Buffer {
	const head = Buffer.from(JSON.stringify(job), "utf8");
	if (head.length > MAX_HEADER) throw new Error("parse: Kopf zu groß");
	if (body.byteLength > MAX_BODY) throw new Error("parse: Daten zu groß");
	const lens = Buffer.alloc(8);
	lens.writeUInt32BE(head.length, 0);
	lens.writeUInt32BE(body.byteLength, 4);
	return Buffer.concat([lens, head, Buffer.from(body)]);
}

// Länge der vollständigen Anfrage, sobald die ersten 8 Byte da sind
export function requestLength(prefix: Buffer): number | null {
	if (prefix.length < 8) return null;
	const head = prefix.readUInt32BE(0);
	const body = prefix.readUInt32BE(4);
	if (head > MAX_HEADER || body > MAX_BODY) return -1;
	return 8 + head + body;
}

export function decodeRequest(
	buf: Buffer,
): { job: ParseJob; body: Uint8Array } | null {
	const total = requestLength(buf);
	if (total === null || total < 0 || buf.length !== total) return null;
	const headLen = buf.readUInt32BE(0);
	let raw: unknown;
	try {
		raw = JSON.parse(buf.subarray(8, 8 + headLen).toString("utf8"));
	} catch {
		return null;
	}
	const job = parseJobSchema.safeParse(raw);
	if (!job.success) return null;
	return { job: job.data, body: new Uint8Array(buf.subarray(8 + headLen)) };
}

export function encodeResponse(value: unknown): Buffer {
	const json = Buffer.from(JSON.stringify(value), "utf8");
	const len = Buffer.alloc(4);
	len.writeUInt32BE(json.length, 0);
	return Buffer.concat([len, json]);
}

export function decodeResponse(buf: Buffer): unknown {
	if (buf.length < 4) throw new Error("parse: Antwort zu kurz");
	const len = buf.readUInt32BE(0);
	if (len > MAX_RESPONSE || buf.length !== 4 + len)
		throw new Error("parse: Antwortlänge falsch");
	return JSON.parse(buf.subarray(4).toString("utf8"));
}
