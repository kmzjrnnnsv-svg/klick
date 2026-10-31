import { execFile } from "node:child_process";

// Befehle des Agenten: nur ip, wg, nft, swanctl, immer mit Argumentliste
// (nie über eine Shell). Im Trockenlauf (Tests, `--trocken`) werden sie nur
// aufgezeichnet; die Antworten kommen dann aus `replies`.

export const BINS = ["ip", "wg", "nft", "swanctl"] as const;
export type Bin = (typeof BINS)[number];

export type RunResult = { code: number; stdout: string; stderr: string };
export type Runner = (
	bin: Bin,
	args: readonly string[],
	opts?: { input?: string },
) => Promise<RunResult>;

const TIMEOUT_MS = 20_000;

/** Echte Ausführung; PATH setzt die systemd-Unit (/usr/sbin:/usr/bin). */
export const execRunner: Runner = (bin, args, opts) =>
	new Promise((resolve) => {
		const child = execFile(
			bin,
			[...args],
			{ timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
			(err, stdout, stderr) => {
				const code =
					err && typeof (err as { code?: unknown }).code === "number"
						? ((err as { code: number }).code as number)
						: err
							? 1
							: 0;
				resolve({ code, stdout: String(stdout), stderr: String(stderr) });
			},
		);
		if (opts?.input !== undefined) child.stdin?.end(opts.input);
		else child.stdin?.end();
	});

export type Recorded = { bin: Bin; args: string[]; input?: string };

/** Trockenlauf: zeichnet auf, antwortet aus `replies` (Schlüssel „bin args…“). */
export function dryRunner(
	replies: Record<string, Partial<RunResult>> = {},
): Runner & { calls: Recorded[] } {
	const calls: Recorded[] = [];
	const run = (async (
		bin: Bin,
		args: readonly string[],
		opts?: { input?: string },
	) => {
		calls.push({ bin, args: [...args], input: opts?.input });
		const key = `${bin} ${args.join(" ")}`;
		const hit =
			replies[key] ??
			Object.entries(replies).find(
				([k]) => k.endsWith("*") && key.startsWith(k.slice(0, -1)),
			)?.[1];
		return {
			code: hit?.code ?? 0,
			stdout: hit?.stdout ?? "",
			stderr: hit?.stderr ?? "",
		};
	}) as Runner & { calls: Recorded[] };
	run.calls = calls;
	return run;
}
