import { eq } from "drizzle-orm";
import { globalDb, sqlClient } from "../db";
import { user } from "../db/auth-schema";
import { loadEnvFiles } from "../lib/env";

// Zugang zurücksetzen (Plattform-Notfall): `pnpm auth:recover <email>`
//
// Für Konten, deren Passkeys verloren sind und die niemand in der eigenen
// Organisation zurücksetzen kann (z. B. die einzige Owner:in). Entfernt alle
// Passkeys, TOTP und Backup-Codes, beendet alle Sitzungen und gibt einen
// Einmal-Link (24 Stunden) aus, über den die Person einen neuen Passkey
// anlegt. Der Link erscheint nur im Terminal; Audit auth.recover_link_cli,
// die Person bekommt eine Hinweis-Mail ohne Link.
async function main() {
	loadEnvFiles();
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email?.includes("@")) {
		console.error("Aufruf: pnpm auth:recover <email>");
		process.exit(2);
	}
	// Erst nach loadEnvFiles laden: BETTER_AUTH_URL wird beim Import gelesen.
	const { findResetTarget, resetUserAccess } = await import(
		"../lib/auth/recover"
	);
	const [u] = await globalDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	const target = u ? await findResetTarget(u.id) : null;
	if (!target) {
		console.error("✗ Zu dieser Adresse gibt es kein Konto.");
		process.exitCode = 1;
		return;
	}
	const { url, expiresAt } = await resetUserAccess({
		target,
		actor: { userId: null, label: "Der Klick-Support" },
		via: "cli",
	});
	console.log(
		`\nPasskeys, TOTP und Sitzungen von ${email} sind entfernt.\nLink für den neuen Passkey (einmalig, gültig bis ${expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}, nur persönlich weitergeben):\n\n${url}\n`,
	);
}

main()
	.catch((err) => {
		console.error("\n✗ Zurücksetzen fehlgeschlagen:");
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sqlClient.end({ timeout: 5 });
		process.exit();
	});
