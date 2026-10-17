import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { globalDb } from "../db";
import {
	controlImplementations,
	controls,
	evidence,
	orgSettings,
} from "../db/schema";
import { audit } from "../lib/audit";
import { insertControlTest } from "../lib/compliance/control-test-service";
import {
	decryptBytes,
	sha256Hex,
	unpackEnvelope,
	unwrapDek,
} from "../lib/crypto/envelope";
import { withOrg } from "../lib/db/with-org";
import { loadEnvFiles } from "../lib/env";
import { evidenceAad } from "../lib/evidence/aad";

// Stichprobe aus der Offsite-Kopie der Nachweis-Dateien prüfen:
//   tsx scripts/verify-backup.ts [--sample 20]
//
// Je Stichprobe: Objekt aus dem Backup-Bucket (BACKUP_S3_*) laden, mit dem
// Org-DEK entschlüsseln (AAD an die ID gebunden), SHA-256 mit der DB
// vergleichen. Damit ist bewiesen, dass Kopie, Schlüssel und DB
// zusammenpassen — die Voraussetzung für einen Restore. Ist
// BACKUP_VERIFY_ORG_ID gesetzt (Mandant 0), steht das Ergebnis dort als
// Wirksamkeitstest an CC-BCM-03 (fail → Abweichung). Exit-Code 1 bei Fehlern
// (systemd OnFailure → Mail).

type Sample = {
	id: string;
	orgId: string;
	key: string;
	sha256: string;
	wrapped: string;
	keyVersion: number;
};

async function main() {
	loadEnvFiles();
	const i = process.argv.indexOf("--sample");
	const n = i > 0 ? Math.max(1, Number(process.argv[i + 1]) || 20) : 20;
	const endpoint = process.env.BACKUP_S3_ENDPOINT;
	const bucket = process.env.BACKUP_S3_BUCKET;
	if (!endpoint || !bucket) {
		console.error("BACKUP_S3_ENDPOINT/BACKUP_S3_BUCKET fehlen.");
		process.exit(2);
	}
	const backup = new S3Client({
		endpoint,
		region: process.env.BACKUP_S3_REGION ?? "eu-central-1",
		credentials: {
			accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? "",
			secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "",
		},
		forcePathStyle: true,
	});
	const prefix = process.env.BACKUP_S3_PREFIX ?? "";

	const samples = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return tx
			.select({
				id: evidence.id,
				orgId: evidence.organizationId,
				key: evidence.storageKey,
				sha256: evidence.sha256,
				wrapped: orgSettings.encryptedDek,
				keyVersion: orgSettings.keyVersion,
			})
			.from(evidence)
			.innerJoin(
				orgSettings,
				eq(orgSettings.organizationId, evidence.organizationId),
			)
			.where(and(isNotNull(evidence.storageKey), isNotNull(evidence.sha256)))
			.orderBy(sql`random()`)
			.limit(n);
	});

	const failures: string[] = [];
	for (const s of samples as Sample[]) {
		try {
			const out = await backup.send(
				new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${s.key}` }),
			);
			if (!out.Body) throw new Error("leer");
			const packed = new Uint8Array(await out.Body.transformToByteArray());
			const dek = await unwrapDek({
				wrapped: s.wrapped,
				keyVersion: s.keyVersion,
			});
			const plain = await decryptBytes(
				unpackEnvelope(packed),
				dek,
				evidenceAad(s.id),
			);
			if (sha256Hex(plain) !== s.sha256) throw new Error("SHA-256 weicht ab");
		} catch (err) {
			failures.push(`${s.id}: ${(err as Error).message}`);
		}
	}
	const ok = samples.length - failures.length;
	console.log(
		`→ ${ok}/${samples.length} Stichproben aus der Offsite-Kopie lesbar.`,
	);
	for (const f of failures) console.error(`✗ ${f}`);

	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		await audit(
			tx,
			{ userId: null },
			{
				action: "backup.verified",
				organizationId: null,
				target: "platform:backup",
				outcome: failures.length === 0 ? "success" : "failure",
				after: { sampled: samples.length, failed: failures.length },
			},
		);
	});

	const orgId = process.env.BACKUP_VERIFY_ORG_ID;
	if (orgId) {
		await withOrg({ orgId, userId: null }, async (tx) => {
			const [impl] = await tx
				.select({ id: controlImplementations.id })
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.organizationId, orgId),
						eq(controls.code, "CC-BCM-03"),
					),
				)
				.limit(1);
			if (!impl) return;
			const test = await insertControlTest(
				tx,
				{ orgId, userId: null },
				{
					implementationId: impl.id,
					method: "automated",
					scope: `Offsite-Kopie Nachweise: ${samples.length} Stichproben`,
					result: failures.length === 0 ? "pass" : "fail",
					notes:
						failures.length === 0
							? "Alle Stichproben entschlüsselt, SHA-256 stimmt."
							: `${failures.length} Stichproben fehlerhaft (Details im Journal von klick-backup-verify).`,
				},
			);
			for (const a of test.audits)
				await audit(tx, { userId: null }, { ...a, organizationId: orgId });
		});
	}
	process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
