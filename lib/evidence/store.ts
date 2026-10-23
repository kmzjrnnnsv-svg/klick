import { and, eq } from "drizzle-orm";
import {
	controlEvidence,
	controlImplementations,
	evidence,
	orgSettings,
} from "@/db/schema";
import type {
	Classification,
	EvidenceDlp,
	EvidenceSource,
} from "@/db/schema/enums";
import {
	encryptBytes,
	packEnvelope,
	sha256Hex,
	unwrapDek,
} from "@/lib/crypto/envelope";
import { mutateOrg, type OrgCtx, type OrgTx, readOrg } from "@/lib/db/with-org";
import { DLP_ENGINE_VERSION, type DlpFinding } from "@/lib/dlp/detectors";
import { evaluateDlp, withDlpDefaults } from "@/lib/dlp/policy";
import { env } from "@/lib/env";
import { parseIsolated, screenResultSchema } from "@/lib/parse/client";
import { clamdConfigured, scanBytes } from "@/lib/uploads/clamav";
import { evidenceAad } from "./aad";

// Gemeinsame Upload-Pipeline für Nachweise — Nachweis-Dialog, Gap-Analyse,
// Scan-Import, Lieferantenportal nutzen dieselben Schritte:
//   1. screenUpload: Größe/Typ/Magic-Bytes, Textauszug und DLP-Erkennung im
//      eigenen Parser-Prozess (lib/parse, fail closed), optional clamd
//      (fail closed, Treffer als denied im Audit), DLP-Bewertung nach
//      Org-Regeln (blockieren / Warnung bestätigen / Klassifizierung anheben)
//   2. storeEncryptedEvidence: Org-DEK, AAD an die ID gebunden, S3-Key
//      org/<orgId>/nachweise/<uuid>, SHA-256 über den Klartext, DB-Zeile
//   3. linkEvidenceToControl: Verknüpfung mit einer Control-Umsetzung

export type EvidenceType =
	| "document"
	| "screenshot"
	| "link"
	| "config_export"
	| "attestation"
	| "log_extract";

