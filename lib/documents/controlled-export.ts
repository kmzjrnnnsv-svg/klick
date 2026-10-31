import { and, eq, isNotNull } from "drizzle-orm";
import {
	documentAcknowledgements,
	documents,
	documentVersions,
	evidence,
	orgSettings,
} from "@/db/schema";
import type { DocumentSignature } from "@/db/schema/signatures";
import { historyFor } from "@/lib/audit";
import { roleLabel } from "@/lib/auth/memberships";
import {
	type FunctionKey,
	functionLabel as functionKeyLabel,
} from "@/lib/compliance/function-key";
import { userNames } from "@/lib/compliance/queries";
import { type OrgCtx, type OrgTx, readOrg } from "@/lib/db/with-org";
import { dbEnvelope, decryptEvidenceObject } from "@/lib/evidence/read";
import { evidenceTextsFor, type FileText } from "@/lib/evidence/text";
import { functionLabel as catalogFunctionLabel } from "@/lib/evidence-studio/generate/doc";
import { type PdfAttachment, renderPdf } from "@/lib/export/pdf";
import type { ExportMark } from "@/lib/export/respond";
import { orgRoleNames } from "@/lib/org/roles";
import {
	checkDocumentSignature,
	documentSignaturesFor,
	documentSignaturesJson,
} from "@/lib/signatures/document";
import {
	type ControlledInput,
	type ControlledVersion,
	controlledDocModel,
} from "./controlled-pdf";
import { diffLines } from "./diff";
import { DISTRIBUTION_ALL } from "./distribution";
import { diffStat, type VersionTrail, versionTrails } from "./trail";
import {
	currentPublished,
	validInPeriod,
	validRanges,
	versionState,
} from "./versions";

// PDF „Gelenkte Fassung“ je Dokument-Fassung (Dokumentenlenkung, ISO 27001
// 7.5.3): Laden im Org-Kontext (loadControlledSource), Rendern danach ohne
// Transaktion (renderControlledPdf — die Datei aus dem Objektspeicher kommt
// nicht aus der DB). Zugriff und Audit macht die aufrufende Route; Prüfer-Sicht
// bekommt nur die gültige Fassung (view "current"), das Prüfungspaket jede
// Fassung, die galt (view "published"), nie Entwürfe.

// Originaldatei nur bis zu dieser Größe ins PDF (sonst Hinweis „in Klick“)
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024;

const TYPE_LABEL: Record<string, string> = {
	policy: "Richtlinie",
	procedure: "Verfahrensanweisung",
	concept: "Konzept",
	plan: "Plan",
	manual: "Handbuch",
	template: "Vorlage",
	record: "Aufzeichnung",
	report: "Bericht",
	contract: "Vertrag",
	form: "Formular",
	marketing: "Marketingmitteilung",
};

const CLASS_LABEL: Record<string, string> = {
	public: "öffentlich",
	internal: "intern",
	confidential: "vertraulich",
	secret: "streng geheim",
};

type FileRef = {
	evidenceId: string;
	fileName: string;
	mimeType: string;
	sha256: string | null;
	sizeBytes: number | null;
	storageKey: string;
	packed?: Uint8Array;
};

export type ControlledSource = {
	documentId: string;
	versionId: string | null;
	docNumber: string;
	version: string;
	classification: string;
	input: Omit<ControlledInput, "exportId" | "exportedBy" | "now">;
	signatures: DocumentSignature[];
	contentSha256: string | null;
	file: FileRef | null;
	dek: { wrapped: string; keyVersion: number } | null;
};

