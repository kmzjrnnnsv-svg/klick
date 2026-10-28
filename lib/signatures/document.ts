import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { documentSignatures, documents, documentVersions } from "@/db/schema";
import type { DocumentSignature } from "@/db/schema/signatures";
import type { AuditInput } from "@/lib/audit";
import type { SignedAssertion } from "@/lib/auth/passkey-sign";
import type { OrgTx } from "@/lib/db/with-org";
import {
	encodeSignText,
	parseSignText,
	type SignFields,
	signChallenge,
} from "./canonical";
import { holdsFunction, SIGN_VALID_MS } from "./service";
import { type AssertionCheck, verifyAssertion } from "./verify";

// Unterschrift unter einer Dokument-Fassung (Dokumentenlenkung, ISO 27001
// 7.5/A.5.1): „Freigeben und unterschreiben“ im Umlauf. Ziel und Prüfsumme
// rechnet der Server aus der eingereichten Fassung (Status in Prüfung,
// Nummer = aktuelle Fassung des Dokuments) — nie aus der Eingabe. Die
// Prüfsumme (document_versions.content_sha256) hält der Trigger ab der
// Freigabe fest; eine spätere Änderung am Text macht die Unterschrift im
// Prüfbericht ungültig.

export type DocumentSignTarget = {
	documentId: string;
	versionId: string;
	version: string;
	hash: string;
};

export async function documentSignTarget(
	tx: OrgTx,
	orgId: string,
	documentId: string,
): Promise<DocumentSignTarget | null> {
	const [row] = await tx
		.select({
			documentId: documents.id,
			status: documents.status,
			version: documents.version,
			versionId: documentVersions.id,
			hash: documentVersions.contentSha256,
		})
		.from(documents)
		.innerJoin(
			documentVersions,
			and(
				eq(documentVersions.documentId, documents.id),
				eq(documentVersions.version, documents.version),
			),
		)
		.where(
			and(eq(documents.organizationId, orgId), eq(documents.id, documentId)),
		)
		.limit(1);
	if (!row || row.status !== "in_review" || !row.hash) return null;
	return {
		documentId: row.documentId,
		versionId: row.versionId,
		version: row.version,
		hash: row.hash,
	};
}

export async function prepareDocumentSignText(
	tx: OrgTx,
	input: {
		orgId: string;
		userId: string;
		documentId: string;
		function: string;
		now?: Date;
	},
): Promise<{ text: string; fields: SignFields } | null> {
	const t = await documentSignTarget(tx, input.orgId, input.documentId);
	if (!t) return null;
	if (!(await holdsFunction(tx, input.orgId, input.userId, input.function)))
		return null;
	const now = input.now ?? new Date();
	const fields: SignFields = {
		org: input.orgId,
		target: `docver:${t.versionId}`,
		hash: t.hash,
		signer: input.userId,
		function: input.function,
		purpose: "approve",
		nonce: randomBytes(16).toString("hex"),
		expires: new Date(now.getTime() + SIGN_VALID_MS)
			.toISOString()
			.replace(/\.\d{3}Z$/, "Z"),
	};
	return { text: encodeSignText(fields), fields };
}

export async function storeDocumentSignature(
	tx: OrgTx,
	input: {
		orgId: string;
		documentId: string;
		fields: SignFields;
		signText: string;
		signerName: string;
		assertion: SignedAssertion;
		approvalRequestId: string | null;
	},
): Promise<{
	id: string;
	target: DocumentSignTarget;
	audit: AuditInput;
} | null> {
	const f = input.fields;
	const t = await documentSignTarget(tx, input.orgId, input.documentId);
	// Fassung seit dem Ausstellen geändert, eingereicht oder freigegeben
	if (!t || f.target !== `docver:${t.versionId}` || f.hash !== t.hash)
		return null;
	const [row] = await tx
		.insert(documentSignatures)
		.values({
			organizationId: input.orgId,
			documentId: t.documentId,
			versionId: t.versionId,
			version: t.version,
			contentSha256: t.hash,
			approvalRequestId: input.approvalRequestId,
			signerUserId: f.signer,
			signerName: input.signerName,
			function: f.function === "-" ? null : f.function,
			purpose: f.purpose,
			signText: input.signText,
			nonce: f.nonce,
			...input.assertion,
		})
		.onConflictDoNothing()
		.returning({ id: documentSignatures.id });
	// gleicher Einmalwert schon verwendet → Wiederholung
	if (!row) return null;
	return {
		id: row.id,
		target: t,
		audit: {
			action: "document.signed",
			target: `document:${t.documentId}`,
			after: {
				version: t.version,
				hash: t.hash,
				function: f.function,
				purpose: f.purpose,
				nonce: f.nonce,
				approvalRequestId: input.approvalRequestId,
				credentialId: input.assertion.credentialId,
				userVerified: input.assertion.userVerified,
			},
		},
	};
}

