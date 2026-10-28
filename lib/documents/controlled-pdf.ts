import type { DocBlock, DocModel } from "@/lib/export/doc-model";
import type { VersionState } from "./versions";

// „Gelenkte Fassung“ einer Dokument-Fassung als PDF (Dokumentenlenkung,
// ISO 27001 7.5.2/7.5.3, A.5.1): Deckblatt mit Kennung, Fassung, Gültigkeit
// und Prüfsumme, Freigabe- und Unterschriftenblatt, Änderungshistorie,
// Verteiler, Inhalt. Rein (getestet in tests/controlled-pdf.test.ts); das
// PDF rendert lib/export/pdf.ts, die Unterschriften stehen zusätzlich als
// signaturen.json im PDF (prüfbar ohne Klick).

export type ControlledVersion = {
	version: string;
	changeSummary: string;
	contentSha256: string | null;
	approvedAt: Date | null;
	publishedAt: Date | null;
	validFrom: Date | null;
	validUntil: Date | null;
	approvedBy: string | null;
	signers: string[];
};

export type ControlledSignature = {
	name: string;
	functionLabel: string | null;
	signedAt: Date;
	credentialId: string;
	valid: boolean;
};

export type ControlledInput = {
	org: string;
	doc: {
		docNumber: string;
		title: string;
		typeLabel: string;
		classificationLabel: string;
		owner: string | null;
		approverFunction: string | null;
		retentionYears: number | null;
	};
	version: ControlledVersion & {
		state: VersionState;
		bodyMarkdown: string | null;
		file: { name: string; sha256: string | null; attached: boolean } | null;
	};
	signatures: ControlledSignature[];
	history: ControlledVersion[];
	distribution: string[];
	acknowledgements: number | null;
	exportId: string;
	exportedBy: string;
	now: Date;
};

const STATE_LABEL: Record<VersionState, string> = {
	current: "gültig",
	superseded: "ersetzt (gilt nicht mehr)",
	retired: "zurückgezogen (gilt nicht mehr)",
	draft: "Entwurf (nicht freigegeben)",
	in_review: "im Umlauf (Freigabe offen)",
	approved: "freigegeben, noch nicht veröffentlicht",
};

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});
const fmtTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});
const day = (d: Date | null) => (d ? fmt.format(d) : "—");

// Markdown des Dokuments als Blöcke (Überschriften, Listen, Absätze); kein
// voller Markdown-Parser — Hervorhebungen bleiben als Zeichen stehen.
export function markdownBlocks(md: string): DocBlock[] {
	const out: DocBlock[] = [];
	let para: string[] = [];
	let list: string[] = [];
	const flush = () => {
		if (para.length) out.push({ type: "paragraph", text: para.join(" ") });
		if (list.length) out.push({ type: "list", items: list });
		para = [];
		list = [];
	};
	for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
		const line = raw.trimEnd();
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
		if (h) {
			flush();
			// unter „Inhalt“ (Ebene 1): # wird Ebene 2, alles darunter Ebene 3
			const level = Math.min(3, (h[1]?.length ?? 1) + 1) as 2 | 3;
			out.push({ type: "heading", level, text: h[2] ?? "" });
		} else if (li) {
			if (para.length) {
				out.push({ type: "paragraph", text: para.join(" ") });
				para = [];
			}
			list.push(li[1] ?? "");
		} else if (line.trim() === "") flush();
		else {
			if (list.length) {
				out.push({ type: "list", items: list });
				list = [];
			}
			para.push(line.trim());
		}
	}
	flush();
	return out;
}

