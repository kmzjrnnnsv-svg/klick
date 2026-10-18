// Ablage der QA-Läufe: Sitzung, TOTP-Schlüssel und Report liegen in einem
// privaten Verzeichnis (0700, Dateien 0600) — nie im geteilten /tmp, wo
// andere Konten mitlesen oder Dateien vorab anlegen könnten.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const QA_BASE = process.env.QA_BASE ?? "http://localhost:3200";
const PORT = new URL(QA_BASE).port || "80";
export const QA_DIR =
	process.env.QA_DIR ?? join(homedir(), ".cache", "klick-qa");
mkdirSync(QA_DIR, { recursive: true, mode: 0o700 });

// Cookies unterscheiden sich zwischen Dev- und Prod-Build (Prefix), daher
// Sitzung je Port; der TOTP-Schlüssel gehört zum QA-Konto und ist geteilt.
export const QA_STATE = join(QA_DIR, `state-${PORT}.json`);
export const QA_SECRET = join(QA_DIR, "totp.txt");
export const QA_REPORT = join(QA_DIR, `report-${PORT}.json`);

export function writePrivate(path: string, data: string) {
	writeFileSync(path, data, { mode: 0o600 });
}
