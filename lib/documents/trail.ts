import {
	type DiffLine,
	diffWords,
	type WordPart,
	wordSimilarity,
} from "./diff";

// Verlauf je Dokument-Fassung aus dem Protokoll (pure): wer die Fassung
// begonnen, bearbeitet (mit welchen Angaben), eingereicht und veröffentlicht
// hat. So lässt sich von der neuesten Fassung Schritt für Schritt zurück
// verfolgen, wer was geändert hat (ISO 27001 7.5.3 c, Änderungslenkung).
// Bearbeitungen zählen zur Fassung, die gerade in Arbeit ist: vor dem ersten
// „document.version“ zur ersten Fassung, danach zur jeweils begonnenen.

export type TrailEvent = {
	at: Date;
	actorUserId: string | null;
	action: string;
	after: unknown;
};

export type TrailField =
	| "bodyMarkdown"
	| "title"
	| "type"
	| "classification"
	| "owner"
	| "distribution"
	| "approverFunction"
	| "reviewCycleMonths"
	| "changeSummary"
	| "controls"
	| "file"
	| "other";

export type TrailEditor = {
	userId: string | null;
	count: number;
	fields: TrailField[];
};

export type VersionTrail = {
	version: string;
	startedBy: string | null;
	startedAt: Date | null;
	editors: TrailEditor[];
	submittedBy: string | null;
	submittedAt: Date | null;
	publishedBy: string | null;
	publishedAt: Date | null;
};

// abgeleitete Spalten, die keine eigene Änderung sind
const IGNORED = new Set(["nextReviewAt", "updatedAt", "effectiveFrom"]);

const FIELD: Record<string, TrailField> = {
	bodyMarkdown: "bodyMarkdown",
	title: "title",
	type: "type",
	classification: "classification",
	ownerUserId: "owner",
	ownerFunction: "owner",
	assigneeUserId: "owner",
	distribution: "distribution",
	approverFunction: "approverFunction",
	reviewCycleMonths: "reviewCycleMonths",
	changeSummary: "changeSummary",
	controlCodes: "controls",
	fileEvidenceId: "file",
};

const SUBMIT = new Set(["document.review_requested", "approval.self_approved"]);

const record = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" ? (v as Record<string, unknown>) : {};

export function changedFields(after: unknown): TrailField[] {
	const out = new Set<TrailField>();
	for (const [k, v] of Object.entries(record(after))) {
		if (v === undefined || IGNORED.has(k)) continue;
		out.add(FIELD[k] ?? "other");
	}
	return [...out];
}

export function versionTrails(
	// älteste Fassung (für Bearbeitungen vor der ersten „neuen Fassung“)
	firstVersion: string | null,
	events: readonly TrailEvent[],
): Map<string, VersionTrail> {
	const out = new Map<string, VersionTrail>();
	const of = (version: string): VersionTrail => {
		let t = out.get(version);
		if (!t) {
			t = {
				version,
				startedBy: null,
				startedAt: null,
				editors: [],
				submittedBy: null,
				submittedAt: null,
				publishedBy: null,
				publishedAt: null,
			};
			out.set(version, t);
		}
		return t;
	};
	const edit = (
		version: string,
		actor: string | null,
		fields: TrailField[],
	) => {
		if (fields.length === 0) return;
		const t = of(version);
		let e = t.editors.find((x) => x.userId === actor);
		if (!e) {
			e = { userId: actor, count: 0, fields: [] };
			t.editors.push(e);
		}
		e.count += 1;
		for (const f of fields) if (!e.fields.includes(f)) e.fields.push(f);
	};
	let current = firstVersion;
	const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
	for (const ev of sorted) {
		const after = record(ev.after);
		const named = typeof after.version === "string" ? after.version : null;
		switch (ev.action) {
			case "document.create":
			case "document.imported":
				if (current) {
					const t = of(current);
					t.startedBy ??= ev.actorUserId;
					t.startedAt ??= ev.at;
				}
				break;
			case "document.version":
				if (named) {
					current = named;
					const t = of(named);
					t.startedBy = ev.actorUserId;
					t.startedAt = ev.at;
					if (typeof after.changeSummary === "string")
						edit(named, ev.actorUserId, ["changeSummary"]);
				}
				break;
			case "document.update":
				if (current) edit(current, ev.actorUserId, changedFields(ev.after));
				break;
			case "document.file_uploaded": {
				const v = named ?? current;
				if (v) edit(v, ev.actorUserId, ["file"]);
				break;
			}
			case "document.published": {
				const v = named ?? current;
				if (v) {
					const t = of(v);
					t.publishedBy = ev.actorUserId;
					t.publishedAt = ev.at;
				}
				break;
			}
			default: {
				const submitted =
					SUBMIT.has(ev.action) ||
					(ev.action === "document.status" &&
						(after.status === "in_review" || after.status === "approved"));
				if (submitted && current) {
					// wiederholtes Einreichen: das letzte zählt
					const t = of(current);
					t.submittedBy = ev.actorUserId;
					t.submittedAt = ev.at;
				}
			}
		}
	}
	return out;
}

