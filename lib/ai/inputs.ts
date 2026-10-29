import { and, eq, inArray } from "drizzle-orm";
import {
	controls,
	documentControls,
	documents,
	evidence,
	orgSettings,
} from "@/db/schema";
import type { Classification } from "@/db/schema/enums";
import type { OrgContext } from "@/lib/auth/guards";
import { hidesSecret, restrictedView } from "@/lib/auth/visibility";
import {
	CONTROL_BY_CODE,
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import { activeFrameworkSlugs } from "@/lib/compliance/initialize-org";
import { evidenceDetail, evidenceVersionSides } from "@/lib/compliance/queries";
import { getDocumentByNumber } from "@/lib/compliance/queries-p2";
import type { OrgTx } from "@/lib/db/with-org";
import type { DlpCategory } from "@/lib/dlp/detectors";
import {
	type ContentDiff,
	type ContentSide,
	contentDiff,
} from "@/lib/documents/content-diff";
import { decryptEvidenceObject } from "@/lib/evidence/read";
import { evidenceFileFor } from "@/lib/evidence/serve";
import { evidenceTextsFor, fileTextOf } from "@/lib/evidence/text";
import { authoredBlocks } from "@/lib/evidence-authoring/render";
import { authoredContentOf } from "@/lib/evidence-authoring/service";
import { renderBlocksMarkdown } from "@/lib/export/doc-model";
import { highestClass } from "./policy";
import type { CheckControl, DraftRequirement } from "./prompts";
import type { AiFile } from "./providers";

// Was eine KI-Funktion braucht, geladen im Org-Kontext (ADR-032). Die
// Action lädt alles selbst, nie vom Client; Externe ohne „Entwürfe und
// Verlauf“ und streng geheime Einträge ohne Grant bekommen nichts.
// Vertrauliche Inhalte gehen nur nach frischer Bestätigung raus (wie
// Anzeigen und Download) — die Prüfung steht vor dem Entschlüsseln.

export type InputFailure = { ok: false; error: string };

// Dateien gehen nur mit diesen Typen und höchstens dieser Größe selbst an
// die KI (Modus „KI vergleicht auch“)
const FILE_MIMES: ReadonlySet<string> = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
]);
export const MAX_AI_FILE_BYTES = 10 * 1024 * 1024;

export type AiFileInput = { file: AiFile; dlpCategories: DlpCategory[] };

const needsStepUp = (c: OrgContext, cls: Classification) =>
	(cls === "confidential" || cls === "secret") && !c.stepUpFresh;

type FileRow = {
	id: string;
	fileName: string | null;
	mimeType: string | null;
	sizeBytes: number | null;
	dlp: { findings: { category: string; count: number }[] } | null;
};

// Datei entschlüsseln für die KI (nur PDF und Bilder, ≤ 10 MB)
async function aiFileOf(
	tx: OrgTx,
	orgId: string,
	row: FileRow,
): Promise<AiFileInput | null> {
	if (!row.mimeType || !FILE_MIMES.has(row.mimeType)) return null;
	if ((row.sizeBytes ?? 0) > MAX_AI_FILE_BYTES) return null;
	const payload = await evidenceFileFor(tx, orgId, row.id);
	if (!payload) return null;
	const bytes = await decryptEvidenceObject(payload);
	if (bytes.byteLength > MAX_AI_FILE_BYTES) return null;
	return {
		file: {
			name: row.fileName ?? "datei",
			mime: row.mimeType as AiFile["mime"],
			base64: Buffer.from(bytes).toString("base64"),
		},
		dlpCategories: (row.dlp?.findings ?? [])
			.filter((f) => f.count > 0)
			.map((f) => f.category as DlpCategory),
	};
}

// Beide Dateien, wenn Klick den Inhalt nicht lesen kann (Scan, Bild)
async function filesForScan(
	tx: OrgTx,
	orgId: string,
	diff: ContentDiff,
	rows: readonly FileRow[],
	want: boolean,
): Promise<AiFileInput[] | null> {
	if (!want) return null;
	if (diff.file.kind !== "replaced" || diff.file.diff) return null;
	if (diff.file.hint !== "no_text") return null;
	const out: AiFileInput[] = [];
	for (const r of rows) {
		const f = await aiFileOf(tx, orgId, r);
		if (!f) return null;
		out.push(f);
	}
	return out;
}

