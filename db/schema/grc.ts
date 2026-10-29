import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	date,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import {
	bytea,
	json,
	orgId,
	ownerFunction,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import { controls, requirements } from "./catalog";
import {
	CHANGE_KINDS,
	CHANGE_STATUS,
	CLASSIFICATIONS,
	CONTROL_TEST_METHODS,
	type ControlSheetState,
	ENTITY_KINDS,
	EVIDENCE_SOURCES,
	type EvidenceDlp,
	IMPL_STATUS,
	type INCIDENT_REGIMES,
	ROLE_FUNCTIONS,
} from "./enums";
import { products } from "./products";
import { assets, processes, providers, sites } from "./registers";

// GRC-Kern je Organisation: Control-Status, Anwendbarkeit, Nachweise,
// Dokumentenlenkung, Freigaben, Beschlüsse, Risiken, Vorfälle, Aufgaben,
// Zusammenarbeit. Alle Tabellen RLS-gescoped.

// ── Controls & Anwendbarkeit ───────────────────────────────────────────────

export const controlImplementations = pgTable(
	"control_implementations",
	{
		id: pk(),
		organizationId: orgId(),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
		status: text({ enum: IMPL_STATUS }).notNull().default("not_started"),
		source: text({ enum: ["onboarding", "baseline", "manual"] })
			.notNull()
			.default("onboarding"),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		assigneeUserId: userRef(),
		note: text(),
		implementedAt: ts(),
		lastReviewedAt: ts(),
		nextReviewAt: date(),
		// Nachweisbogen (Antworten, Belege, eigene Fristen) — Migration 0026
		sheet: json<ControlSheetState>(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.controlId),
		index("control_impl_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("control_implementations"),
	],
).enableRLS();

export const requirementApplicability = pgTable(
	"requirement_applicability",
	{
		id: pk(),
		organizationId: orgId(),
		requirementId: uuid()
			.notNull()
			.references(() => requirements.id, { onDelete: "cascade" }),
		applicable: boolean().notNull().default(true),
		note: text(),
		source: text({
			enum: ["services", "lex_specialis", "stage", "rule", "manual"],
		})
			.notNull()
			.default("manual"),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.requirementId),
		orgPolicy("requirement_applicability"),
	],
).enableRLS();

// ── Nachweise ──────────────────────────────────────────────────────────────

export const evidence = pgTable(
	"evidence",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		type: text({
			enum: [
				"document",
				"screenshot",
				"link",
				"config_export",
				"attestation",
				"log_extract",
			],
		})
			.notNull()
			.default("document"),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		fileName: text(),
		mimeType: text(),
		sizeBytes: integer(),
		// S3-Key org/<orgId>/nachweise/<uuid>; Inhalt mit Org-DEK verschlüsselt.
		storageKey: text(),
		keyVersion: integer(),
		sha256: text(),
		url: text(),
		validUntil: date(),
		supersedesId: uuid().references((): AnyPgColumn => evidence.id, {
			onDelete: "set null",
		}),
		// ersetzt durch eine neue Fassung (supersedeEvidence, Migration 0043):
		// zählt nicht mehr, nur die aktuelle Fassung (currentEvidence())
		supersededAt: ts(),
		supersededById: uuid().references((): AnyPgColumn => evidence.id, {
			onDelete: "set null",
		}),
		// für Mitarbeitende freigegeben (/richtlinien); nur öffentlich/intern,
		// wandert mit der neuen Fassung mit (Migration 0045)
		staffVisible: boolean().notNull().default(false),
		// Herkunft (manuell, Gap-Analyse, Scan-Import, API, Portal …)
		source: text({ enum: EVIDENCE_SOURCES }).notNull().default("manual"),
		// DLP-Ergebnis beim Upload: Treffer je Detektor (nur Zähler), Aktion,
		// Engine-Version — nie Inhalt (lib/dlp).
		dlp: json<EvidenceDlp>(),
		// Nachweis-Werkstatt: Nachweisart, Hash des erzeugten Inhalts und
		// Schnappschuss der Registerdaten (Migration 0026)
		kindCode: text(),
		contentSha256: text(),
		snapshot: json<Record<string, unknown>>(),
		// In Klick verfasst (Rohling): Vorlage und Inhalt feldverschlüsselt
		// (enc1, AAD evidence:<id>:content_enc) — Migration 0031
		templateKey: text(),
		contentEnc: text(),
		// verantwortlich, dass der Nachweis gültig bleibt (Funktion oder Person)
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("evidence_org_idx").on(t.organizationId),
		index("evidence_current_idx")
			.on(t.organizationId)
			.where(sql`${t.supersededAt} is null`),
		orgPolicy("evidence"),
	],
).enableRLS();

