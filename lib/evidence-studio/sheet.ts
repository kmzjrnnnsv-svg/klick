import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import {
	DOCUMENT_TEMPLATES,
	type DocumentTemplate,
} from "@/lib/compliance/catalog/document-templates";
import {
	EVIDENCE_KINDS,
	type EvidenceKind,
	evidenceKindForHint,
} from "@/lib/compliance/catalog/evidence-kinds";
import type { Recommendation } from "@/lib/compliance/catalog/types";
import {
	exceedsInterval,
	formatParam,
	type OwnSetting,
	type ParamFinding,
	type ParamRow,
	paramFindings,
	paramTable,
	requirementParams,
	type SourcedParam,
} from "@/lib/compliance/params";
import { mergeSimilar, similarity, stableId } from "./text";

// Nachweisbogen je Control (Nachweis-Werkstatt, pure): aus dem Katalog
// gebaut, rahmenwerksunabhängig. Prüffragen und Nachweis-Positionen des
// Controls und aller Anforderungen der aktiven Rahmenwerke, die es trägt,
// zusammengeführt; Antworten und Belege hängen am Control und gelten damit
// für jedes Rahmenwerk. Dazu Fristen je Rahmenwerk, Konflikte, „schon
// abgedeckt“ und Empfehlungen.

export const QUESTION_MERGE = 0.35;
export const ITEM_MERGE = 0.45;

export type SheetAnswer = {
	answer: "yes" | "partial" | "no" | "na";
	note?: string;
	evidenceIds?: string[];
	updatedAt?: string;
};

export type SheetItemState = {
	mode: "kind" | "document" | "evidence" | "text";
	note?: string;
	evidenceIds?: string[];
	documentId?: string;
};

export type SheetEvidence = {
	id: string;
	title: string;
	sha256: string | null;
	kindCode: string | null;
	// Prüfsumme des Schnappschusses (erzeugte Nachweise) — „veraltet“, wenn
	// die Register heute eine andere ergeben
	contentSha256?: string | null;
	createdAt: string;
	validUntil: string | null;
	// Controls, an denen der Nachweis hängt
	controls: string[];
};

export type SheetDocument = {
	id: string;
	title: string;
	templateCode: string | null;
	status: string;
	reviewCycleMonths: number | null;
	controls: string[];
};

export type SheetInput = {
	controlCode: string;
	frameworks: readonly string[];
	// Anforderungsschlüssel, die für die Org nicht gelten
	notApplicable?: ReadonlySet<string>;
	answers?: Readonly<Record<string, SheetAnswer>>;
	items?: Readonly<Record<string, SheetItemState>>;
	// Nachweise der Org (alle, für „schon abgedeckt“)
	evidence?: readonly SheetEvidence[];
	documents?: readonly SheetDocument[];
	ownParams?: readonly OwnSetting[];
	today: string;
};

export type SheetSource = {
	key: string; // "control" oder "fw:code"
	framework: string | null;
	label: string;
};

export type SheetRequirement = {
	key: string;
	framework: string;
	frameworkName: string;
	code: string;
	title: string;
	coverage: "full" | "partial";
	applicable: boolean;
	from: string | null;
};

export type SheetQuestion = {
	id: string;
	text: string;
	// Wortlaut je Quelle, wenn zusammengeführt
	sources: (SheetSource & { text: string })[];
	answer: SheetAnswer | null;
};

export type ItemResolution =
	| { type: "kind"; kind: EvidenceKind; produced: SheetEvidence | null }
	| {
			type: "template";
			template: DocumentTemplate;
			document: SheetDocument | null;
	  }
	| { type: "free" };

export type SheetItem = {
	id: string;
	text: string;
	mandatory: boolean;
	sources: SheetSource[];
	resolution: ItemResolution;
	state: SheetItemState | null;
	// gleicher Nachweis hängt schon an einem anderen Control
	coveredElsewhere: { evidence: SheetEvidence; controls: string[] }[];
	done: boolean;
};

export type SheetFinding =
	| ParamFinding
	| {
			kind: "document_cycle";
			document: SheetDocument;
			framework: string;
			required: SourcedParam;
	  }
	| {
			kind: "evidence_validity";
			evidence: SheetEvidence;
			framework: string;
			required: SourcedParam;
	  }
	| { kind: "duplicate_upload"; sha256: string; evidence: SheetEvidence[] };

