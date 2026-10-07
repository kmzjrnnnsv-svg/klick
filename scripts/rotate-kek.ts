import { eq, sql } from "drizzle-orm";
import { globalDb } from "../db";
import { orgSettings } from "../db/schema";
import { audit } from "../lib/audit";
import { LocalKms } from "../lib/crypto/kms";
import { rewrapDek, rotationPlan } from "../lib/crypto/rotate";
import { loadEnvFiles } from "../lib/env";

// KEK-Rotation: `pnpm kek:rotate [--dry-run|--verify]`
//
// Ablauf (deploy/README.md):
//   1. neuen KEK erzeugen: openssl rand -base64 32
//   2. alten KEK als VAULT_KEK_BASE64_V<alt> behalten, neuen als VAULT_KEK_BASE64
//      hinterlegen, VAULT_KEK_VERSION hochzählen (systemd-Credentials)
//   3. pnpm kek:rotate --dry-run  → zeigt, welche Orgs betroffen sind
//   4. pnpm kek:rotate            → schreibt die DEKs neu um, auditiert je Org
//   5. pnpm kek:rotate --verify   → jede Org lässt sich mit dem aktuellen KEK öffnen
//   6. alten KEK aus den Credentials entfernen, App neu starten
//
// Läuft im Plattform-Kontext (RLS: app_is_platform()), jede Rotation steht
// als crypto.kek_rotated im Audit-Log der Org.
async function main() {
	loadEnvFiles();
	const args = new Set(process.argv.slice(2));
	const dryRun = args.has("--dry-run");
	const verify = args.has("--verify");
	const kms = LocalKms.fromEnv();

	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const rows = await tx
			.select({
				orgId: orgSettings.organizationId,
				encryptedDek: orgSettings.encryptedDek,
				keyVersion: orgSettings.keyVersion,
			})
			.from(orgSettings);
		const plan = rotationPlan(rows, kms.currentKeyVersion);
		console.log(
			`→ ${rows.length} Organisationen · aktueller KEK v${plan.currentVersion} · Verteilung: ${Object.entries(
				plan.byVersion,
			)
				.map(([v, n]) => `v${v}×${n}`)
				.join(", ")}`,
		);

		if (verify) {
			let ok = 0;
			for (const r of rows) {
				try {
					await kms.unwrap({
						wrapped: r.encryptedDek,
						keyVersion: r.keyVersion,
					});
					ok += 1;
				} catch (err) {
					console.error(`✗ ${r.orgId}: ${(err as Error).message}`);
				}
			}
			console.log(`✔ ${ok}/${rows.length} DEKs lesbar.`);
			if (ok !== rows.length) process.exitCode = 1;
			return;
		}

		if (plan.toRotate.length === 0) {
			console.log(
				"✔ Nichts zu tun — alle DEKs tragen die aktuelle KEK-Version.",
			);
			return;
		}
		if (dryRun) {
			console.log(`(dry-run) würde ${plan.toRotate.length} DEKs neu umhüllen.`);
			return;
		}

		await audit(
			tx,
			{ userId: null },
			{
				action: "platform.access",
				after: { reason: `kek rotation → v${kms.currentKeyVersion}` },
			},
		);
		let rotated = 0;
		for (const r of rows) {
			const { changed, next } = await rewrapDek(
				{ wrapped: r.encryptedDek, keyVersion: r.keyVersion },
				kms,
			);
			if (!changed) continue;
			await tx
				.update(orgSettings)
				.set({ encryptedDek: next.wrapped, keyVersion: next.keyVersion })
				.where(eq(orgSettings.organizationId, r.orgId));
			await audit(
				tx,
				{ userId: null },
				{
					action: "crypto.kek_rotated",
					organizationId: r.orgId,
					target: `organization:${r.orgId}`,
					before: { keyVersion: r.keyVersion },
					after: { keyVersion: next.keyVersion },
				},
			);
			rotated += 1;
		}
		console.log(
			`✔ ${rotated} DEKs auf KEK v${kms.currentKeyVersion} umgehüllt.`,
		);
	});
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((err) => {
		console.error("\n✗ KEK-Rotation fehlgeschlagen:");
		console.error(err);
		process.exit(1);
	});