// Entwürfe verfasster Nachweise (Rohlinge): gemeinsam bearbeitbar, bis sie
// abgeschlossen werden — erst dann entsteht der Nachweis (unveränderlich,
// Änderung = neue Fassung über supersedesId).
export const evidenceDrafts = pgTable(
	"evidence_drafts",
	{
		id: pk(),
		organizationId: orgId(),
		templateKey: text().notNull(),
		preset: text(),
		title: text().notNull(),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		controlCodes: stringList(),
		// Funktionen, die unterschreiben; "-" = verfassende Person
		signers: stringList(),
		// enc1, AAD evidence_drafts:<id>:content_enc
		contentEnc: text(),
		// Position im Nachweisbogen, die der Nachweis schließt
		sheetControl: text(),
		sheetItem: text(),
		supersedesId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		createdByUserId: userRef(),
		updatedByUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		index("evidence_drafts_org_idx").on(t.organizationId),
		orgPolicy("evidence_drafts"),
	],
).enableRLS();

// Datei-Speicher ohne S3: verschlüsselte Nachweis-Objekte (Umschlag wie im
// Objektspeicher, Org-DEK, AAD an die Nachweis-ID gebunden) liegen hier;
// evidence.storageKey ist dann "db:<id>". Löschen kaskadiert mit dem
// Nachweis — Zeile und Objekt liegen im selben Backup.
export const evidenceBlobs = pgTable(
	"evidence_blobs",
	{
		evidenceId: uuid()
			.primaryKey()
			.references(() => evidence.id, { onDelete: "cascade" }),
		organizationId: orgId(),
		envelope: bytea().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("evidence_blobs_org_idx").on(t.organizationId),
		orgPolicy("evidence_blobs"),
	],
).enableRLS();

// Text einer hochgeladenen Datei für den Vergleich von Fassungen (Dokumente,
// Nachweise): vom isolierten Parser gelesen, ein Absatz je Zeile, mit dem
// Org-DEK verschlüsselt (enc1, AAD evidence_texts:<id>:text_enc). id = ID des
// Nachweises; weg mit der Datei. Schreiben nur über lib/evidence/text.ts.
export const evidenceTexts = pgTable(
	"evidence_texts",
	{
		id: uuid()
			.primaryKey()
			.references(() => evidence.id, { onDelete: "cascade" }),
		organizationId: orgId(),
		// ok · unsupported (Format) · no_text (Bild, Scan) · error · encrypted
		status: text({
			enum: ["ok", "unsupported", "no_text", "encrypted", "error"],
		}).notNull(),
		truncated: boolean().notNull().default(false),
		chars: integer().notNull().default(0),
		textEnc: text(),
		extractedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("evidence_texts_org_idx").on(t.organizationId),
		orgPolicy("evidence_texts"),
	],
).enableRLS();

export type EvidenceText = typeof evidenceTexts.$inferSelect;

// Verzögertes Löschen von Objekten im Speicher: Nachweis-Zeilen verschwinden
// sofort, die (verschlüsselten) Objekte erst nach Ablauf der Backup-
// Aufbewahrung (Job storage-purge). So findet ein DB-Restore jede Datei, die
// zum Backup-Zeitpunkt referenziert war.
export const storagePurgeQueue = pgTable(
	"storage_purge_queue",
	{
		id: pk(),
		organizationId: orgId(),
		storageKey: text().notNull(),
		reason: text({ enum: ["evidence_deleted", "orphan"] }).notNull(),
		refId: uuid(),
		requestedByUserId: userRef(),
		requestedAt: ts().notNull().defaultNow(),
		purgeAfter: ts().notNull(),
		purgedAt: ts(),
	},
	(t) => [
		unique().on(t.organizationId, t.storageKey),
		index("storage_purge_due_idx").on(t.purgeAfter),
		orgPolicy("storage_purge_queue"),
	],
).enableRLS();