export async function loadControlledSource(
	tx: OrgTx,
	orgId: string,
	documentId: string,
	opts: {
		// Fassungsnummer; leer = gültige Fassung, sonst die Arbeitskopie
		version?: string | null;
		// full = alles; current = nur die gültige Fassung (Prüfer-Sicht);
		// published = jede Fassung, die veröffentlicht war (Prüfungspaket)
		view: "full" | "current" | "published";
		env: { origin: string; rpId: string };
		orgName: string;
	},
): Promise<ControlledSource | null> {
	const [doc] = await tx
		.select()
		.from(documents)
		.where(
			and(eq(documents.organizationId, orgId), eq(documents.id, documentId)),
		)
		.limit(1);
	if (!doc) return null;
	const versions = await tx
		.select()
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.organizationId, orgId),
				eq(documentVersions.documentId, doc.id),
			),
		);
	versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	const current = currentPublished(versions);
	const wanted = opts.version ?? current?.version ?? doc.version;
	// Prüfer-Sicht: nur die Fassung, die jetzt gilt
	if (opts.view === "current" && (!current || wanted !== current.version))
		return null;
	const row = versions.find((v) => v.version === wanted) ?? null;
	if (opts.view === "published" && !row?.publishedAt) return null;
	// vernichtete Fassung (AP9.3): kein Inhalt mehr, kein PDF
	if (row?.destroyedAt) return null;
	// Welche Fassungen die Ansicht kennt (Verlauf, Unterschriften)
	const visible = (v: { id: string; publishedAt: Date | null }) =>
		opts.view === "full" ||
		(opts.view === "current" ? v.id === row?.id : v.publishedAt !== null);
	// Arbeitskopie ohne Zeile (Entwurf vor dem ersten Einreichen)
	if (!row && wanted !== doc.version) return null;
	// Arbeitskopie im Entwurf: Text und Datei stehen am Dokument, nicht in
	// der Fassung (die entsteht erst beim Einreichen)
	const working = wanted === doc.version && doc.status === "draft";
	const state =
		working || !row ? ("draft" as const) : versionState(row, doc, versions);
	const body = working ? doc.bodyMarkdown : (row?.bodyMarkdown ?? null);
	const fileId = working ? doc.fileEvidenceId : (row?.fileEvidenceId ?? null);

	const signatures = (await documentSignaturesFor(tx, orgId, doc.id)).filter(
		(s) => {
			const v = versions.find((x) => x.id === s.versionId);
			return v !== undefined && visible(v);
		},
	);
	const roleNames = await orgRoleNames(tx, orgId);
	const fnLabel = (k: string) =>
		functionKeyLabel(k as FunctionKey, catalogFunctionLabel, roleNames);
	// Verlauf je Fassung (wer bearbeitet hat) — nicht in der Prüfer-Sicht
	const trails =
		opts.view === "current"
			? new Map<string, VersionTrail>()
			: versionTrails(
					versions.at(-1)?.version ?? doc.version,
					(await historyFor(tx, `document:${doc.id}`, 2000)).map((h) => ({
						at: h.at,
						actorUserId: h.actorUserId,
						action: h.action,
						after: h.after,
					})),
				);
	const names = await userNames(tx, [
		doc.ownerUserId,
		...versions.map((v) => v.approvedByUserId),
		...[...trails.values()].flatMap((t) => t.editors.map((e) => e.userId)),
	]);

	let file: FileRef | null = null;
	let dek: ControlledSource["dek"] = null;
	if (fileId) {
		const [ev] = await tx
			.select({
				id: evidence.id,
				fileName: evidence.fileName,
				mimeType: evidence.mimeType,
				sha256: evidence.sha256,
				sizeBytes: evidence.sizeBytes,
				storageKey: evidence.storageKey,
			})
			// evidence:any-version — Datei einer Dokumentfassung, nie im Register
			.from(evidence)
			.where(and(eq(evidence.organizationId, orgId), eq(evidence.id, fileId)))
			.limit(1);
		if (ev?.storageKey) {
			file = {
				evidenceId: ev.id,
				fileName: ev.fileName ?? "datei",
				mimeType: ev.mimeType ?? "application/octet-stream",
				sha256: ev.sha256,
				sizeBytes: ev.sizeBytes,
				storageKey: ev.storageKey,
			};
			if ((ev.sizeBytes ?? Number.POSITIVE_INFINITY) <= ATTACH_MAX_BYTES) {
				file.packed = await dbEnvelope(tx, orgId, ev.id, ev.storageKey);
				const [s] = await tx
					.select({
						wrapped: orgSettings.encryptedDek,
						keyVersion: orgSettings.keyVersion,
					})
					.from(orgSettings)
					.where(eq(orgSettings.organizationId, orgId))
					.limit(1);
				dek = s ?? null;
			}
		}
	}

	const acks =
		row && state === "current"
			? (
					await tx
						.select({ id: documentAcknowledgements.id })
						.from(documentAcknowledgements)
						.where(
							and(
								eq(documentAcknowledgements.organizationId, orgId),
								eq(documentAcknowledgements.documentVersionId, row.id),
							),
						)
				).length
			: null;

	const ranges = validRanges(versions);
	const signersOf = (versionId: string) =>
		signatures
			.filter((s) => s.versionId === versionId)
			.map((s) => s.signerName);
	// Zeilen gegenüber der Vorgängerin (versions: neueste zuerst): Text in
	// Klick und Inhalt der Datei, soweit der Parser ihn gelesen hat
	const fileTexts =
		opts.view === "current"
			? new Map<string, FileText>()
			: await evidenceTextsFor(
					tx,
					orgId,
					versions
						.map((v) => v.fileEvidenceId)
						.filter((x): x is string => x !== null),
				);
	const textOf = (id: string | null) => {
		const t = id ? fileTexts.get(id) : undefined;
		return t?.status === "ok" ? t.text : null;
	};
	const statsOf = (v: (typeof versions)[number]) => {
		if (opts.view === "current") return null;
		const prev = versions[versions.indexOf(v) + 1];
		if (!prev) return null;
		const text = diffStat(
			diffLines(prev.bodyMarkdown ?? "", v.bodyMarkdown ?? ""),
		);
		const before = textOf(prev.fileEvidenceId);
		const after = textOf(v.fileEvidenceId);
		const file =
			prev.fileEvidenceId !== v.fileEvidenceId &&
			before !== null &&
			after !== null
				? diffStat(diffLines(before, after))
				: { added: 0, removed: 0 };
		return {
			added: text.added + file.added,
			removed: text.removed + file.removed,
		};
	};
	const asControlled = (v: (typeof versions)[number]): ControlledVersion => ({
		version: v.version,
		changeSummary: v.changeSummary,
		contentSha256: v.contentSha256,
		approvedAt: v.approvedAt,
		publishedAt: v.publishedAt,
		validFrom: ranges.get(v.id)?.from ?? null,
		validUntil: ranges.get(v.id)?.until ?? null,
		approvedBy: names.get(v.approvedByUserId ?? "") ?? null,
		signers: signersOf(v.id),
		lines: statsOf(v),
		editors: (trails.get(v.version)?.editors ?? [])
			.map((e) => names.get(e.userId ?? "") ?? null)
			.filter((n): n is string => n !== null),
	});
	// Verlauf je Ansicht (Prüfer-Sicht nur die gültige Fassung, ADR-025)
	const history = versions.filter(visible).map(asControlled);

	const own = row?.id ? signatures.filter((s) => s.versionId === row.id) : [];
	const distribution =
		doc.distribution.length === 0 || doc.distribution.includes(DISTRIBUTION_ALL)
			? ["Alle Mitglieder"]
			: doc.distribution.map((d) =>
					d.startsWith("function:")
						? fnLabel(d.slice("function:".length))
						: roleLabel(d),
				);

	return {
		documentId: doc.id,
		versionId: row?.id ?? null,
		docNumber: doc.docNumber,
		version: wanted,
		classification: doc.classification,
		contentSha256: row?.contentSha256 ?? null,
		signatures: own,
		file,
		dek,
		input: {
			org: opts.orgName,
			doc: {
				docNumber: doc.docNumber,
				title: doc.title,
				typeLabel: TYPE_LABEL[doc.type] ?? doc.type,
				classificationLabel:
					CLASS_LABEL[doc.classification] ?? doc.classification,
				owner: doc.ownerFunction
					? `${fnLabel(doc.ownerFunction)} · ${names.get(doc.ownerUserId ?? "") ?? "—"}`
					: (names.get(doc.ownerUserId ?? "") ?? null),
				approverFunction: doc.approverFunction
					? fnLabel(doc.approverFunction)
					: null,
				retentionYears: doc.retentionYears,
			},
			version: {
				...(row
					? asControlled(row)
					: {
							version: wanted,
							changeSummary: doc.changeSummary ?? "",
							contentSha256: null,
							approvedAt: null,
							publishedAt: null,
							validFrom: null,
							validUntil: null,
							approvedBy: null,
							signers: [],
							lines: null,
							editors: [],
						}),
				state,
				bodyMarkdown: body,
				file: file
					? {
							name: file.fileName,
							sha256: file.sha256,
							attached: false,
						}
					: null,
			},
			signatures: own.map((s) => ({
				name: s.signerName,
				functionLabel: s.function ? fnLabel(s.function) : null,
				signedAt: s.signedAt,
				credentialId: s.credentialId,
				valid: checkDocumentSignature(s, opts.env, row?.contentSha256 ?? null)
					.valid,
			})),
			history,
			distribution,
			acknowledgements: acks,
		},
	};
}