export type CompareInput = {
	ok: true;
	subject: string;
	from: string;
	to: string;
	classification: Classification;
	diff: ContentDiff;
	files: AiFileInput[] | null;
	target: string;
};

const FILE_COLS = {
	id: evidence.id,
	fileName: evidence.fileName,
	sha256: evidence.sha256,
	mimeType: evidence.mimeType,
	source: evidence.source,
	sizeBytes: evidence.sizeBytes,
	classification: evidence.classification,
	dlp: evidence.dlp,
};

// Dokument: Fassung `from` mit Fassung `to` bzw. der Arbeitskopie
export async function documentCompareInput(
	tx: OrgTx,
	c: OrgContext,
	input: { docNumber: string; from: string; to: string },
	wantFiles: boolean,
): Promise<CompareInput | InputFailure> {
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const d = await getDocumentByNumber(tx, c.orgId, input.docNumber);
	if (!d) return { ok: false, error: "notFound" };
	if (hidesSecret(c, d.doc)) return { ok: false, error: "forbidden" };
	const a = d.versions.find((v) => v.version === input.from);
	const b =
		input.to === "working"
			? d.doc
			: d.versions.find((v) => v.version === input.to);
	if (!a || !b) return { ok: false, error: "notFound" };
	const ids = [a.fileEvidenceId, b.fileEvidenceId].filter(
		(x): x is string => x !== null,
	);
	const files =
		ids.length > 0
			? await tx
					.select(FILE_COLS)
					// evidence:any-version — Dateien von Dokumentfassungen per ID
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, c.orgId),
							inArray(evidence.id, ids),
						),
					)
			: [];
	const classification = highestClass([
		d.doc.classification,
		...files.map((f) => f.classification),
	]);
	if (needsStepUp(c, classification))
		return { ok: false, error: "step_up_required" };
	const texts = await evidenceTextsFor(tx, c.orgId, ids);
	const byId = new Map(files.map((f) => [f.id, f]));
	const side = (v: {
		bodyMarkdown: string | null;
		fileEvidenceId: string | null;
	}): ContentSide => {
		const f = v.fileEvidenceId ? byId.get(v.fileEvidenceId) : undefined;
		return {
			bodyMarkdown: v.bodyMarkdown,
			file: f ? { name: f.fileName ?? "Datei", sha256: f.sha256 } : null,
			fileText: f ? fileTextOf(texts, f) : null,
		};
	};
	const diff = contentDiff(side(a), side(b), 2);
	const pair = [a.fileEvidenceId, b.fileEvidenceId]
		.map((id) => (id ? byId.get(id) : undefined))
		.filter((f): f is (typeof files)[number] => Boolean(f));
	return {
		ok: true,
		subject: `${d.doc.docNumber} ${d.doc.title}`,
		from: `Fassung ${a.version}`,
		to:
			input.to === "working"
				? `Arbeitskopie (Fassung ${d.doc.version})`
				: `Fassung ${input.to}`,
		classification,
		diff,
		files: await filesForScan(tx, c.orgId, diff, pair, wantFiles),
		target: `document:${d.doc.id}`,
	};
}