export const controlEvidence = pgTable(
	"control_evidence",
	{
		id: pk(),
		organizationId: orgId(),
		implementationId: uuid().notNull(),
		evidenceId: uuid()
			.notNull()
			.references(() => evidence.id, { onDelete: "cascade" }),
	},
	(t) => [
		// Kurzer Name: der generierte würde Postgres' 63-Zeichen-Grenze reißen.
		foreignKey({
			name: "control_evidence_impl_fk",
			columns: [t.implementationId],
			foreignColumns: [controlImplementations.id],
		}).onDelete("cascade"),
		unique().on(t.implementationId, t.evidenceId),
		orgPolicy("control_evidence"),
	],
).enableRLS();

export const controlTests = pgTable(
	"control_tests",
	{
		id: pk(),
		organizationId: orgId(),
		implementationId: uuid().references(() => controlImplementations.id, {
			onDelete: "cascade",
		}),
		assetId: uuid().references(() => assets.id, { onDelete: "set null" }),
		processId: uuid().references(() => processes.id, { onDelete: "set null" }),
		// Notfallübung je kritischem Standort (Testprogramm, Kalender)
		siteId: uuid().references(() => sites.id, { onDelete: "set null" }),
		method: text({ enum: CONTROL_TEST_METHODS }).notNull(),
		scope: text(),
		plannedAt: date(),
		testedAt: ts(),
		testerUserId: userRef(),
		result: text({ enum: ["pass", "partial", "fail"] }),
		notes: text(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		nextTestAt: date(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("control_tests_impl_idx").on(t.implementationId),
		orgPolicy("control_tests"),
	],
).enableRLS();

// ── Dokumentenlenkung ──────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
	"policy",
	"procedure",
	"concept",
	"plan",
	"manual",
	"template",
	"record",
	"report",
	"contract",
	"form",
	// Marketingmitteilung (MiCAR Art. 66): eigene Freigabe marketing.publish
	"marketing",
] as const;

export const DOCUMENT_STATUS = [
	"draft",
	"in_review",
	"approved",
	"published",
	"retired",
	"superseded",
] as const;

export const documents = pgTable(
	"documents",
	{
		id: pk(),
		organizationId: orgId(),
		docNumber: text().notNull(),
		title: text().notNull(),
		type: text({ enum: DOCUMENT_TYPES }).notNull().default("policy"),
		domain: text(),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		authorUserId: userRef(),
		assigneeUserId: userRef(),
		approverFunction: text({ enum: ROLE_FUNCTIONS }),
		bodyMarkdown: text(),
		fileEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		version: text().notNull().default("0.1"),
		// Änderungsnotiz der Fassung in Arbeit; geht beim Einreichen in die
		// Fassung (document_versions.change_summary)
		changeSummary: text(),
		status: text({ enum: DOCUMENT_STATUS }).notNull().default("draft"),
		effectiveFrom: date(),
		reviewCycleMonths: integer().notNull().default(12),
		nextReviewAt: date(),
		supersedesDocumentId: uuid().references((): AnyPgColumn => documents.id, {
			onDelete: "set null",
		}),
		parentDocumentId: uuid().references((): AnyPgColumn => documents.id, {
			onDelete: "set null",
		}),
		// Rollen/Funktionen, die die Kenntnisnahme bestätigen müssen.
		distribution: stringList(),
		retentionYears: integer(),
		legalBasisRefs: stringList(),
		language: text().notNull().default("de"),
		templateCode: text(),
		isoMandatory: boolean().notNull().default(false),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.docNumber),
		index("documents_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("documents"),
	],
).enableRLS();

export const documentVersions = pgTable(
	"document_versions",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		version: text().notNull(),
		bodyMarkdown: text(),
		fileEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		changeSummary: text().notNull(),
		// Prüfsumme über Text und Datei beim Einreichen (versionContentHash)
		contentSha256: text(),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		publishedAt: ts(),
		// zurückgezogen: gilt ab hier nicht mehr (ohne Nachfolgerin)
		retiredAt: ts(),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	// Freigegebene oder veröffentlichte Fassungen sind unveränderlich
	// (Trigger document_versions_frozen, Migration 0042)
	(t) => [unique().on(t.documentId, t.version), orgPolicy("document_versions")],
).enableRLS();

export const documentControls = pgTable(
	"document_controls",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.controlId),
		orgPolicy("document_controls"),
	],
).enableRLS();

export const documentProcesses = pgTable(
	"document_processes",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.processId),
		orgPolicy("document_processes"),
	],
).enableRLS();