export function controlledFileName(src: ControlledSource): string {
	const safe = src.docNumber.replace(/[^A-Za-z0-9._-]+/g, "-");
	return `${safe}-v${src.version}-gelenkt.pdf`;
}

export function controlledSignaturesJson(
	src: ControlledSource,
	env: { origin: string; rpId: string },
): string {
	return JSON.stringify(
		documentSignaturesJson({
			document: {
				id: src.documentId,
				docNumber: src.docNumber,
				title: src.input.doc.title,
				versionId: src.versionId ?? "",
				version: src.version,
				contentSha256: src.contentSha256,
				fileSha256: src.file?.sha256 ?? null,
			},
			rows: src.signatures,
			env,
		}),
		null,
		2,
	);
}

// Rendert das PDF mit Anhängen: signaturen.json (immer, auch leer) und die
// Originaldatei der Fassung, wenn sie klein genug ist (attachFile: false
// lässt sie weg, z. B. wenn ein Paket seine Größengrenze erreicht).
export async function renderControlledPdf(
	src: ControlledSource,
	mark: ExportMark,
	env: { origin: string; rpId: string },
	opts: { attachFile?: boolean } = {},
): Promise<Uint8Array> {
	const attachments: PdfAttachment[] = [
		{
			name: "signaturen.json",
			mime: "application/json",
			description: "Unterschriften zum Prüfen ohne Klick",
			data: controlledSignaturesJson(src, env),
		},
	];
	let attached = false;
	if (src.file && src.dek && opts.attachFile !== false) {
		const bytes = await decryptEvidenceObject({
			evidenceId: src.file.evidenceId,
			storageKey: src.file.storageKey,
			dek: src.dek,
			packed: src.file.packed,
		});
		attachments.push({
			name: src.file.fileName,
			mime: src.file.mimeType,
			description: `Datei der Fassung ${src.version}`,
			data: bytes,
		});
		attached = true;
	}
	const input: ControlledInput = {
		...src.input,
		version: {
			...src.input.version,
			file: src.input.version.file
				? { ...src.input.version.file, attached }
				: null,
		},
		exportId: mark.exportId,
		exportedBy: mark.by,
		now: mark.at,
	};
	return renderPdf(controlledDocModel(input), { now: mark.at, attachments });
}

