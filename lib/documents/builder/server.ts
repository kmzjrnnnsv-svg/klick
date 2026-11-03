import { and, eq } from "drizzle-orm";
import { documents } from "@/db/schema";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import {
	functionLabel as functionKeyLabel,
	ownRoleKey,
} from "@/lib/compliance/function-key";
import type { OrgTx } from "@/lib/db/with-org";
import { functionLabel as catalogFunctionLabel } from "@/lib/evidence-studio/generate/doc";
import { orgRoleNames } from "@/lib/org/roles";
import { orgName } from "@/lib/trust/service";
import { builderFor } from "./index";
import {
	changedKeys,
	cleanAnswers,
	prefillAnswers,
	type RenderContext,
	renderPolicy,
} from "./render";
import type { BuilderAnswer, DocumentBuilderState } from "./types";

// Richtlinien-Baukasten am Dokument (Teil 5): Kontext laden, starten,
// Antworten speichern, Modus wechseln. Nur im Entwurf; der Text am Dokument
// ist immer die Darstellung der Antworten, damit Fassung, Freigabe,
// Unterschrift und PDF unverändert bleiben.

export type BuilderOrgContext = {
	orgName: string;
	// Funktionsschlüssel → Anzeige (Katalog und eigene Rollen)
	functionNames: Record<string, string>;
	// bestellte Funktionen (für die Vorbelegung)
	held: string[];
};

export async function loadBuilderContext(
	tx: OrgTx,
	orgId: string,
): Promise<BuilderOrgContext> {
	const [name, roleNames, assignments] = await Promise.all([
		orgName(tx, orgId),
		orgRoleNames(tx, orgId),
		loadAssignments(tx, orgId),
	]);
	const functionNames: Record<string, string> = {};
	for (const f of ROLE_FUNCTIONS)
		if (f !== "other") functionNames[f] = catalogFunctionLabel(f);
	for (const [id, n] of Object.entries(roleNames))
		functionNames[ownRoleKey(id)] = n;
	return {
		orgName: name,
		functionNames,
		held: [...new Set(assignments.map((a) => a.function))],
	};
}

export function renderContextOf(
	ctx: BuilderOrgContext,
	title: string,
): RenderContext {
	return {
		title,
		orgName: ctx.orgName,
		functionName: (k) =>
			ctx.functionNames[k] ??
			functionKeyLabel(
				k as Parameters<typeof functionKeyLabel>[0],
				catalogFunctionLabel,
				{},
			),
	};
}

type Doc = {
	id: string;
	title: string;
	status: string;
	templateCode: string | null;
	builder: DocumentBuilderState | null;
	bodyMarkdown: string | null;
};

async function loadDoc(
	tx: OrgTx,
	orgId: string,
	documentId: string,
): Promise<Doc | null> {
	const [d] = await tx
		.select({
			id: documents.id,
			title: documents.title,
			status: documents.status,
			templateCode: documents.templateCode,
			builder: documents.builder,
			bodyMarkdown: documents.bodyMarkdown,
		})
		.from(documents)
		.where(
			and(eq(documents.organizationId, orgId), eq(documents.id, documentId)),
		)
		.limit(1);
	return d ?? null;
}

export type BuilderOutcome =
	| { ok: true; audit: AuditInput[] }
	| { ok: false; error: "notFound" | "locked" | "no_builder" | "custom_mode" };

/**
 * Baukasten starten (oder nach „Eigener Text“ zurück zum Baukasten): Text
 * aus den Antworten; beim ersten Start mit bestellten Funktionen vorbelegt.
 */
export async function startBuilder(
	tx: OrgTx,
	orgId: string,
	documentId: string,
): Promise<BuilderOutcome> {
	const doc = await loadDoc(tx, orgId, documentId);
	if (!doc) return { ok: false, error: "notFound" };
	if (doc.status !== "draft") return { ok: false, error: "locked" };
	const b = builderFor(doc.templateCode);
	if (!b) return { ok: false, error: "no_builder" };
	const ctx = await loadBuilderContext(tx, orgId);
	const answers: Record<string, BuilderAnswer> = doc.builder
		? cleanAnswers(b, doc.builder.answers)
		: prefillAnswers(b, new Set(ctx.held));
	const state: DocumentBuilderState = {
		template: b.code,
		version: b.version,
		mode: "builder",
		answers,
	};
	const { markdown } = renderPolicy(
		b,
		answers,
		renderContextOf(ctx, doc.title),
	);
	await tx
		.update(documents)
		.set({ builder: state, bodyMarkdown: markdown })
		.where(eq(documents.id, doc.id));
	return {
		ok: true,
		audit: [
			{
				action: "document.builder_started",
				target: `document:${doc.id}`,
				before: { mode: doc.builder?.mode ?? null },
				after: { mode: "builder", answered: Object.keys(answers).length },
			},
		],
	};
}

/**
 * Antworten speichern: `patch` enthält nur geänderte Schlüssel, `null`
 * löscht eine Antwort. Ungültige Werte fallen weg (cleanAnswers).
 */
export async function saveBuilderAnswers(
	tx: OrgTx,
	orgId: string,
	documentId: string,
	patch: Readonly<Record<string, unknown>>,
): Promise<BuilderOutcome & { answered?: number }> {
	const doc = await loadDoc(tx, orgId, documentId);
	if (!doc) return { ok: false, error: "notFound" };
	if (doc.status !== "draft") return { ok: false, error: "locked" };
	const b = builderFor(doc.templateCode);
	if (!b || !doc.builder) return { ok: false, error: "no_builder" };
	if (doc.builder.mode !== "builder")
		return { ok: false, error: "custom_mode" };
	const before = cleanAnswers(b, doc.builder.answers);
	const merged: Record<string, unknown> = { ...before };
	for (const [k, v] of Object.entries(patch)) {
		if (v === null) delete merged[k];
		else merged[k] = v;
	}
	const after = cleanAnswers(b, merged);
	const changed = changedKeys(before, after);
	if (changed.length === 0) return { ok: true, audit: [] };
	const ctx = await loadBuilderContext(tx, orgId);
	const { markdown } = renderPolicy(b, after, renderContextOf(ctx, doc.title));
	await tx
		.update(documents)
		.set({
			builder: { ...doc.builder, version: b.version, answers: after },
			bodyMarkdown: markdown,
		})
		.where(eq(documents.id, doc.id));
	return {
		ok: true,
		answered: Object.keys(after).length,
		audit: [
			{
				action: "document.builder_saved",
				target: `document:${doc.id}`,
				// nur die Schlüssel; die Antworten stehen im Text der Fassung
				after: { changed },
			},
		],
	};
}

/** „Eigener Text“: Antworten bleiben, der Text ist danach frei bearbeitbar */
export async function switchToCustomText(
	tx: OrgTx,
	orgId: string,
	documentId: string,
): Promise<BuilderOutcome> {
	const doc = await loadDoc(tx, orgId, documentId);
	if (!doc) return { ok: false, error: "notFound" };
	if (doc.status !== "draft") return { ok: false, error: "locked" };
	if (!doc.builder) return { ok: false, error: "no_builder" };
	if (doc.builder.mode === "custom") return { ok: true, audit: [] };
	await tx
		.update(documents)
		.set({ builder: { ...doc.builder, mode: "custom" } })
		.where(eq(documents.id, doc.id));
	return {
		ok: true,
		audit: [
			{
				action: "document.builder_custom",
				target: `document:${doc.id}`,
				before: { mode: "builder" },
				after: { mode: "custom" },
			},
		],
	};
}
