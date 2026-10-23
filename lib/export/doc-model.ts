// Dokumentmodell für Nachweise aus Klick: ein Modell, zwei Ausgaben
// (Markdown für Diff und Prüfungspaket, PDF für Ablage und Unterschrift).
// Builder liefern nur dieses Modell, nie Markup.

export type DocBlock =
	| { type: "heading"; level: 1 | 2 | 3; text: string }
	| { type: "paragraph"; text: string; muted?: boolean }
	| { type: "list"; items: string[] }
	| { type: "keyValue"; items: [label: string, value: string][] }
	| {
			type: "table";
			columns: { label: string; width?: number }[];
			rows: string[][];
			empty?: string;
	  }
	| {
			type: "signatures";
			signers: {
				role: string;
				name?: string | null;
				signedAt?: string | null;
				method?: string | null;
			}[];
	  };

export type DocModel = {
	title: string;
	subtitle?: string;
	org: string;
	// Kopfangaben (Stand, Version, Export-ID, Prüfsumme …) in Reihenfolge
	meta: [label: string, value: string][];
	blocks: DocBlock[];
	// Fußzeile links (rechts steht „Seite x von y“)
	footer?: string;
};

const mdEscape = (s: string) => s.replace(/([\\`*_[\]|<>])/g, "\\$1");
const cell = (s: string) => mdEscape(s).replace(/\r?\n/g, " ").trim() || "—";

export function renderMarkdown(doc: DocModel): string {
	const out: string[] = [`# ${mdEscape(doc.title)}`, ""];
	if (doc.subtitle) out.push(mdEscape(doc.subtitle), "");
	out.push(`**Organisation:** ${mdEscape(doc.org)}  `);
	for (const [k, v] of doc.meta)
		out.push(`**${mdEscape(k)}:** ${mdEscape(v)}  `);
	out.push("");
	for (const b of doc.blocks) {
		switch (b.type) {
			case "heading":
				out.push(`${"#".repeat(b.level + 1)} ${mdEscape(b.text)}`, "");
				break;
			case "paragraph":
				out.push(b.muted ? `_${mdEscape(b.text)}_` : mdEscape(b.text), "");
				break;
			case "list":
				for (const i of b.items) out.push(`- ${mdEscape(i)}`);
				out.push("");
				break;
			case "keyValue":
				for (const [k, v] of b.items)
					out.push(`- **${mdEscape(k)}:** ${mdEscape(v) || "—"}`);
				out.push("");
				break;
			case "table":
				if (b.rows.length === 0) {
					out.push(`_${mdEscape(b.empty ?? "Keine Einträge.")}_`, "");
					break;
				}
				out.push(`| ${b.columns.map((c) => cell(c.label)).join(" | ")} |`);
				out.push(`| ${b.columns.map(() => "---").join(" | ")} |`);
				for (const r of b.rows)
					out.push(
						`| ${b.columns.map((_, i) => cell(r[i] ?? "")).join(" | ")} |`,
					);
				out.push("");
				break;
			case "signatures":
				out.push("| Funktion | Name | Unterschrieben |", "| --- | --- | --- |");
				for (const s of b.signers)
					out.push(
						`| ${cell(s.role)} | ${cell(s.name ?? "")} | ${cell(
							s.signedAt
								? `${s.signedAt}${s.method ? ` (${s.method})` : ""}`
								: "offen",
						)} |`,
					);
				out.push("");
				break;
		}
	}
	if (doc.footer) out.push("---", "", `_${mdEscape(doc.footer)}_`, "");
	return out.join("\n");
}
