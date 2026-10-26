import { resolveTxt } from "node:dns/promises";
import { txtMatches, txtRecordName } from "./rules";

// TXT-Eintrag _klick-portal.<domain> prüfen (5 s, Fehler = nicht gefunden).
export async function portalTxtState(
	domain: string,
	token: string,
): Promise<"ok" | "missing" | "mismatch"> {
	try {
		const records = await Promise.race([
			resolveTxt(txtRecordName(domain)),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("timeout")), 5_000),
			),
		]);
		return txtMatches(records, token) ? "ok" : "mismatch";
	} catch {
		return "missing";
	}
}
