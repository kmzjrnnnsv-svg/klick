"use server";

import { getTranslations } from "next-intl/server";
import { safeAction } from "@/lib/actions/safe";
import { aiDecision } from "@/lib/ai/guard";
import {
	documentCompareInput,
	draftInput,
	evidenceCheckInput,
	evidenceCompareInput,
} from "@/lib/ai/inputs";
import type { AiFeature } from "@/lib/ai/policy";
import {
	comparePrompt,
	draftPrompt,
	evidenceCheckPrompt,
	helpPrompt,
} from "@/lib/ai/prompts";
import {
	type AiAnswer,
	aiCode,
	aiState,
	availabilityOf,
	runAi,
} from "@/lib/ai/service";
import { type OrgContext, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { articlePlain, articlesFor, rankHelp } from "@/lib/help";
import {
	aiCompareDocumentSchema,
	aiDraftSchema,
	aiEvidenceSchema,
	aiHelpSchema,
} from "@/lib/validation/ai";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Die vier KI-Funktionen (ADR-032), nur auf Klick: Fassungsvergleich,
// Dokument-Entwurf, Nachweisprüfung, Fragen an die Hilfe. Jede Action lädt
// die Inhalte selbst und geht über runAi (Regeln, Schwärzen, Verlauf). Die
// Antwort ist ein Vorschlag als Text — übernommen wird nur per eigenem
// Klick (Editor, Änderungsnotiz, Kommentar), nie hier.

// Erst prüfen, ob die Funktion überhaupt an ist, bevor Inhalte geladen
// oder Dateien entschlüsselt werden
async function precheck(
	c: OrgContext,
	feature: AiFeature,
): Promise<{ ok: false; error: string } | { ok: true; files: boolean }> {
	const state = await readOrg(toOrgCtx(c), (tx) => aiState(tx, c.orgId));
	const d = aiDecision(state.admin, state.policy, feature, {
		classification: null,
	});
	if (!d.ok) return { ok: false, error: aiCode(d.reason) };
	return { ok: true, files: availabilityOf(state).files };
}

const noChanges = (d: {
	added: number;
	removed: number;
	file: { kind: string };
}) => d.added + d.removed === 0 && d.file.kind === "none";

// 1 · Fassungen eines Dokuments zusammenfassen
async function aiCompareDocumentImpl(
	input: unknown,
): Promise<ActionResult<AiAnswer>> {
	const c = await requireOrg({ document: ["read"] });
	const parsed = aiCompareDocumentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const pre = await precheck(c, "compare");
	if (!pre.ok) return pre;
	const loaded = await readOrg(toOrgCtx(c), (tx) =>
		documentCompareInput(tx, c, parsed.data, pre.files),
	);
	if (!loaded.ok) return loaded;
	if (noChanges(loaded.diff)) return { ok: false, error: "ai_no_changes" };
	const p = comparePrompt({ ...loaded, withFiles: Boolean(loaded.files) });
	return runAi(c, {
		feature: "compare",
		classification: loaded.classification,
		target: loaded.target,
		system: p.system,
		messages: [{ role: "user", content: p.user }],
		files: loaded.files ?? undefined,
		maxTokens: 1500,
	});
}

// 1 · Nachweis gegenüber der ersetzten Fassung
async function aiCompareEvidenceImpl(
	input: unknown,
): Promise<ActionResult<AiAnswer>> {
	const c = await requireOrg({ evidence: ["read"] });
	const parsed = aiEvidenceSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const pre = await precheck(c, "compare");
	if (!pre.ok) return pre;
	const loaded = await readOrg(toOrgCtx(c), (tx) =>
		evidenceCompareInput(tx, c, parsed.data.evidenceId, pre.files),
	);
	if (!loaded.ok) return loaded;
	if (noChanges(loaded.diff)) return { ok: false, error: "ai_no_changes" };
	const p = comparePrompt({ ...loaded, withFiles: Boolean(loaded.files) });
	return runAi(c, {
		feature: "compare",
		classification: loaded.classification,
		target: loaded.target,
		system: p.system,
		messages: [{ role: "user", content: p.user }],
		files: loaded.files ?? undefined,
		maxTokens: 1500,
	});
}

// 2 · Entwurf aus Vorlage — landet ungespeichert im Editor
async function aiDraftDocumentImpl(
	input: unknown,
): Promise<ActionResult<AiAnswer>> {
	const c = await requireOrg({ document: ["update"] });
	const parsed = aiDraftSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const pre = await precheck(c, "draft");
	if (!pre.ok) return pre;
	const loaded = await readOrg(toOrgCtx(c), (tx) =>
		draftInput(tx, c, parsed.data.documentId),
	);
	if (!loaded.ok) return loaded;
	const t = await getTranslations("Documents");
	const typeKey = `type_${loaded.type}` as "type_policy";
	const p = draftPrompt({
		...loaded,
		typeLabel: t.has(typeKey) ? t(typeKey) : loaded.type,
	});
	return runAi(c, {
		feature: "draft",
		// Firmenprofil und Katalog: intern
		classification: "internal",
		target: loaded.target,
		system: p.system,
		messages: [{ role: "user", content: p.user }],
		maxTokens: 4000,
	});
}

// 3 · Nachweis gegen die Anforderungen der verknüpften Controls prüfen
async function aiCheckEvidenceImpl(
	input: unknown,
): Promise<ActionResult<AiAnswer>> {
	const c = await requireOrg({ evidence: ["read"] });
	const parsed = aiEvidenceSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const pre = await precheck(c, "evidence_check");
	if (!pre.ok) return pre;
	const loaded = await readOrg(toOrgCtx(c), (tx) =>
		evidenceCheckInput(tx, c, parsed.data.evidenceId, pre.files),
	);
	if (!loaded.ok) return loaded;
	const p = evidenceCheckPrompt({ ...loaded, withFile: Boolean(loaded.file) });
	return runAi(c, {
		feature: "evidence_check",
		classification: loaded.classification,
		target: loaded.target,
		system: p.system,
		messages: [{ role: "user", content: p.user }],
		files: loaded.file ? [loaded.file] : undefined,
		maxTokens: 2000,
	});
}

export type HelpAnswer = AiAnswer & {
	sources: { slug: string; title: string }[];
};

// 4 · Fragen an die Hilfe: nur passende Hilfeartikel gehen raus, keine
// Firmendaten (Einstufung null); auch für Mitarbeitende
async function aiAskHelpImpl(
	input: unknown,
): Promise<ActionResult<HelpAnswer>> {
	const c = await requireOrg(undefined, { employees: true });
	const parsed = aiHelpSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const pre = await precheck(c, "help");
	if (!pre.ok) return pre;
	const articles = rankHelp(articlesFor(c.orgRole), parsed.data.question, 4);
	if (articles.length === 0) return { ok: false, error: "ai_help_none" };
	const p = helpPrompt({
		question: parsed.data.question,
		articles: articles.map((a) => ({
			title: a.title,
			text: articlePlain(a).slice(0, 12_000),
		})),
	});
	const res = await runAi(c, {
		feature: "help",
		classification: null,
		target: "help",
		system: p.system,
		messages: [{ role: "user", content: p.user }],
		maxTokens: 1200,
	});
	if (!res.ok) return res;
	return {
		ok: true,
		data: {
			...res.data,
			sources: articles.map((a) => ({ slug: a.slug, title: a.title })),
		},
	};
}

export const aiCompareDocument = safeAction(
	"aiCompareDocument",
	aiCompareDocumentImpl,
);
export const aiCompareEvidence = safeAction(
	"aiCompareEvidence",
	aiCompareEvidenceImpl,
);
export const aiDraftDocument = safeAction(
	"aiDraftDocument",
	aiDraftDocumentImpl,
);
export const aiCheckEvidence = safeAction(
	"aiCheckEvidence",
	aiCheckEvidenceImpl,
);
export const aiAskHelp = safeAction("aiAskHelp", aiAskHelpImpl);