export async function documentSignaturesFor(
	tx: OrgTx,
	orgId: string,
	documentId: string,
): Promise<DocumentSignature[]> {
	return tx
		.select()
		.from(documentSignatures)
		.where(
			and(
				eq(documentSignatures.organizationId, orgId),
				eq(documentSignatures.documentId, documentId),
			),
		)
		.orderBy(documentSignatures.signedAt);
}

// Prüfung je Unterschrift (pure): Text passt zur Fassung, Assertion gültig.
export type DocumentSignatureCheck = {
	text: boolean;
	assertion: AssertionCheck;
	valid: boolean;
};

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export function checkDocumentSignature(
	row: Pick<
		DocumentSignature,
		| "organizationId"
		| "versionId"
		| "contentSha256"
		| "signerUserId"
		| "signText"
		| "publicKey"
		| "authenticatorData"
		| "clientDataJSON"
		| "signature"
	>,
	env: { origin: string; rpId: string },
	// aktuelle Prüfsumme der Fassung: weicht sie ab, ist der Text geändert
	currentHash?: string | null,
): DocumentSignatureCheck {
	const f = parseSignText(row.signText);
	const text = Boolean(
		f &&
			f.org === row.organizationId &&
			f.signer === row.signerUserId &&
			f.target === `docver:${row.versionId}` &&
			f.hash === row.contentSha256 &&
			(currentHash === undefined || currentHash === row.contentSha256),
	);
	const assertion = verifyAssertion({
		publicKeyCose: b64(row.publicKey),
		authenticatorData: b64(row.authenticatorData),
		clientDataJSON: b64(row.clientDataJSON),
		signature: b64(row.signature),
		expectedChallenge: signChallenge(row.signText),
		expectedOrigin: env.origin,
		rpId: env.rpId,
	});
	return { text, assertion, valid: text && assertion.ok };
}

// signaturen.json einer Dokument-Fassung (pure): alles, um die Unterschriften
// ohne Klick zu prüfen. Liegt dem PDF „Gelenkte Fassung“ als Anhang bei.
export function documentSignaturesJson(input: {
	document: {
		id: string;
		docNumber: string;
		title: string;
		versionId: string;
		version: string;
		contentSha256: string | null;
		fileSha256: string | null;
	};
	rows: DocumentSignature[];
	env: { origin: string; rpId: string };
}) {
	return {
		format: "klick-dokument-signaturen/v1",
		document: input.document,
		verification: {
			rpId: input.env.rpId,
			origin: input.env.origin,
			steps: [
				'contentSha256 nachrechnen: SHA-256 über das JSON {"v":1,"body":"<Text der Fassung>","file":"<SHA-256 der Datei oder null>"} (genau diese Reihenfolge, ohne Leerzeichen).',
				"signText zerlegen (klick-sign/v1|org|target|hash|signer|function|purpose|nonce|expires); target = docver:<versionId>, hash = contentSha256.",
				"challenge = base64url(SHA-256(signText)); clientDataJSON muss type webauthn.get, diese challenge und origin enthalten.",
				"authenticatorData: die ersten 32 Byte = SHA-256(rpId); Flags UP (0x01) und UV (0x04) gesetzt.",
				"Signatur über authenticatorData ‖ SHA-256(clientDataJSON) mit publicKey (COSE, base64url) prüfen.",
			],
		},
		signatures: input.rows.map((r) => ({
			signer: r.signerName,
			signerUserId: r.signerUserId,
			function: r.function,
			purpose: r.purpose,
			version: r.version,
			signedAt: r.signedAt.toISOString(),
			signText: r.signText,
			challenge: signChallenge(r.signText),
			credentialId: r.credentialId,
			publicKeyCose: r.publicKey,
			authenticatorData: r.authenticatorData,
			clientDataJSON: r.clientDataJSON,
			signature: r.signature,
			flags: {
				userVerified: r.userVerified,
				backupEligible: r.backupEligible,
				backupState: r.backupState,
			},
			signCount: r.signCount,
			check: checkDocumentSignature(r, input.env, input.document.contentSha256),
		})),
	};
}