// Prüfungspaket: je Dokument (ohne streng geheim) jede Fassung, die im
// Zeitraum galt, als PDF „Gelenkte Fassung“. Originaldateien nur bis
// filesBudget (Summe), danach nur das PDF mit Prüfsumme der Datei.
export async function controlledPeriodEntries(
	orgCtx: OrgCtx,
	opts: {
		from: Date;
		to: Date;
		orgName: string;
		mark: ExportMark;
		env: { origin: string; rpId: string };
		prefix: string;
		filesBudget: number;
	},
): Promise<{ name: string; data: Uint8Array }[]> {
	const sources = await readOrg(orgCtx, async (tx) => {
		const docs = await tx
			.select({ id: documents.id, classification: documents.classification })
			.from(documents)
			.where(eq(documents.organizationId, orgCtx.orgId))
			.orderBy(documents.docNumber);
		const versions = await tx
			.select({
				id: documentVersions.id,
				documentId: documentVersions.documentId,
				version: documentVersions.version,
				approvedAt: documentVersions.approvedAt,
				publishedAt: documentVersions.publishedAt,
				retiredAt: documentVersions.retiredAt,
			})
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.organizationId, orgCtx.orgId),
					isNotNull(documentVersions.publishedAt),
				),
			);
		const out: ControlledSource[] = [];
		for (const d of docs) {
			if (d.classification === "secret") continue;
			const own = versions.filter((v) => v.documentId === d.id);
			for (const v of validInPeriod(own, opts.from, opts.to)) {
				const src = await loadControlledSource(tx, orgCtx.orgId, d.id, {
					version: v.version,
					view: "published",
					env: opts.env,
					orgName: opts.orgName,
				});
				if (src) out.push(src);
			}
		}
		return out;
	});
	const entries: { name: string; data: Uint8Array }[] = [];
	let used = 0;
	for (const src of sources) {
		const size = src.file?.sizeBytes ?? 0;
		const attachFile = used + size <= opts.filesBudget;
		if (attachFile) used += size;
		entries.push({
			name: `${opts.prefix}${controlledFileName(src)}`,
			data: await renderControlledPdf(src, opts.mark, opts.env, { attachFile }),
		});
	}
	return entries;
}