export const documentRequirements = pgTable(
	"document_requirements",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		requirementId: uuid()
			.notNull()
			.references(() => requirements.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.requirementId),
		orgPolicy("document_requirements"),
	],
).enableRLS();

export const documentAcknowledgements = pgTable(
	"document_acknowledgements",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		documentVersionId: uuid().notNull(),
		userId: uuid().notNull(),
		acknowledgedAt: ts().notNull().defaultNow(),
		method: text({ enum: ["click", "training"] })
			.notNull()
			.default("click"),
	},
	(t) => [
		foreignKey({
			name: "document_ack_version_fk",
			columns: [t.documentVersionId],
			foreignColumns: [documentVersions.id],
		}).onDelete("cascade"),
		unique().on(t.documentVersionId, t.userId),
		orgPolicy("document_acknowledgements"),
	],
).enableRLS();

// ── Prozess-Verknüpfungen ──────────────────────────────────────────────────

export const processControls = pgTable(
	"process_controls",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.controlId), orgPolicy("process_controls")],
).enableRLS();

export const processAssets = pgTable(
	"process_assets",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		assetId: uuid()
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.assetId), orgPolicy("process_assets")],
).enableRLS();

export const processProviders = pgTable(
	"process_providers",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		providerId: uuid()
			.notNull()
			.references(() => providers.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.processId, t.providerId),
		orgPolicy("process_providers"),
	],
).enableRLS();

// ── Freigabe-Workflows ─────────────────────────────────────────────────────

// Bedingung auf Fakten des Auslösers (lib/approvals/triggers.ts), z. B.
// { field: "criticality", op: "in", value: ["critical", "important"] }
export type ApprovalCondition = {
	field: string;
	op: "eq" | "neq" | "in" | "gte" | "lte" | "is_true" | "is_false";
	value?: string | number | readonly string[];
};

export type ApprovalStep = {
	order: number;
	// erste Stelle (Altbestand und Kurzanzeige); maßgeblich ist approvers
	approverRule: string; // function:<role_function> | role:<orgRole|roleId> | user:<id> | owner_of_entity | not_requester
	// alle Stellen der Stufe (Freigabe-Designer)
	approvers?: string[];
	// any: eine Person aus irgendeiner Stelle · all: jede Stelle stimmt zu
	mode?: "any" | "all";
	minApprovers?: number;
	slaDays?: number;
	label?: string;
	// Stufe entfällt, wenn die anfragende Person eine dieser Regeln erfüllt
	skipIf?: string[];
	// Stufe gilt nur, wenn alle Bedingungen auf die Fakten zutreffen
	onlyIf?: ApprovalCondition[];
	// alle Personen der Stellen stimmen zu (z. B. die ganze Geschäftsleitung):
	// beim Antrag aufgelöst zu user:-Stellen mit mode "all"
	everyone?: boolean;
	// Zustimmung nur als Unterschrift per Passkey über die eingereichte
	// Fassung (Dokumentenlenkung, lib/signatures/document.ts); ein einfaches
	// „Freigeben“ wird abgelehnt (signature_required)
	signature?: boolean;
	// im Schnappschuss: Stellen vor der Auflösung (Anzeige „Geschäftsleitung“)
	expandedFrom?: string[];
	// im Schnappschuss: Personen, deren Zustimmung mit dem Antrag gegeben ist
	// (anfragende Person hält die Stelle selbst)
	given?: string[];
	// im Schnappschuss am Antrag: warum die Stufe entfällt
	skipped?:
		| { by: "requester"; rule: string }
		| { by: "condition" }
		// Funktion nicht besetzt (nie bei der Geschäftsleitung)
		| { by: "vacant" };
};

export const approvalWorkflows = pgTable(
	"approval_workflows",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		kind: text().notNull(),
		name: text().notNull(),
		steps: json<ApprovalStep[]>().notNull().default([]),
		// Auslöser aus lib/approvals/triggers.ts (Backfill aus kind)
		trigger: text(),
		// wann dieser Ablauf gilt (Varianten mit Bedingung vor dem Standard)
		conditions: json<ApprovalCondition[]>().notNull().default([]),
		priority: integer().notNull().default(0),
		// vom Owner angelegte Variante (kind = custom_…)
		custom: boolean().notNull().default(false),
		description: text(),
		enabled: boolean().notNull().default(false),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.kind),
		orgPolicy("approval_workflows"),
	],
).enableRLS();

