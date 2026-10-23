import { decodeRequest, encodeResponse, requestLength } from "./protocol";
import { runJob } from "./run";

// Parser-Prozess (N6): liest genau eine Anfrage von stdin, schreibt eine
// Antwort auf stdout und beendet sich. In Produktion startet systemd ihn je
// Verbindung (klick-parse.socket, Accept=yes) ohne Netz, ohne Zugangsdaten,
// mit Speicher- und Zeitgrenze; in Entwicklung startet ihn die App als
// Kindprozess (lib/parse/client.ts).

const chunks: Buffer[] = [];
let size = 0;
let expected: number | null = null;

function fail(error: string): never {
	process.stdout.write(encodeResponse({ error }), () => process.exit(1));
	throw new Error(error);
}

async function finish(buf: Buffer) {
	const req = decodeRequest(buf);
	if (!req) fail("bad_request");
	try {
		const result = await runJob(req.job, req.body);
		process.stdout.write(encodeResponse({ result }), () => process.exit(0));
	} catch {
		fail("failed");
	}
}

process.stdin.on("data", (c: Buffer) => {
	chunks.push(c);
	size += c.length;
	if (expected === null) {
		expected = requestLength(Buffer.concat(chunks));
		if (expected === -1) fail("too_large");
	}
	if (expected !== null && expected > 0 && size >= expected) {
		process.stdin.pause();
		void finish(Buffer.concat(chunks).subarray(0, expected));
	}
});
process.stdin.on("end", () => {
	if (expected === null || size < expected) fail("truncated");
});
