import { connect } from "node:net";

// Optionaler Malware-Scan über clamd (INSTREAM-Protokoll, TCP). Aktiv, sobald
// CLAMD_HOST gesetzt ist. Fail closed: Ist der Scanner konfiguriert, aber nicht
// erreichbar, wird der Upload abgelehnt — lieber kein Nachweis als ein
// ungeprüfter. Reine Protokoll-Helfer (Framing, Parsen) sind getestet.

export type ScanResult =
	| { status: "clean" }
	| { status: "infected"; signature: string }
	| { status: "skipped" }
	| { status: "error"; detail: string };

const CHUNK = 64 * 1024;

// INSTREAM: "zINSTREAM\0" gefolgt von <u32 BE Länge><Daten>… und 0-Länge als Ende.
export function instreamFrames(bytes: Uint8Array): Uint8Array[] {
	const frames: Uint8Array[] = [new TextEncoder().encode("zINSTREAM\0")];
	for (let off = 0; off < bytes.byteLength; off += CHUNK) {
		const part = bytes.subarray(off, Math.min(off + CHUNK, bytes.byteLength));
		const head = new Uint8Array(4);
		new DataView(head.buffer).setUint32(0, part.byteLength, false);
		frames.push(head, part);
	}
	frames.push(new Uint8Array([0, 0, 0, 0]));
	return frames;
}

// Antwort: "stream: OK\0" | "stream: Eicar-Test-Signature FOUND\0" | "… ERROR\0"
export function parseClamdReply(reply: string): ScanResult {
	const line = reply.replace(/\0+$/, "").trim();
	if (/\bOK$/.test(line)) return { status: "clean" };
	const found = /^(?:stream|[^:]*):\s*(.+?)\s+FOUND$/.exec(line);
	if (found?.[1]) return { status: "infected", signature: found[1] };
	return { status: "error", detail: line || "leere Antwort" };
}

export function clamdConfigured(
	source: Record<string, string | undefined> = process.env,
): boolean {
	return Boolean(source.CLAMD_HOST?.trim());
}

export async function scanBytes(
	bytes: Uint8Array,
	opts: { host?: string; port?: number; timeoutMs?: number } = {},
): Promise<ScanResult> {
	const host = opts.host ?? process.env.CLAMD_HOST?.trim();
	if (!host) return { status: "skipped" };
	const port = opts.port ?? Number(process.env.CLAMD_PORT ?? "3310");
	const timeoutMs = opts.timeoutMs ?? 30_000;
	return new Promise<ScanResult>((resolve) => {
		const chunks: Buffer[] = [];
		let done = false;
		const finish = (r: ScanResult) => {
			if (done) return;
			done = true;
			socket.destroy();
			resolve(r);
		};
		const socket = connect({ host, port });
		socket.setTimeout(timeoutMs, () =>
			finish({ status: "error", detail: "clamd timeout" }),
		);
		socket.on("error", (err) =>
			finish({ status: "error", detail: `clamd: ${err.message}` }),
		);
		socket.on("data", (d) => chunks.push(d));
		socket.on("end", () =>
			finish(parseClamdReply(Buffer.concat(chunks).toString("utf8"))),
		);
		socket.on("connect", () => {
			for (const f of instreamFrames(bytes)) socket.write(f);
		});
	});
}