export const approvalRequests = pgTable(
	"approval_requests",
	{
		id: pk(),
		organizationId: orgId(),
		workflowId: uuid()
			.notNull()
			.references(() => approvalWorkflows.id, { onDelete: "restrict" }),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		entityVersionRef: text(),
		requestedByUserId: userRef(),
		requestedAt: ts().notNull().defaultNow(),
		currentStep: integer().notNull().default(1),
		status: text({
			enum: [
				"pending",
				"approved",
				"rejected",
				"changes_requested",
				"withdrawn",
				"expired",
			],
		})
			.notNull()
			.default("pending"),
		dueAt: ts(),
		decidedAt: ts(),
		// Solo-Modus: Vier-Augen nicht erfüllbar → begründete Selbstfreigabe.
		selfApproved: boolean().notNull().default(false),
		selfApprovalReason: text(),
		// Stufen-Schnappschuss je Antrag (B4: Freigabestufen je Risikoklasse);
		// null = Stufen des Workflows.
		steps: json<ApprovalStep[]>(),
	},
	(t) => [
		index("approval_requests_entity_idx").on(t.entityType, t.entityId),
		index("approval_requests_status_idx").on(t.organizationId, t.status),
		orgPolicy("approval_requests"),
	],
).enableRLS();

export const approvalDecisions = pgTable(
	"approval_decisions",
	{
		id: pk(),
		organizationId: orgId(),
		requestId: uuid()
			.notNull()
			.references(() => approvalRequests.id, { onDelete: "cascade" }),
		step: integer().notNull(),
		approverUserId: userRef(),
		decision: text({
			enum: ["approved", "rejected", "changes_requested"],
		}).notNull(),
		note: text(),
		// Stelle, für die die Zustimmung zählt (Stufen im Modus „alle“)
		rule: text(),
		decidedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("approval_decisions_request_idx").on(t.requestId),
		orgPolicy("approval_decisions"),
	],
).enableRLS();

export const delegations = pgTable(
	"delegations",
	{
		id: pk(),
		organizationId: orgId(),
		fromUserId: uuid().notNull(),
		toUserId: uuid().notNull(),
		scope: text().notNull().default("approvals"),
		validFrom: ts().notNull().defaultNow(),
		validUntil: ts().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("delegations_from_idx").on(t.fromUserId),
		orgPolicy("delegations"),
	],
).enableRLS();

// ── Beschlüsse der Leitung ─────────────────────────────────────────────────

export const resolutions = pgTable(
	"resolutions",
	{
		id: pk(),
		organizationId: orgId(),
		resolutionNumber: text().notNull(),
		date: date().notNull(),
		body: text({ enum: ["management", "supervisory", "shareholders"] })
			.notNull()
			.default("management"),
		subject: text().notNull(),
		decisionText: text().notNull(),
		legalBasis: text(),
		requiredCode: text(),
		linkedEntityType: text({ enum: ENTITY_KINDS }),
		linkedEntityId: uuid(),
		attendeeUserIds: stringList(),
		minutesEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		approvalRequestId: uuid().references(() => approvalRequests.id, {
			onDelete: "set null",
		}),
		// Bezug zum Rahmenwerk (E1): Slugs und Anforderungs-Schlüssel
		// („dora:Art. 28“), abgeleitet aus der Entität oder gewählt
		frameworks: stringList(),
		requirementKeys: stringList(),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.organizationId, t.resolutionNumber),
		orgPolicy("resolutions"),
	],
).enableRLS();