// Nachweis: aktuelle Fassung mit der ersetzten
export async function evidenceCompareInput(
	tx: OrgTx,
	c: OrgContext,
	evidenceId: string,
	wantFiles: boolean,
): Promise<CompareInput | InputFailure> {
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const detail = await evidenceDetail(tx, c.orgId, evidenceId);
	if (!detail) return { ok: false, error: "notFound" };
	const { row } = detail;
	if (!row.supersedesId) return { ok: false, error: "notFound" };
	const pair = await evidenceVersionSides(
		tx,
		c.orgId,
		row.supersedesId,
		row.id,
	);
	if (!pair) return { ok: false, error: "notFound" };
	const classification = highestClass([
		pair.before.classification,
		pair.after.classification,
	]);
	if (classification === "secret" && hidesSecret(c, { classification }))
		return { ok: false, error: "forbidden" };
	if (needsStepUp(c, classification))
		return { ok: false, error: "step_up_required" };
	const texts = await evidenceTextsFor(tx, c.orgId, [
		pair.before.id,
		pair.after.id,
	]);
	const md = async (id: string, templateKey: string | null) => {
		if (!templateKey) return null;
		const a = await authoredContentOf(tx, c.orgId, id);
		return a
			? renderBlocksMarkdown(authoredBlocks(a.template, a.content, a.preset))
			: null;
	};
	const side = async (r: typeof pair.before): Promise<ContentSide> => {
		const withFile = r.storageKey !== null && r.templateKey === null;
		return {
			bodyMarkdown: await md(r.id, r.templateKey),
			file: withFile ? { name: r.fileName ?? "Datei", sha256: r.sha256 } : null,
			fileText: withFile ? fileTextOf(texts, r) : null,
		};
	};
	const diff = contentDiff(await side(pair.before), await side(pair.after), 2);
	const rows = await tx
		.select(FILE_COLS)
		// evidence:any-version — beide Fassungen für die Datei an die KI
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, c.orgId),
				inArray(evidence.id, [pair.before.id, pair.after.id]),
			),
		);
	const ordered = [pair.before.id, pair.after.id]
		.map((id) => rows.find((r) => r.id === id))
		.filter((r): r is (typeof rows)[number] => Boolean(r));
	return {
		ok: true,
		subject: row.title,
		from: "ersetzte Fassung",
		to: "aktuelle Fassung",
		classification,
		diff,
		files: await filesForScan(tx, c.orgId, diff, ordered, wantFiles),
		target: `evidence:${row.id}`,
	};
}