export function controlledDocModel(input: ControlledInput): DocModel {
	const v = input.version;
	const meta: [string, string][] = [
		["Dokument", input.doc.docNumber],
		["Fassung", v.version],
		["Stand der Fassung", STATE_LABEL[v.state]],
		[
			"Gültig",
			v.validFrom
				? v.validUntil
					? `${day(v.validFrom)} bis ${day(v.validUntil)}`
					: `seit ${day(v.validFrom)}`
				: "—",
		],
		["Art", input.doc.typeLabel],
		["Einstufung", input.doc.classificationLabel],
		["Verantwortlich", input.doc.owner ?? "—"],
		["Prüfsumme der Fassung (SHA-256)", v.contentSha256 ?? "—"],
		["Export-ID", input.exportId],
	];
	const blocks: DocBlock[] = [];

	blocks.push({
		type: "heading",
		level: 1,
		text: "Freigabe und Unterschriften",
	});
	if (input.signatures.length > 0) {
		blocks.push({
			type: "signatures",
			signers: input.signatures.map((s) => ({
				role: s.functionLabel ?? "Freigabe",
				name: s.name,
				signedAt: fmtTime.format(s.signedAt),
				method: s.valid
					? "Passkey, geprüft"
					: "Passkey, PRÜFUNG FEHLGESCHLAGEN",
			})),
		});
		blocks.push({
			type: "paragraph",
			muted: true,
			text: "Jede Unterschrift ist eine WebAuthn-Assertion mit Nutzerverifikation über die Prüfsumme dieser Fassung. Die Daten zum Nachprüfen ohne Klick liegen dieser Datei als signaturen.json bei; eine Änderung am Text macht die Unterschriften ungültig.",
		});
	} else if (v.approvedAt) {
		blocks.push({
			type: "keyValue",
			items: [
				["Freigegeben am", day(v.approvedAt)],
				["Freigegeben von", v.approvedBy ?? "—"],
			],
		});
		blocks.push({
			type: "paragraph",
			muted: true,
			text: "Diese Fassung wurde ohne Unterschrift per Passkey freigegeben (vor der Dokumentenlenkung mit Unterschrift); die Entscheidung steht im Verlauf.",
		});
	} else {
		blocks.push({
			type: "paragraph",
			text: "Diese Fassung ist noch nicht freigegeben.",
		});
	}

	blocks.push({ type: "heading", level: 1, text: "Änderungshistorie" });
	blocks.push({
		type: "table",
		columns: [
			{ label: "Fassung", width: 0.1 },
			{ label: "Gültig", width: 0.22 },
			{ label: "Änderung", width: 0.38 },
			{ label: "Freigegeben", width: 0.3 },
		],
		rows: input.history.map((h) => [
			h.version,
			h.validFrom
				? `${day(h.validFrom)}${h.validUntil ? ` bis ${day(h.validUntil)}` : ""}`
				: "—",
			h.changeSummary,
			h.signers.length > 0
				? `${h.signers.join(", ")} (unterschrieben)`
				: h.approvedAt
					? `${h.approvedBy ?? "—"}, ${day(h.approvedAt)}`
					: "—",
		]),
		empty: "Noch keine Fassungen.",
	});

	blocks.push({ type: "heading", level: 1, text: "Verteiler" });
	blocks.push({
		type: "keyValue",
		items: [
			[
				"Kenntnis nehmen",
				input.distribution.length > 0 ? input.distribution.join(", ") : "—",
			],
			[
				"Kenntnisnahmen dieser Fassung",
				input.acknowledgements === null ? "—" : String(input.acknowledgements),
			],
			[
				"Aufbewahrung",
				input.doc.retentionYears
					? `${input.doc.retentionYears} Jahre nach Ablauf der Gültigkeit`
					: "—",
			],
		],
	});

	blocks.push({ type: "heading", level: 1, text: "Inhalt" });
	if (v.bodyMarkdown?.trim()) blocks.push(...markdownBlocks(v.bodyMarkdown));
	if (v.file)
		blocks.push({
			type: "keyValue",
			items: [
				["Datei der Fassung", v.file.name],
				["SHA-256 der Datei", v.file.sha256 ?? "—"],
				[
					"Beigefügt",
					v.file.attached
						? "ja, als Anhang dieser PDF-Datei"
						: "nein (zu groß), Download in Klick",
				],
			],
		});
	if (!v.bodyMarkdown?.trim() && !v.file)
		blocks.push({
			type: "paragraph",
			muted: true,
			text: "Kein Inhalt hinterlegt.",
		});

	return {
		title: `${input.doc.docNumber} ${input.doc.title}`,
		subtitle: `Gelenkte Fassung ${v.version} · ${STATE_LABEL[v.state]}`,
		org: input.org,
		meta,
		blocks,
		footer: `Ausdruck ist eine ungelenkte Kopie; gültig ist die Fassung in Klick. Export ${input.exportId} von ${input.exportedBy} am ${fmtTime.format(input.now)}`,
	};
}