// Entscheidung beim Management anfragen (E2): Frage, Ausgangslage,
// Optionen, Frist, Bezug zu Entität und Anforderungen. Entschieden wird
// über den Workflow management_decision; das Ergebnis wird ein Beschluss.
export const decisionRequests = pgTable(
	"decision_requests",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		question: text().notNull(),
		context: text(),
		recommendation: text(),
		options: json<string[]>().notNull().default([]),
		dueAt: date(),
		linkedEntityType: text({ enum: ENTITY_KINDS }),
		linkedEntityId: uuid(),
		frameworks: stringList(),
		requirementKeys: stringList(),
		status: text({ enum: ["open", "decided", "withdrawn"] })
			.notNull()
			.default("open"),
		outcome: text({ enum: ["approved", "rejected", "changes_requested"] }),
		chosenOption: text(),
		decisionNote: text(),
		// Unterlagen zur Anfrage (Nachweise über die Upload-Pipeline)
		attachmentEvidenceIds: stringList(),
		approvalRequestId: uuid().references(() => approvalRequests.id, {
			onDelete: "set null",
		}),
		resolutionId: uuid().references(() => resolutions.id, {
			onDelete: "set null",
		}),
		requestedByUserId: userRef(),
		decidedByUserId: userRef(),
		decidedAt: ts(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("decision_requests_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("decision_requests"),
	],
).enableRLS();

// ── Risiken ────────────────────────────────────────────────────────────────

export const RISK_CATEGORIES = [
	"strategic",
	"operational",
	"ict_cyber",
	"compliance_legal",
	"financial",
	"third_party",
	"aml_fraud",
	"custody_keys",
	"market_liquidity",
] as const;

export const risks = pgTable(
	"risks",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		category: text({ enum: RISK_CATEGORIES }).notNull().default("operational"),
		likelihood: integer().notNull().default(3),
		impact: integer().notNull().default(3),
		treatment: text({ enum: ["mitigate", "accept", "transfer", "avoid"] })
			.notNull()
			.default("mitigate"),
		residualLikelihood: integer(),
		residualImpact: integer(),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		assigneeUserId: userRef(),
		// proposed: wartet auf Freigabe (Auslöser risk.create)
		status: text({
			enum: ["proposed", "open", "in_treatment", "accepted", "closed"],
		})
			.notNull()
			.default("open"),
		reviewAt: date(),
		acceptedByUserId: userRef(),
		acceptedAt: ts(),
		// Geführte Analyse (Risiko-Assistent): Szenario aus dem Katalog,
		// Einzelwerte je Schadensart (impact = höchster Wert), Kontext.
		scenarioCode: text(),
		impactDetail: json<Record<string, number>>(),
		impactDescription: text(),
		existingMeasures: text(),
		protectionGoals: stringList(),
		treatmentNote: text(),
		residualNote: text(),
		providerId: uuid().references(() => providers.id, { onDelete: "set null" }),
		assessedAt: ts(),
		// Herkunft (B1): woraus das Risiko erfasst wurde — Dienstleister, Asset,
		// Vorfall, Lücke, Befund, Abweichung, Ziel … (allgemein; providerId,
		// risk_assets und process_risks bleiben die fachlichen Bezüge).
		sourceEntityType: text({ enum: ENTITY_KINDS }),
		sourceEntityId: uuid(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("risks_org_status_idx").on(t.organizationId, t.status),
		index("risks_source_idx").on(
			t.organizationId,
			t.sourceEntityType,
			t.sourceEntityId,
		),
		orgPolicy("risks"),
	],
).enableRLS();

export const riskControls = pgTable(
	"risk_controls",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.riskId, t.controlId), orgPolicy("risk_controls")],
).enableRLS();

export const riskAssets = pgTable(
	"risk_assets",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		assetId: uuid()
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.riskId, t.assetId), orgPolicy("risk_assets")],
).enableRLS();

export const processRisks = pgTable(
	"process_risks",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.riskId), orgPolicy("process_risks")],
).enableRLS();

// ── Aufgaben & Zusammenarbeit ──────────────────────────────────────────────

export const tasks = pgTable(
	"tasks",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		assigneeUserId: userRef(),
		createdByUserId: userRef(),
		dueAt: date(),
		status: text({ enum: ["todo", "doing", "blocked", "done"] })
			.notNull()
			.default("todo"),
		priority: text({ enum: ["low", "normal", "high", "critical"] })
			.notNull()
			.default("normal"),
		entityType: text({ enum: ENTITY_KINDS }),
		entityId: uuid(),
		sourceKind: text({
			enum: [
				"manual",
				"remediation",
				"treatment",
				"review",
				"incident_action",
				"evidence_request",
				"access_review",
				"change",
				"obligation",
				"acknowledgement",
				"audit_request",
				"bundle",
				"escalation",
				"system",
				"assessment",
				"security_finding",
			],
		})
			.notNull()
			.default("manual"),
		bundleCode: text(),
		completedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("tasks_assignee_status_idx").on(t.assigneeUserId, t.status),
		index("tasks_entity_idx").on(t.entityType, t.entityId),
		orgPolicy("tasks"),
	],
).enableRLS();

