// Öffentliche https-Adresse (kein localhost, keine internen Netze), ohne zod;
// gemeinsam für Server und Browser.

// Issuer/Discovery ruft der Server ab → nur https auf öffentliche Hosts
// (kein SSRF auf localhost, Metadaten-Dienste oder interne Netze).
export function isPublicHttpsUrl(value: string): boolean {
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		return false;
	}
	if (u.protocol !== "https:") return false;
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		(!host.includes(".") && !host.includes(":"))
	)
		return false;
	const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			a >= 224
		)
			return false;
	}
	if (host.includes(":")) {
		// IPv6-Literal: Loopback, link-local, ULA, v4-mapped sperren.
		if (
			host === "::1" ||
			host === "::" ||
			/^fe[89ab]/.test(host) ||
			/^f[cd]/.test(host) ||
			host.startsWith("::ffff:")
		)
			return false;
	}
	return true;
}
