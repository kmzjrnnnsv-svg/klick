import { scanText } from "@/lib/dlp/detectors";
import { extractText } from "@/lib/dlp/extract";
import { parseScanFile } from "@/lib/security/parsers";
import { parseSbom } from "@/lib/security/sbom-check";
import { validateUpload } from "@/lib/uploads/validate";
import type { ParseJob } from "./protocol";

// Was im Parser-Prozess läuft: Typprüfung (Magic Bytes), Text aus
// PDF/Office/ZIP, DLP-Erkennung, SBOM- und Scan-Parser. Zurück gehen
// Ergebnisse; der extrahierte Text nur, wenn die App ihn ausdrücklich für den
// Fassungsvergleich anfordert (withText).

const decode = (b: Uint8Array): string | null => {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(b);
	} catch {
		return null;
	}
};

export async function runJob(
	job: ParseJob,
	body: Uint8Array,
): Promise<unknown> {
	switch (job.op) {
		case "screen": {
			const validation = await validateUpload({
				name: job.name,
				bytes: body,
				declaredMime: job.declaredMime,
			});
			if (!validation.ok) return { validation };
			const extraction = extractText(body, validation.mime);
			return {
				validation,
				extraction:
					extraction.status === "ok"
						? { status: "ok", truncated: extraction.truncated }
						: extraction.status === "unsupported"
							? { status: "unsupported", reason: extraction.reason }
							: { status: "error" },
				findings: extraction.status === "ok" ? scanText(extraction.text) : [],
				...(job.withText && extraction.status === "ok"
					? { text: extraction.text }
					: {}),
			};
		}
		case "sbom": {
			const text = decode(body);
			return text === null
				? { ok: false, error: "invalid_json" }
				: parseSbom(text);
		}
		case "scan": {
			const text = decode(body);
			return text === null
				? { ok: false, error: "invalid_json" }
				: parseScanFile(text, job.name);
		}
	}
}
