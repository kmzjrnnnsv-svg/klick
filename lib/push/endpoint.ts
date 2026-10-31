// Endpunkte für Web Push nur bei bekannten Push-Diensten der Browser
// (Schutz gegen SSRF: der Endpunkt kommt aus dem Browser der Person).
// Chrome/Android: Google, Firefox: Mozilla, Safari/iOS: Apple, Edge: Microsoft.

const EXACT = new Set([
	"fcm.googleapis.com",
	"updates.push.services.mozilla.com",
	"web.push.apple.com",
]);
const SUFFIX = [".push.apple.com", ".notify.windows.com"];

export function pushEndpointAllowed(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.port !== "") return null;
	if (url.username || url.password) return null;
	if (raw.length > 1000) return null;
	const host = url.hostname.toLowerCase();
	if (EXACT.has(host)) return url;
	return SUFFIX.some((s) => host.endsWith(s) && host.length > s.length)
		? url
		: null;
}