// Anforderungen der aktiven Rahmenwerke je Control (aus dem Katalog)
function requirementsOf(code: string, active: ReadonlySet<string>) {
	return (EDGES_BY_CONTROL.get(code) ?? [])
		.filter((e) => active.has(e.requirement.split(":")[0] ?? ""))
		.slice(0, 6)
		.map((e) => {
			const r = REQUIREMENT_BY_KEY.get(e.requirement);
			return r ? { key: e.requirement, r } : null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);
}

export type CheckInput = {
	ok: true;
	title: string;
	content: string | null;
	file: AiFileInput | null;
	classification: Classification;
	controls: CheckControl[];
	target: string;
};

export async function evidenceCheckInput(
	tx: OrgTx,
	c: OrgContext,
	evidenceId: string,
	wantFiles: boolean,
): Promise<CheckInput | InputFailure> {
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const detail = await evidenceDetail(tx, c.orgId, evidenceId);
	if (!detail) return { ok: false, error: "notFound" };
	const { row } = detail;
	if (hidesSecret(c, row)) return { ok: false, error: "forbidden" };
	if (detail.controls.length === 0)
		return { ok: false, error: "ai_no_controls" };
	if (needsStepUp(c, row.classification))
		return { ok: false, error: "step_up_required" };
	let content: string | null = null;
	if (row.templateKey) {
		const a = await authoredContentOf(tx, c.orgId, row.id);
		if (a)
			content = renderBlocksMarkdown(
				authoredBlocks(a.template, a.content, a.preset),
			);
	} else if (row.storageKey) {
		const t = fileTextOf(await evidenceTextsFor(tx, c.orgId, [row.id]), row);
		if (t.status === "ok") content = t.text;
	}
	const file =
		content === null && row.storageKey && wantFiles
			? await aiFileOf(tx, c.orgId, row)
			: null;
	if (content === null && !file) return { ok: false, error: "ai_no_content" };
	if (content && row.description) content = `${row.description}\n\n${content}`;
	const active = new Set(await activeFrameworkSlugs(tx, c.orgId));
	const ctrls: CheckControl[] = detail.controls.slice(0, 8).map((x) => {
		const cat = CONTROL_BY_CODE.get(x.code);
		return {
			code: x.code,
			title: x.title,
			auditQuestions: cat?.auditQuestions ?? [],
			evidenceHints: cat?.evidenceHints ?? [],
			requirements: requirementsOf(x.code, active).map(({ key, r }) => ({
				key,
				title: r.title,
				text: r.requirementText,
				auditQuestions: r.auditQuestions ?? [],
				evidenceHints: r.evidenceHints ?? [],
			})),
		};
	});
	return {
		ok: true,
		title: row.title,
		content,
		file,
		classification: row.classification,
		controls: ctrls,
		target: `evidence:${row.id}`,
	};
}

const SECTOR: Record<string, string> = {
	casp: "Krypto-Dienstleister",
	bank: "Bank",
	payment: "Zahlungsinstitut",
	emi: "E-Geld-Institut",
	other: "Unternehmen",
};
const IT: Record<string, string> = {
	cloud: "Cloud",
	hybrid: "teils Cloud, teils eigene Server",
	own_dc: "eigenes Rechenzentrum",
};

export type DraftInput = {
	ok: true;
	title: string;
	type: string;
	outline: string | null;
	org: {
		sector: string;
		employees?: number;
		frameworks: string[];
		itOperation?: string;
	};
	controls: { code: string; title: string; description: string }[];
	requirements: DraftRequirement[];
	target: string;
};

// Entwurf: Vorlage, Titel, Art, verknüpfte Controls mit Anforderungen und
// das Firmenprofil (Branche, Größe, Rahmenwerke, IT) — keine anderen
// Dokumente, keine Namen
export async function draftInput(
	tx: OrgTx,
	c: OrgContext,
	documentId: string,
): Promise<DraftInput | InputFailure> {
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const [doc] = await tx
		.select()
		.from(documents)
		.where(
			and(eq(documents.id, documentId), eq(documents.organizationId, c.orgId)),
		)
		.limit(1);
	if (!doc) return { ok: false, error: "notFound" };
	if (doc.status !== "draft") return { ok: false, error: "locked" };
	const linked = await tx
		.select({ code: controls.code, title: controls.title })
		.from(documentControls)
		.innerJoin(controls, eq(controls.id, documentControls.controlId))
		.where(eq(documentControls.documentId, doc.id));
	const template = doc.templateCode
		? TEMPLATE_BY_CODE.get(doc.templateCode)
		: undefined;
	const codes = [
		...new Set([...linked.map((l) => l.code), ...(template?.controls ?? [])]),
	].slice(0, 8);
	const active = new Set(await activeFrameworkSlugs(tx, c.orgId));
	const [settings] = await tx
		.select({
			sector: orgSettings.sector,
			entityProfile: orgSettings.entityProfile,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, c.orgId))
		.limit(1);
	const profile = settings?.entityProfile ?? {};
	const seen = new Set<string>();
	const requirements: DraftRequirement[] = [];
	for (const code of codes)
		for (const { key, r } of requirementsOf(code, active)) {
			if (seen.has(key) || requirements.length >= 24) continue;
			seen.add(key);
			requirements.push({
				key,
				title: r.title,
				text: r.requirementText,
				guidance: r.guidance,
			});
		}
	return {
		ok: true,
		title: doc.title,
		type: doc.type,
		outline: template?.body ?? null,
		org: {
			sector: SECTOR[settings?.sector ?? "other"] ?? "Unternehmen",
			employees: profile.employees,
			frameworks: [...active]
				.map((s) => FRAMEWORK_BY_SLUG.get(s)?.name ?? s)
				.slice(0, 12),
			itOperation: profile.itOperation ? IT[profile.itOperation] : undefined,
		},
		controls: codes
			.map((code) => CONTROL_BY_CODE.get(code))
			.filter((x): x is NonNullable<typeof x> => Boolean(x))
			.map((x) => ({
				code: x.code,
				title: x.title,
				description: x.description,
			})),
		requirements,
		target: `document:${doc.id}`,
	};
}