// Neues Produkt, neuer Markt, neuer Vertriebsweg oder wesentliche
// IT-Änderung (ZAG-MaRisk/MaRisk AT 8, DORA Art. 8 Abs. 3): Antrag mit
// Freigabe (change.request); die Umsetzung läuft als Aufgabe.
export const changeRequests = pgTable(
	"change_requests",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		kind: text({ enum: CHANGE_KINDS }).notNull(),
		description: text(),
		processIds: stringList(),
		assetIds: stringList(),
		riskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
		status: text({ enum: CHANGE_STATUS }).notNull().default("pending"),
		requestedByUserId: userRef(),
		decidedAt: ts(),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("change_requests")],
).enableRLS();

export const riskTreatments = pgTable(
	"risk_treatments",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		title: text().notNull(),
		description: text(),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		dueAt: date(),
		status: text({ enum: ["planned", "in_progress", "done", "dropped"] })
			.notNull()
			.default("planned"),
		taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
		costEur: integer(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("risk_treatments_risk_idx").on(t.riskId),
		orgPolicy("risk_treatments"),
	],
).enableRLS();

export const comments = pgTable(
	"comments",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		authorUserId: userRef(),
		bodyMarkdown: text().notNull(),
		parentId: uuid().references((): AnyPgColumn => comments.id, {
			onDelete: "cascade",
		}),
		resolvedAt: ts(),
		editedAt: ts(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("comments_entity_idx").on(t.entityType, t.entityId),
		orgPolicy("comments"),
	],
).enableRLS();

export const watchers = pgTable(
	"watchers",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		userId: uuid().notNull(),
	},
	(t) => [
		unique().on(t.entityType, t.entityId, t.userId),
		orgPolicy("watchers"),
	],
).enableRLS();

export type TaskBundleItem = {
	title: string;
	assigneeRule?: string;
	offsetDays?: number;
	description?: string;
};

export const taskBundles = pgTable(
	"task_bundles",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		name: text().notNull(),
		description: text(),
		items: json<TaskBundleItem[]>().notNull().default([]),
		triggerEntityType: text({ enum: ENTITY_KINDS }),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("task_bundles")],
).enableRLS();

// ── Ausnahmen & Schadensfälle ──────────────────────────────────────────────

export const exceptions = pgTable(
	"exceptions",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		controlId: uuid().references(() => controls.id, { onDelete: "set null" }),
		documentId: uuid().references(() => documents.id, { onDelete: "set null" }),
		justification: text().notNull(),
		compensatingControls: text(),
		riskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		approvalRequestId: uuid().references(() => approvalRequests.id, {
			onDelete: "set null",
		}),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		validUntil: date().notNull(),
		status: text({ enum: ["requested", "approved", "expired", "revoked"] })
			.notNull()
			.default("requested"),
		...timestamps(),
	},
	(t) => [
		index("exceptions_org_idx").on(t.organizationId),
		orgPolicy("exceptions"),
	],
).enableRLS();

// ── Vorfälle ───────────────────────────────────────────────────────────────

export const incidents = pgTable(
	"incidents",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		awareAt: ts().notNull(),
		occurredAt: ts(),
		classifiedAt: ts(),
		regimes: json<(typeof INCIDENT_REGIMES)[number][]>()
			.notNull()
			.default(["dora"]),
		affectsPayments: boolean().notNull().default(false),
		doraCriteria: json<Record<string, unknown>>(),
		nis2Criteria: json<Record<string, unknown>>(),
		dsgvoCriteria: json<Record<string, unknown>>(),
		// CRA (Art. 14): betroffenes Produkt, Kriterien, Abhilfe verfügbar
		// (Uhr des Abschlussberichts bei aktiv ausgenutzten Schwachstellen)
		productId: uuid().references((): AnyPgColumn => products.id, {
			onDelete: "set null",
		}),
		craCriteria: json<Record<string, unknown>>(),
		mitigationAvailableAt: ts(),
		classification: text({
			enum: ["major", "significant", "minor", "unclassified"],
		})
			.notNull()
			.default("unclassified"),
		classificationOverrideNote: text(),
		earlyWarningAt: ts(),
		initialDueAt: ts(),
		intermediateDueAt: ts(),
		finalDueAt: ts(),
		initialReportedAt: ts(),
		intermediateReportedAt: ts(),
		finalReportedAt: ts(),
		rootCause: text(),
		// Geschäftsleitung informiert (Meldung an die Aufsicht): Kenntnisnahme
		managementAcknowledgedAt: ts(),
		managementAcknowledgedBy: userRef(),
		status: text({ enum: ["open", "contained", "resolved", "closed"] })
			.notNull()
			.default("open"),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		assigneeUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("incidents_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("incidents"),
	],
).enableRLS();