export type SheetRecommendation = {
	text: string;
	level: Recommendation["level"] | "info";
	source: string;
	action?: { href: string; label: string };
};

export type NachweisBogen = {
	control: { code: string; title: string; description: string };
	requirements: SheetRequirement[];
	questions: SheetQuestion[];
	items: SheetItem[];
	params: ParamRow[];
	// eigene Festlegungen je Rahmenwerk und Thema
	ownParams: OwnSetting[];
	findings: SheetFinding[];
	recommendations: SheetRecommendation[];
	progress: {
		questions: { answered: number; total: number };
		items: { done: number; total: number; mandatoryOpen: number };
	};
};

const sourceLabel = (key: string): SheetSource => {
	if (key === "control") return { key, framework: null, label: "Control" };
	const r = REQUIREMENT_BY_KEY.get(key);
	const fw = r ? FRAMEWORK_BY_SLUG.get(r.framework) : undefined;
	return {
		key,
		framework: r?.framework ?? null,
		label: r ? `${fw?.name ?? r.framework} ${r.code}` : key,
	};
};

const monthsBetween = (a: string, b: string) =>
	(new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86_400_000);

export function buildSheet(input: SheetInput): NachweisBogen | null {
	const control = CONTROL_BY_CODE.get(input.controlCode);
	if (!control) return null;
	const active = new Set(input.frameworks);
	const edges = (EDGES_BY_CONTROL.get(control.code) ?? []).filter((e) =>
		active.has(e.requirement.slice(0, e.requirement.indexOf(":"))),
	);

	const requirements: SheetRequirement[] = edges.flatMap((e) => {
		const r = REQUIREMENT_BY_KEY.get(e.requirement);
		if (!r) return [];
		if (r.effectiveUntil && r.effectiveUntil < input.today) return [];
		return [
			{
				key: e.requirement,
				framework: r.framework,
				frameworkName: FRAMEWORK_BY_SLUG.get(r.framework)?.name ?? r.framework,
				code: r.code,
				title: r.title,
				coverage: e.coverage,
				applicable: !input.notApplicable?.has(e.requirement),
				from:
					r.effectiveFrom && r.effectiveFrom > input.today
						? r.effectiveFrom
						: null,
			},
		];
	});
	const live = requirements.filter((r) => r.applicable);

	// Prüffragen: Control zuerst, dann je Anforderung; ohne Fragen eine je
	// Anforderung aus dem Titel (alle Rahmenwerke haben so etwas zum Ausfüllen)
	// Ersatzfragen (Rahmenwerke ohne Prüffragen) werden nie zusammengeführt —
	// sie gleichen sich im Wortlaut, meinen aber verschiedene Anforderungen
	const qEntries = [
		...(control.auditQuestions ?? []).map((text) => ({ text, key: "control" })),
		...live.flatMap((r) =>
			(REQUIREMENT_BY_KEY.get(r.key)?.auditQuestions ?? []).map((text) => ({
				text,
				key: r.key,
			})),
		),
	];
	const fallback = live
		.filter(
			(r) => (REQUIREMENT_BY_KEY.get(r.key)?.auditQuestions ?? []).length === 0,
		)
		.map((r) => ({
			text: `Wie erfüllt ihr „${r.title}“ (${r.frameworkName} ${r.code})?`,
			key: r.key,
		}));
	if (qEntries.length === 0 && fallback.length === 0)
		fallback.push({
			text: `Wie ist „${control.title}“ umgesetzt?`,
			key: "control",
		});
	const questionGroups = [
		...mergeSimilar(qEntries, QUESTION_MERGE),
		...fallback.map((f) => ({ text: f.text, members: [f] })),
	];
	const questions: SheetQuestion[] = questionGroups.map((g) => {
		const id = stableId("q", g.text);
		return {
			id,
			text: g.text,
			sources: g.members.map((m) => ({
				...sourceLabel(m.key),
				text: m.text,
			})),
			answer: input.answers?.[id] ?? null,
		};
	});

	// Nachweis-Positionen
	const iEntries = [
		...(control.evidenceHints ?? []).map((text) => ({ text, key: "control" })),
		...live.flatMap((r) =>
			(REQUIREMENT_BY_KEY.get(r.key)?.evidenceHints ?? []).map((text) => ({
				text,
				key: r.key,
			})),
		),
	];
	const evidence = input.evidence ?? [];
	const producedByKind = new Map<string, SheetEvidence>();
	for (const e of [...evidence].sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	))
		if (e.kindCode && !producedByKind.has(e.kindCode))
			producedByKind.set(e.kindCode, e);
	const templates = DOCUMENT_TEMPLATES.filter((t) =>
		t.controls.includes(control.code),
	);
	const resolve = (texts: string[]): ItemResolution => {
		for (const t of texts) {
			const k = evidenceKindForHint(t);
			if (k)
				return {
					type: "kind",
					kind: k,
					produced: producedByKind.get(k.code) ?? null,
				};
		}
		// Art mit ähnlichem Titel, die dieses Control trägt
		const kind = EVIDENCE_KINDS.filter((k) =>
			k.controls.includes(control.code),
		).find((k) => texts.some((t) => similarity(t, k.title) >= 0.5));
		if (kind)
			return {
				type: "kind",
				kind,
				produced: producedByKind.get(kind.code) ?? null,
			};
		const tpl = templates.find((t) =>
			texts.some((x) => similarity(x, t.title) >= 0.4),
		);
		if (tpl)
			return {
				type: "template",
				template: tpl,
				document:
					input.documents?.find((d) => d.templateCode === tpl.code) ?? null,
			};
		return { type: "free" };
	};
	// Positionen, die auf dieselbe Nachweisart zeigen, sind eine Position
	// („Kontextanalyse“ und „Kontextanalyse (SWOT/PESTEL)“)
	const itemGroups: {
		text: string;
		members: { text: string; key: string }[];
	}[] = [];
	for (const g of mergeSimilar(iEntries, ITEM_MERGE)) {
		const kind = g.members
			.map((m) => evidenceKindForHint(m.text)?.code)
			.find(Boolean);
		const same = kind
			? itemGroups.find((x) =>
					x.members.some((m) => evidenceKindForHint(m.text)?.code === kind),
				)
			: undefined;
		if (same) same.members.push(...g.members);
		else itemGroups.push({ text: g.text, members: [...g.members] });
	}
	const items: SheetItem[] = itemGroups.map((g) => {
		const id = stableId("i", g.text);
		const texts = g.members.map((m) => m.text);
		const resolution = resolve(texts);
		const state = input.items?.[id] ?? null;
		const own = new Set(state?.evidenceIds ?? []);
		const linked = evidence.filter(
			(e) =>
				own.has(e.id) ||
				(e.controls.includes(control.code) && e.title === g.text),
		);
		const coveredElsewhere = evidence
			.filter(
				(e) =>
					!e.controls.includes(control.code) &&
					((resolution.type === "kind" &&
						e.kindCode === resolution.kind.code) ||
						(e.sha256 !== null && linked.some((l) => l.sha256 === e.sha256))),
			)
			.map((e) => ({ evidence: e, controls: e.controls }));
		const valid = (e: SheetEvidence | null) =>
			!!e && (!e.validUntil || e.validUntil >= input.today);
		const done =
			(resolution.type === "kind" && valid(resolution.produced)) ||
			(resolution.type === "template" &&
				!!resolution.document &&
				["approved", "published"].includes(resolution.document.status)) ||
			linked.some((e) => valid(e)) ||
			(state?.mode === "text" && Boolean(state.note?.trim()));
		return {
			id,
			text: g.text.replace(/^\(P\)\s*/, ""),
			mandatory: texts.some((t) => t.startsWith("(P)")),
			sources: g.members.map((m) => sourceLabel(m.key)),
			resolution,
			state,
			coveredElsewhere,
			done,
		};
	});

	// Fristen je Rahmenwerk und Abgleich mit eigenen Einstellungen
	const sourced = live.flatMap((r) => {
		const req = REQUIREMENT_BY_KEY.get(r.key);
		return req ? requirementParams(req, r.key) : [];
	});
	const params = paramTable(sourced);
	const findings: SheetFinding[] = paramFindings(
		sourced,
		input.ownParams ?? [],
	);
	const review = params.find((p) => p.topic === "interval:review");
	for (const fw of review?.perFramework ?? []) {
		const required = fw.params[0];
		for (const d of input.documents ?? [])
			if (
				d.controls.includes(control.code) &&
				exceedsInterval(d.reviewCycleMonths, required) &&
				required
			)
				findings.push({
					kind: "document_cycle",
					document: d,
					framework: fw.framework,
					required,
				});
		for (const e of evidence)
			if (
				e.controls.includes(control.code) &&
				e.validUntil &&
				required &&
				exceedsInterval(
					Math.round(monthsBetween(e.createdAt, e.validUntil)),
					required,
				)
			)
				findings.push({
					kind: "evidence_validity",
					evidence: e,
					framework: fw.framework,
					required,
				});
	}
	const bySha = new Map<string, SheetEvidence[]>();
	for (const e of evidence.filter(
		(x) => x.controls.includes(control.code) && x.sha256,
	))
		bySha.set(e.sha256 as string, [
			...(bySha.get(e.sha256 as string) ?? []),
			e,
		]);
	for (const [sha256, list] of bySha)
		if (list.length > 1)
			findings.push({ kind: "duplicate_upload", sha256, evidence: list });

	// Empfehlungen: Katalog (Control, dann Anforderungen, ohne Dubletten) und
	// erzeugte zu Nachweisarten, Vorlagen und Fristen
	const recEntries = [
		...(control.recommendations ?? []).map((r) => ({ ...r, key: "control" })),
		...live.flatMap((r) =>
			(REQUIREMENT_BY_KEY.get(r.key)?.recommendations ?? []).map((x) => ({
				...x,
				key: r.key,
			})),
		),
	];
	const recommendations: SheetRecommendation[] = mergeSimilar(
		recEntries,
		0.6,
	).map((g) => ({
		text: g.text,
		level: g.members[0]?.level ?? "should",
		source: g.members.map((m) => sourceLabel(m.key).label).join(", "),
	}));
	const seenKinds = new Set<string>();
	for (const it of items) {
		if (it.resolution.type !== "kind" || it.done) continue;
		const k = it.resolution.kind;
		if (seenKinds.has(k.code)) continue;
		seenKinds.add(k.code);
		const also = k.requirements.filter(
			(r) =>
				active.has(r.slice(0, r.indexOf(":"))) &&
				!live.some((l) => l.key === r),
		);
		recommendations.unshift({
			level: it.mandatory ? "must" : "should",
			text:
				also.length > 0
					? `„${k.title}“ in Klick erzeugen – belegt zusätzlich ${also.length} weitere Anforderung${also.length === 1 ? "" : "en"}.`
					: `„${k.title}“ in Klick erzeugen.`,
			source: "Klick",
			action: k.edit,
		});
	}
	for (const it of items)
		if (it.resolution.type === "template" && !it.resolution.document)
			recommendations.push({
				level: it.mandatory ? "must" : "could",
				text: `Vorlage „${it.resolution.template.title}“ als Dokument anlegen.`,
				source: "Klick",
				action: { href: "/dokumente", label: "Dokumente öffnen" },
			});
	for (const row of params.filter((p) => p.differs))
		recommendations.push({
			level: "info",
			text: `Unterschiedliche Vorgaben je Rahmenwerk (${row.perFramework
				.map(
					(f) =>
						`${FRAMEWORK_BY_SLUG.get(f.framework)?.name ?? f.framework}: ${f.params.map(formatParam).join(" / ")}`,
				)
				.join(
					"; ",
				)}) – je Rahmenwerk eigene Frist festlegen oder eine gemeinsame, die alle erfüllt.`,
			source: "Klick",
		});

	const mandatoryOpen = items.filter((i) => i.mandatory && !i.done).length;
	return {
		control: {
			code: control.code,
			title: control.title,
			description: control.description,
		},
		requirements,
		questions,
		items,
		params,
		ownParams: [...(input.ownParams ?? [])],
		findings,
		recommendations,
		progress: {
			questions: {
				answered: questions.filter((q) => q.answer && q.answer.answer !== "no")
					.length,
				total: questions.length,
			},
			items: {
				done: items.filter((i) => i.done).length,
				total: items.length,
				mandatoryOpen,
			},
		},
	};
}
