import { eq } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	documentControls,
	documents,
} from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import type { OwnSetting, ParamTopic } from "@/lib/compliance/params";
import { listEvidenceWithControls } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import {
	buildSheet,
	type NachweisBogen,
	type SheetDocument,
	type SheetEvidence,
} from "./sheet";

// Daten für Nachweisbögen einer Org — einmal je Request laden, dann für
// beliebig viele Controls rechnen (Rahmenwerk-Seite, Anforderung, Control).

export type SheetData = {
	frameworks: string[];
	// Katalog der Org (R4), wenn die Abdeckung ihn mitbringt
	catalog?: OrgCatalog;
	notApplicable: Set<string>;
	states: Map<string, ControlSheetState>;
	evidence: SheetEvidence[];
	documents: SheetDocument[];
	today: string;
};

export const berlinToday = (now = new Date()): string =>
	new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);

export async function loadSheetData(
	tx: OrgTx,
	orgId: string,
	coverage: {
		frameworks: string[];
		applicabilityDetail: Map<string, { applicable: boolean }>;
		catalog?: OrgCatalog;
	},
): Promise<SheetData> {
	const notApplicable = new Set<string>();
	for (const [key, d] of coverage.applicabilityDetail)
		if (!d.applicable) notApplicable.add(key);

	const [impl, ev, docs, docLinks] = await Promise.all([
		tx
			.select({ code: controls.code, sheet: controlImplementations.sheet })
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(eq(controlImplementations.organizationId, orgId)),
		listEvidenceWithControls(tx, orgId),
		tx
			.select({
				id: documents.id,
				title: documents.title,
				templateCode: documents.templateCode,
				status: documents.status,
				reviewCycleMonths: documents.reviewCycleMonths,
			})
			.from(documents)
			.where(eq(documents.organizationId, orgId)),
		tx
			.select({ documentId: documentControls.documentId, code: controls.code })
			.from(documentControls)
			.innerJoin(controls, eq(controls.id, documentControls.controlId))
			.where(eq(documentControls.organizationId, orgId)),
	]);
	const linksByDoc = new Map<string, string[]>();
	for (const l of docLinks)
		linksByDoc.set(l.documentId, [
			...(linksByDoc.get(l.documentId) ?? []),
			l.code,
		]);
	return {
		frameworks: coverage.frameworks,
		catalog: coverage.catalog,
		notApplicable,
		states: new Map(
			impl
				.filter((r) => r.sheet)
				.map((r) => [r.code, r.sheet as ControlSheetState]),
		),
		evidence: ev.map((e) => ({
			id: e.id,
			title: e.title,
			sha256: e.sha256,
			kindCode: e.kindCode,
			contentSha256: e.contentSha256,
			createdAt: e.createdAt.toISOString(),
			validUntil: e.validUntil,
			controls: e.controlCodes,
		})),
		documents: docs.map((d) => ({
			...d,
			controls: linksByDoc.get(d.id) ?? [],
		})),
		today: berlinToday(),
	};
}

export function sheetFor(
	data: SheetData,
	controlCode: string,
): NachweisBogen | null {
	const state = data.states.get(controlCode);
	return buildSheet({
		controlCode,
		frameworks: data.frameworks,
		notApplicable: data.notApplicable,
		answers: state?.answers,
		items: state?.items,
		ownParams: (state?.ownParams ?? []).map(
			(p): OwnSetting => ({ ...p, topic: p.topic as ParamTopic }),
		),
		evidence: data.evidence,
		documents: data.documents,
		today: data.today,
		catalog: data.catalog,
	});
}
