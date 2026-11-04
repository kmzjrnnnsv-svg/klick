// Interne Pfade in Freitext finden (pure, getestet): ein Pfad beginnt nach
// Zeilenanfang oder Leerraum mit genau einem „/“ und einem Buchstaben, z. B.
// „/controls/CC-IAM-01“ oder „/dokumente?vorlagen=1&vorlage=DOC-ISMS“.
// „//host“ und „https://…“ bleiben Text.
export type TextPart = { kind: "text" | "path"; value: string };

const PATH = /(^|\s)(\/[a-z][\w\-/?=&.%#]*)/gi;

export function splitInternalPaths(text: string): TextPart[] {
	const out: TextPart[] = [];
	let last = 0;
	for (const m of text.matchAll(PATH)) {
		const lead = m[1] ?? "";
		const raw = m[2] ?? "";
		// Satzzeichen am Ende gehören nicht zum Pfad
		const path = raw.replace(/[.,;:)]+$/, "");
		const start = (m.index ?? 0) + lead.length;
		if (start > last)
			out.push({ kind: "text", value: text.slice(last, start) });
		out.push({ kind: "path", value: path });
		last = start + path.length;
	}
	if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
	return out;
}
