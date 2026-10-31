// Nonce-CSP je Request (rein) — gemeinsam für Klick (proxy.ts) und both.money
// (apps/wallet/proxy.ts): script-src 'nonce-…' 'strict-dynamic' statt
// 'unsafe-inline'. Die übrigen Security-Header setzt next.config.ts der App.

export type CspOptions = {
	// zusätzliche Ziele für fetch/XHR neben 'self'
	connectSrc?: readonly string[];
};

export function buildCsp(
	nonce: string,
	isDev: boolean,
	opts: CspOptions = {},
): string {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
		// Tailwind/Next-Inline-Styles brauchen 'unsafe-inline' (kein Style-Nonce in RSC-Streams).
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		["connect-src 'self'", ...(opts.connectSrc ?? [])].join(" "),
		"frame-src 'self'",
		// Service Worker für Push (public/sw.js); ohne eigene Angabe fiele
		// worker-src auf script-src mit 'strict-dynamic' zurück
		"worker-src 'self'",
		"frame-ancestors 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		...(isDev ? [] : ["upgrade-insecure-requests"]),
	].join("; ");
}
