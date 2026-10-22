// Rückweg nach dem Entsperren: nur Wallet-Seiten derselben Herkunft, nie die
// Entsperr-Seite selbst (sonst Schleife) und nie protokoll-relative Pfade.
export function walletReturnPath(raw: unknown): string {
	if (typeof raw !== "string") return "/wallet";
	if (!/^\/wallet(\/[A-Za-z0-9\-_/]*)?(\?[A-Za-z0-9\-_=&%.]*)?$/.test(raw))
		return "/wallet";
	if (raw.includes("//") || raw.startsWith("/wallet/entsperren"))
		return "/wallet";
	return raw;
}
