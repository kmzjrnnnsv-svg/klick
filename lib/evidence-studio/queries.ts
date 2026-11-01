import { and, desc, eq } from "drizzle-orm";
import {
	controlEvidence,
	controlImplementations,
	controls,
	documentControls,
	documents,
	evidence,
} from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import type { OwnSetting, ParamTopic } from "@/lib/compliance/params";
import type { OrgTx } from "@/lib/db/with-org";
import { currentEvidence } from "@/lib/evidence/current";
import {
	buildSheet,
	indexSheetEvidence,
	type NachweisBogen,
	type SheetDocument,
	type SheetEvidence,
	type SheetEvidenceIndex,
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
		listSheetEvidence(tx, orgId),
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
		evidence: ev,
		documents: docs.map((d) => ({
			...d,
			controls: linksByDoc.get(d.id) ?? [],
		})),
		today: berlinToday(),
	};
}

// Nur die Felder, die der Nachweisbogen braucht (P2): kein Schnappschuss,
// kein verfasster Inhalt, keine Namen — sonst wuchs die Seite mit jedem
// Nachweis um ganze Zeilen. Reihenfolge wie das Register (neueste zuerst).
async function listSheetEvidence(
	tx: OrgTx,
	orgId: string,
): Promise<SheetEvidence[]> {
	const [rows, links] = await Promise.all([
		tx
			.select({
				id: evidence.id,
				title: evidence.title,
				sha256: evidence.sha256,
				kindCode: evidence.kindCode,
				contentSha256: evidence.contentSha256,
				createdAt: evidence.createdAt,
				validUntil: evidence.validUntil,
			})
			.from(evidence)
			.where(and(eq(evidence.organizationId, orgId), currentEvidence()))
			.orderBy(desc(evidence.createdAt)),
		tx
			.select({ evidenceId: controlEvidence.evidenceId, code: controls.code })
			// evidence:any-version — Zuordnung, gefiltert über die gelesenen Nachweise
			.from(controlEvidence)
			.innerJoin(
				controlImplementations,
				eq(controlImplementations.id, controlEvidence.implementationId),
			)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(eq(controlEvidence.organizationId, orgId)),
	]);
	const byEvidence = new Map<string, string[]>();
	for (const l of links) {
		const list = byEvidence.get(l.evidenceId);
		if (list) list.push(l.code);
		else byEvidence.set(l.evidenceId, [l.code]);
	}
	return rows.map((e) => ({
		...e,
		createdAt: e.createdAt.toISOString(),
		controls: (byEvidence.get(e.id) ?? []).sort(),
	}));
}

// Index je geladener SheetData einmal bauen, für alle Bögen der Seite
const indexes = new WeakMap<SheetData, SheetEvidenceIndex>();
function indexOf(data: SheetData): SheetEvidenceIndex {
	let ix = indexes.get(data);
	if (!ix) {
		ix = indexSheetEvidence(data.evidence, data.documents);
		indexes.set(data, ix);
	}
	return ix;
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
		index: indexOf(data),
	});
}
