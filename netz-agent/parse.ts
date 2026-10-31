// Ausgaben von swanctl und wg lesen — rein (Test netz-agent).

/**
 * `swanctl --list-sas`: je Verbindung, ob IKE „ESTABLISHED“ und mindestens
 * ein Child „INSTALLED“ ist. Zeilen ohne Einrückung sind IKE-SAs, eingerückte
 * mit „reqid“ sind Child-SAs.
 */
export function parseSwanctlSas(text: string): Map<string, boolean> {
	const ike = new Map<string, boolean>();
	const child = new Map<string, boolean>();
	for (const line of text.split("\n")) {
		const top = /^([A-Za-z0-9_-]+): #\d+, ([A-Z_]+)/.exec(line);
		if (top?.[1]) {
			ike.set(top[1], ike.get(top[1]) === true || top[2] === "ESTABLISHED");
			continue;
		}
		const sub = /^\s+([A-Za-z0-9_-]+): #\d+, reqid \d+, ([A-Z_]+)/.exec(line);
		if (sub?.[1])
			child.set(sub[1], child.get(sub[1]) === true || sub[2] === "INSTALLED");
	}
	const up = new Map<string, boolean>();
	for (const [name, established] of ike)
		up.set(name, established && child.get(name) === true);
	return up;
}

/**
 * `wg show <if> dump`: erste Zeile = Schnittstelle (privater Schlüssel,
 * öffentlicher Schlüssel, Port, fwmark), danach je Peer eine Zeile mit
 * Tabs; Feld 5 = letzter Handshake in Sekunden (0 = nie).
 */
export function parseWgDump(text: string): {
	publicKey: string | null;
	handshakes: Map<string, number>;
} {
	const lines = text.split("\n").filter((l) => l.trim());
	const head = lines[0]?.split("\t") ?? [];
	const handshakes = new Map<string, number>();
	for (const line of lines.slice(1)) {
		const f = line.split("\t");
		if (f.length < 8 || !f[0]) continue;
		const hs = Number(f[4]);
		handshakes.set(f[0], Number.isFinite(hs) ? hs : 0);
	}
	return {
		publicKey: head[1] && head[1] !== "(none)" ? head[1] : null,
		handshakes,
	};
}
