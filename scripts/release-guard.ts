/**
 * Release-Wächter (Härtung H8): `pnpm release` und `pnpm release:wallet`
 * bauen nur einen sauberen, freigegebenen Stand.
 *
 * - Arbeitsbaum ohne Änderungen (keine Datei auf dem Server von Hand geändert).
 * - Sobald `deploy/release/allowed_signers` einen Schlüssel enthält: HEAD ist
 *   genau ein Tag mit gültiger SSH-Signatur eines dieser Schlüssel
 *   (`git tag -s v2026.10.26 -m …` mit `gpg.format=ssh`). Ohne Schlüssel
 *   warnt der Wächter nur, damit die Umstellung den Betrieb nicht blockiert.
 *
 * Aufruf: `tsx scripts/release-guard.ts` (Exit 1 = abbrechen).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SIGNERS_FILE = "deploy/release/allowed_signers";

export type GuardInput = {
	/** Ausgabe von `git status --porcelain` */
	status: string;
	/** Tag genau auf HEAD, sonst null */
	tag: string | null;
	/** Anzahl hinterlegter Schlüssel in allowed_signers */
	signers: number;
	/** `git verify-tag` war erfolgreich */
	verified: boolean;
};

export type GuardResult = { ok: boolean; errors: string[]; warnings: string[] };

/** Zeilen von allowed_signers, die einen Schlüssel tragen (ohne Kommentare). */
export function countSigners(text: string): number {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#")).length;
}

export function releaseDecision(input: GuardInput): GuardResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const changed = input.status
		.split("\n")
		.map((l) => l.trimEnd())
		.filter(Boolean);
	if (changed.length > 0)
		errors.push(
			`Arbeitsbaum hat Änderungen (${changed.length}): ${changed.slice(0, 5).join(", ")}`,
		);
	if (input.signers === 0) {
		warnings.push(
			`${SIGNERS_FILE} enthält keinen Schlüssel: signierte Tags werden noch nicht verlangt`,
		);
	} else if (!input.tag) {
		errors.push("HEAD ist kein Tag; nur signierte Release-Tags werden gebaut");
	} else if (!input.verified) {
		errors.push(
			`Tag ${input.tag} hat keine gültige Signatur eines Schlüssels aus ${SIGNERS_FILE}`,
		);
	}
	return { ok: errors.length === 0, errors, warnings };
}

function git(args: string[], cwd: string): { out: string; ok: boolean } {
	try {
		const out = execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { out, ok: true };
	} catch {
		return { out: "", ok: false };
	}
}

function main(): void {
	const root = resolve(import.meta.dirname, "..");
	let signersText = "";
	try {
		signersText = readFileSync(resolve(root, SIGNERS_FILE), "utf8");
	} catch {
		signersText = "";
	}
	const signers = countSigners(signersText);
	const status = git(["status", "--porcelain"], root).out;
	const described = git(["describe", "--exact-match", "--tags", "HEAD"], root);
	const tag = described.ok ? described.out.trim() || null : null;
	const verified =
		signers > 0 && tag
			? git(
					[
						"-c",
						"gpg.format=ssh",
						"-c",
						`gpg.ssh.allowedSignersFile=${resolve(root, SIGNERS_FILE)}`,
						"verify-tag",
						tag,
					],
					root,
				).ok
			: false;
	const result = releaseDecision({ status, tag, signers, verified });
	for (const w of result.warnings) console.warn(`release-guard: Hinweis: ${w}`);
	for (const e of result.errors) console.error(`release-guard: ${e}`);
	if (!result.ok) process.exit(1);
	console.log(
		`release-guard: ok${tag ? ` (Tag ${tag}${verified ? ", signiert" : ""})` : ""}`,
	);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === resolve(import.meta.filename)
)
	main();
