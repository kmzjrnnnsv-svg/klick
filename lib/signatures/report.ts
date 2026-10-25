import type { EvidenceSignature } from "@/db/schema/signatures";
import { parseSignText, signChallenge } from "./canonical";
import { merkleLeaf, verifyMerkleProof } from "./merkle";
import { type AssertionCheck, verifyAssertion } from "./verify";

// Prüfbericht je Unterschrift (pure): kanonischer Text passt zum Nachweis,
// Assertion gültig, bei Sammelunterschrift der Pfad zur Wurzel. Dieselbe
// Prüfung beschreibt signaturen.json für Prüfer:innen ohne Klick.

export type SignatureCheck = {
	text: boolean;
	assertion: AssertionCheck;
	merkle: boolean | null;
	valid: boolean;
};

const b = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export function checkSignature(
	row: Pick<
		EvidenceSignature,
		| "evidenceId"
		| "organizationId"
		| "sha256"
		| "signerUserId"
		| "signText"
		| "publicKey"
		| "authenticatorData"
		| "clientDataJSON"
		| "signature"
		| "batchId"
		| "merkleRoot"
		| "merkleProof"
	>,
	env: { origin: string; rpId: string },
): SignatureCheck {
	const f = parseSignText(row.signText);
	const merkle =
		row.batchId && row.merkleRoot && row.merkleProof
			? verifyMerkleProof(
					merkleLeaf(row.evidenceId, row.sha256),
					row.merkleProof,
					row.merkleRoot,
				)
			: null;
	const text = Boolean(
		f &&
			f.org === row.organizationId &&
			f.signer === row.signerUserId &&
			(row.batchId
				? f.target === `batch:${row.batchId}` && f.hash === row.merkleRoot
				: f.target === `evidence:${row.evidenceId}` && f.hash === row.sha256),
	);
	const assertion = verifyAssertion({
		publicKeyCose: b(row.publicKey),
		authenticatorData: b(row.authenticatorData),
		clientDataJSON: b(row.clientDataJSON),
		signature: b(row.signature),
		expectedChallenge: signChallenge(row.signText),
		expectedOrigin: env.origin,
		rpId: env.rpId,
	});
	return {
		text,
		assertion,
		merkle,
		valid: text && assertion.ok && merkle !== false,
	};
}

export function signaturesJson(input: {
	evidence: {
		id: string;
		title: string;
		fileName: string | null;
		sha256: string | null;
	};
	rows: EvidenceSignature[];
	env: { origin: string; rpId: string };
}) {
	return {
		format: "klick-signaturen/v1",
		evidence: input.evidence,
		verification: {
			rpId: input.env.rpId,
			origin: input.env.origin,
			steps: [
				"SHA-256 der Nachweis-Datei bilden und mit evidence.sha256 vergleichen.",
				"signText zerlegen (klick-sign/v1|org|target|hash|signer|function|purpose|nonce|expires); bei target evidence:<id> ist hash = evidence.sha256, bei target batch:<id> ist hash = merkleRoot.",
				'Sammelunterschrift: Blatt = SHA-256(0x00 ‖ "<evidenceId>|<sha256>"), Knoten = SHA-256(0x01 ‖ L ‖ R), mit merkleProof bis merkleRoot rechnen.',
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
			batch: r.batchId
				? { id: r.batchId, merkleRoot: r.merkleRoot, proof: r.merkleProof }
				: null,
			check: checkSignature(r, input.env),
		})),
	};
}