export type DiffStat = { added: number; removed: number };

export function diffStat(lines: readonly DiffLine[]): DiffStat {
	let added = 0;
	let removed = 0;
	for (const l of lines) {
		if (l.type === "add") added += 1;
		else if (l.type === "del") removed += 1;
	}
	return { added, removed };
}

export type CompactLine = DiffLine | { type: "gap"; skipped: number };

// Nur geänderte Zeilen mit `context` Zeilen davor und danach; dazwischen
// eine Lücke mit der Zahl ausgelassener Zeilen.
export function compactDiff(
	lines: readonly DiffLine[],
	context = 1,
): CompactLine[] {
	const keep = new Array<boolean>(lines.length).fill(false);
	lines.forEach((l, i) => {
		if (l.type === "same") return;
		for (
			let j = Math.max(0, i - context);
			j <= Math.min(lines.length - 1, i + context);
			j += 1
		)
			keep[j] = true;
	});
	const out: CompactLine[] = [];
	let skipped = 0;
	lines.forEach((l, i) => {
		if (keep[i]) {
			if (skipped > 0) out.push({ type: "gap", skipped });
			skipped = 0;
			out.push(l);
		} else skipped += 1;
	});
	if (skipped > 0 && out.length > 0) out.push({ type: "gap", skipped });
	return out;
}

// Geänderte Absatzpaare als eine Zeile: auf entfernte Zeilen folgende neue
// werden der Reihe nach gepaart, wenn mindestens die Hälfte der Wörter
// gleich bleibt (je entfernter Zeile Blick auf die nächsten drei neuen); dann
// zeigt die Zeile alte Wörter durchgestrichen und neue hervorgehoben. Sonst
// bleiben die Zeilen für sich.
export type DisplayLine = CompactLine | { type: "change"; parts: WordPart[] };

const PAIR_MIN = 0.5;
const PAIR_WINDOW = 3;

export function pairChanges(lines: readonly CompactLine[]): DisplayLine[] {
	const out: DisplayLine[] = [];
	let i = 0;
	while (i < lines.length) {
		const l = lines[i];
		if (l.type !== "del") {
			out.push(l);
			i += 1;
			continue;
		}
		const dels: string[] = [];
		while (i < lines.length && lines[i].type === "del")
			dels.push((lines[i++] as DiffLine).text);
		const adds: string[] = [];
		while (i < lines.length && lines[i].type === "add")
			adds.push((lines[i++] as DiffLine).text);
		let j = 0;
		for (const d of dels) {
			let match: { k: number; parts: WordPart[] } | null = null;
			for (let k = j; k < Math.min(adds.length, j + PAIR_WINDOW); k += 1) {
				const parts = diffWords(d, adds[k]);
				if (parts && wordSimilarity(parts) >= PAIR_MIN) {
					match = { k, parts };
					break;
				}
			}
			if (!match) {
				out.push({ type: "del", text: d });
				continue;
			}
			for (; j < match.k; j += 1) out.push({ type: "add", text: adds[j] });
			out.push({ type: "change", parts: match.parts });
			j = match.k + 1;
		}
		for (; j < adds.length; j += 1) out.push({ type: "add", text: adds[j] });
	}
	return out;
}