export function s3Configured(): boolean {
	const e = env();
	return Boolean(e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
}

export type ScreenedUpload =
	| {
			ok: true;
			safeName: string;
			mime: string;
			// ggf. durch DLP angehoben, nie abgesenkt
			classification: Classification;
			dlp: EvidenceDlp;
	  }
	| { ok: false; error: string; detail?: string[] };

export async function screenUpload(
	ctx: OrgCtx,
	input: {
		name: string;
		bytes: Uint8Array;
		declaredMime?: string;
		classification: Classification;
		// Person hat die DLP-Warnung gesehen und bestätigt
		dlpAcknowledged?: boolean;
		// Scan-Berichte (gitleaks u. a.) enthalten Secrets erwartungsgemäß —
		// der Import redigiert sie; Secret-Treffer entscheiden dann nicht.
		secretsExpected?: boolean;
	},
): Promise<ScreenedUpload> {
	// Typprüfung, Textauszug und DLP-Erkennung nie im App-Prozess (N6)
	const parsed = await parseIsolated(
		{ op: "screen", name: input.name, declaredMime: input.declaredMime },
		input.bytes,
		screenResultSchema,
	);
	if (!parsed.ok) return { ok: false, error: "upload_parser_unavailable" };
	const v = parsed.data.validation;
	if (!v.ok) return { ok: false, error: `upload_${v.reason}` };

	// Optionaler Malware-Scan (clamd). Fail closed: konfiguriert, aber nicht
	// erreichbar → Upload abgelehnt. Treffer stehen als denied im Audit-Log.
	if (clamdConfigured()) {
		const scan = await scanBytes(input.bytes);
		if (scan.status !== "clean") {
			await mutateOrg(ctx, async () => ({
				result: null,
				audit: {
					action: "evidence.upload_blocked",
					target: `organization:${ctx.orgId}`,
					outcome: "denied" as const,
					after: {
						reason: scan.status,
						signature: scan.status === "infected" ? scan.signature : undefined,
						fileName: v.safeName,
					},
				},
			}));
			return {
				ok: false,
				error:
					scan.status === "infected"
						? "upload_malware"
						: "upload_scan_unavailable",
			};
		}
	}

	// DLP: Inhalt prüfen, Org-Regeln anwenden. Ergebnis enthält nur Zähler.
	const policy = withDlpDefaults(
		await readOrg(ctx, async (tx) => {
			const [s] = await tx
				.select({ dlpPolicy: orgSettings.dlpPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, ctx.orgId))
				.limit(1);
			return s?.dlpPolicy ?? null;
		}),
	);
	const extraction = parsed.data.extraction ?? {
		status: "unsupported" as const,
	};
	const findings: DlpFinding[] = parsed.data.findings ?? [];
	const decision = evaluateDlp(
		input.secretsExpected
			? findings.filter((f) => f.category !== "secret")
			: findings,
		policy,
		input.classification,
	);
	const dlp: EvidenceDlp = {
		engine: DLP_ENGINE_VERSION,
		scannedAt: new Date().toISOString(),
		extraction: extraction.status,
		truncated: extraction.status === "ok" ? extraction.truncated : undefined,
		findings,
		action: decision.action,
		acknowledged:
			decision.action === "warn" ? Boolean(input.dlpAcknowledged) : undefined,
		declaredClassification: decision.raised ? input.classification : undefined,
	};
	if (decision.action === "block") {
		await mutateOrg(ctx, async () => ({
			result: null,
			audit: {
				action: "evidence.upload_blocked",
				target: `organization:${ctx.orgId}`,
				outcome: "denied" as const,
				after: { reason: "dlp", fileName: v.safeName, dlp },
			},
		}));
		return { ok: false, error: "upload_dlp_blocked", detail: decision.reasons };
	}
	if (decision.action === "warn" && !input.dlpAcknowledged) {
		return { ok: false, error: "upload_dlp_warn", detail: decision.reasons };
	}
	return {
		ok: true,
		safeName: v.safeName,
		mime: v.mime,
		classification: decision.classification,
		dlp,
	};
}

export type StoreEvidenceInput = {
	orgId: string;
	bytes: Uint8Array;
	safeName: string;
	mime: string;
	title: string;
	description?: string | null;
	type: EvidenceType;
	classification: Classification;
	validUntil?: string | null;
	createdByUserId: string | null;
	source?: EvidenceSource;
	dlp?: EvidenceDlp | null;
	// vorab vergebene ID (erzeugte Nachweise drucken sie ins Dokument)
	id?: string;
};

export async function storeEncryptedEvidence(
	tx: OrgTx,
	input: StoreEvidenceInput,
): Promise<{ id: string; storageKey: string; sha256: string }> {
	const [s] = await tx
		.select({
			encryptedDek: orgSettings.encryptedDek,
			keyVersion: orgSettings.keyVersion,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, input.orgId))
		.limit(1);
	if (!s) throw new Error("org settings missing");
	const id = input.id ?? crypto.randomUUID();
	const storageKey = `org/${input.orgId}/nachweise/${id}`;
	const dek = await unwrapDek({
		wrapped: s.encryptedDek,
		keyVersion: s.keyVersion,
	});
	const sealed = await encryptBytes(input.bytes, dek, {
		keyVersion: s.keyVersion,
		aad: evidenceAad(id),
	});
	const { putBytes } = await import("@/lib/storage/s3");
	await putBytes(storageKey, packEnvelope(sealed));
	const sha256 = sha256Hex(input.bytes);
	await tx.insert(evidence).values({
		id,
		organizationId: input.orgId,
		title: input.title,
		description: input.description ?? null,
		type: input.type,
		classification: input.classification,
		fileName: input.safeName,
		mimeType: input.mime,
		sizeBytes: input.bytes.byteLength,
		storageKey,
		keyVersion: s.keyVersion,
		sha256,
		validUntil: input.validUntil ?? null,
		createdByUserId: input.createdByUserId,
		source: input.source ?? "manual",
		dlp: input.dlp ?? null,
	});
	return { id, storageKey, sha256 };
}

export async function linkEvidenceToControl(
	tx: OrgTx,
	orgId: string,
	implementationId: string,
	evidenceId: string,
): Promise<void> {
	const [impl] = await tx
		.select({ id: controlImplementations.id })
		.from(controlImplementations)
		.where(
			and(
				eq(controlImplementations.id, implementationId),
				eq(controlImplementations.organizationId, orgId),
			),
		)
		.limit(1);
	if (!impl) throw new Error("implementation not found");
	await tx
		.insert(controlEvidence)
		.values({ organizationId: orgId, implementationId, evidenceId })
		.onConflictDoNothing();
}
