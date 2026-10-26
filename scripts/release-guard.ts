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
 * Vertrauensanker: Auf dem Server zeigt `RELEASE_ALLOWED_SIGNERS` auf eine
 * root-eigene Kopie außerhalb des Checkouts (`/etc/klick-release/allowed_signers`,
 * `deploy/rollout`). Sonst gälte die Datei aus genau dem Stand, der geprüft
 * wird — wer ins Repo schreiben kann, trüge dort den eigenen Schlüssel ein.
 *
 * Aufruf: `tsx scripts/release-guard.ts` (Exit 1 = abbrechen).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const SIGNERS_FILE = "deploy/release/allowed_signers";

/**
 * Woher die erlaubten Schlüssel kommen: `RELEASE_ALLOWED_SIGNERS` (absoluter
 * Pfad, root-eigen) vor der Datei im Checkout. Ein gesetzter, aber relativer
 * Pfad ist ein Fehler (null), kein stiller Rückfall auf die Repo-Datei.
 */
export function signersSource(
	env: Record<string, string | undefined>,
	root: string,
): { path: string; external: boolean } | null {
	const p = env.RELEASE_ALLOWED_SIGNERS?.trim();
	if (p) return isAbsolute(p) ? { path: p, external: true } : null;
	return { path: resolve(root, SIGNERS_FILE), external: false };
}

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
			"allowed_signers enthält keinen Schlüssel: signierte Tags werden noch nicht verlangt",
		);
	} else if (!input.tag) {
		errors.push("HEAD ist kein Tag; nur signierte Release-Tags werden gebaut");
	} else if (!input.verified) {
		errors.push(
			`Tag ${input.tag} hat keine gültige Signatur eines Schlüssels aus allowed_signers`,
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
	const source = signersSource(process.env, root);
	if (!source) {
		console.error(
			"release-guard: RELEASE_ALLOWED_SIGNERS muss ein absoluter Pfad sein",
		);
		process.exit(1);
	}
	let signersText = "";
	try {
		signersText = readFileSync(source.path, "utf8");
	} catch {
		// Ein ausdrücklich genannter Anker muss lesbar sein (fail closed)
		if (source.external) {
			console.error(`release-guard: ${source.path} nicht lesbar`);
			process.exit(1);
		}
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
						`gpg.ssh.allowedSignersFile=${source.path}`,
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
