"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { restrictedView } from "@/lib/auth/visibility";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import {
	type BuilderOutcome,
	saveBuilderAnswers,
	startBuilder,
	switchToCustomText as toCustomText,
} from "@/lib/documents/builder/server";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	builderDocSchema,
	saveBuilderSchema,
} from "@/lib/validation/document-builder";

// Richtlinien-Baukasten am Dokument (Teil 5): starten, Antworten speichern
// (automatisch 2 s nach der letzten Eingabe), auf eigenen Text wechseln.
// Recht wie „Dokument bearbeiten“; Externe ohne „Entwürfe und Verlauf“ nie.

async function run(
	fn: (tx: OrgTx, orgId: string) => Promise<BuilderOutcome>,
	// Speichern im Hintergrund lädt die Seite nicht neu (Eingaben bleiben)
	refresh = true,
): Promise<ActionResult> {
	const c = await requireOrg({ document: ["update"] });
	if (restrictedView(c)) return { ok: false, error: "forbidden" };
	const res = await mutateOrg<BuilderOutcome>(toOrgCtx(c), async (tx) => {
		const out = await fn(tx, c.orgId);
		return { result: out, audit: out.ok ? out.audit : [] };
	});
	if (!res.ok) return { ok: false, error: res.error };
	if (refresh) revalidatePath("/dokumente", "layout");
	return { ok: true, data: undefined };
}

async function startPolicyBuilderImpl(input: unknown): Promise<ActionResult> {
	const parsed = builderDocSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { documentId } = parsed.data;
	return run((tx, orgId) => startBuilder(tx, orgId, documentId));
}

async function savePolicyBuilderImpl(input: unknown): Promise<ActionResult> {
	const parsed = saveBuilderSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { documentId, patch } = parsed.data;
	return run(
		(tx, orgId) => saveBuilderAnswers(tx, orgId, documentId, patch),
		false,
	);
}

async function switchToCustomTextImpl(input: unknown): Promise<ActionResult> {
	const parsed = builderDocSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { documentId } = parsed.data;
	return run((tx, orgId) => toCustomText(tx, orgId, documentId));
}

export const startPolicyBuilder = safeAction(
	"startPolicyBuilder",
	startPolicyBuilderImpl,
);
export const savePolicyBuilder = safeAction(
	"savePolicyBuilder",
	savePolicyBuilderImpl,
);
export const switchToCustomText = safeAction(
	"switchToCustomText",
	switchToCustomTextImpl,
);