export const incidentUpdates = pgTable(
	"incident_updates",
	{
		id: pk(),
		organizationId: orgId(),
		incidentId: uuid()
			.notNull()
			.references(() => incidents.id, { onDelete: "cascade" }),
		authorUserId: userRef(),
		kind: text({
			enum: ["update", "report_sent", "status_change", "classification"],
		})
			.notNull()
			.default("update"),
		body: text().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("incident_updates_incident_idx").on(t.incidentId),
		orgPolicy("incident_updates"),
	],
).enableRLS();

export const lossEvents = pgTable(
	"loss_events",
	{
		id: pk(),
		organizationId: orgId(),
		occurredAt: date().notNull(),
		detectedAt: date(),
		amount: numeric({ precision: 18, scale: 2 }),
		currency: text().notNull().default("EUR"),
		recovery: numeric({ precision: 18, scale: 2 }),
		category: text().notNull(),
		cause: text(),
		description: text(),
		incidentId: uuid().references(() => incidents.id, { onDelete: "set null" }),
		riskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("loss_events_org_idx").on(t.organizationId),
		orgPolicy("loss_events"),
	],
).enableRLS();

// ── Meilensteine ───────────────────────────────────────────────────────────

export const milestones = pgTable(
	"milestones",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		phase: text(),
		status: text({ enum: ["todo", "doing", "done"] })
			.notNull()
			.default("todo"),
		dueAt: date(),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		assigneeUserId: userRef(),
		sortOrder: integer().notNull().default(0),
		...timestamps(),
	},
	(t) => [
		index("milestones_org_idx").on(t.organizationId),
		orgPolicy("milestones"),
	],
).enableRLS();

export const milestoneControls = pgTable(
	"milestone_controls",
	{
		id: pk(),
		organizationId: orgId(),
		milestoneId: uuid()
			.notNull()
			.references(() => milestones.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.milestoneId, t.controlId),
		orgPolicy("milestone_controls"),
	],
).enableRLS();

// ── Schulung ───────────────────────────────────────────────────────────────

export const trainings = pgTable(
	"trainings",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		heldAt: date().notNull(),
		trainerUserId: userRef(),
		externalTrainer: text(),
		attendeeUserIds: stringList(),
		audience: text({ enum: ["all", "management", "role_specific"] })
			.notNull()
			.default("all"),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		notes: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("trainings_org_idx").on(t.organizationId),
		orgPolicy("trainings"),
	],
).enableRLS();

export const trainingRequirements = pgTable(
	"training_requirements",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		function: text({ enum: ROLE_FUNCTIONS }),
		orgRole: text(),
		frequencyMonths: integer().notNull().default(12),
		legalBasis: text(),
		// Link zum Kurs (LMS, Video, Dokument) — „Zur Schulung“ im Plan.
		courseUrl: text(),
		// Vorschlag → Freigabe (Auslöser training.propose); nur approved
		// erzeugt Zuweisungen
		approvalStatus: text({ enum: ["proposed", "approved", "rejected"] })
			.notNull()
			.default("approved"),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		orgPolicy("training_requirements"),
	],
).enableRLS();

export const trainingAssignments = pgTable(
	"training_assignments",
	{
		id: pk(),
		organizationId: orgId(),
		requirementId: uuid()
			.notNull()
			.references(() => trainingRequirements.id, { onDelete: "cascade" }),
		userId: uuid().notNull(),
		dueAt: date().notNull(),
		completedAt: date(),
		trainingId: uuid().references(() => trainings.id, { onDelete: "set null" }),
		status: text({ enum: ["due", "overdue", "done"] })
			.notNull()
			.default("due"),
		// Manuell zugewiesen (null = aus Rolle/Funktion abgeleitet).
		assignedByUserId: userRef(),
		// Selbstbestätigung: Zertifikat/Nachweis und Notiz der Person.
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		note: text(),
	},
	(t) => [
		index("training_assignments_user_idx").on(t.userId, t.status),
		orgPolicy("training_assignments"),
	],
).enableRLS();

export type ControlImplementation = typeof controlImplementations.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Risk = typeof risks.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type Resolution = typeof resolutions.$inferSelect;
