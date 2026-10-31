import { env } from "@/lib/env";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import type { VapidKeys } from "./webpush";

// Konfiguration für Web Push (Push-Benachrichtigungen je Person). Ohne
// Schlüsselpaar ist Push aus: Einstellungen zeigen es nicht, der Job stellt
// nichts zu, Mails laufen wie bisher.

export function pushConfig(): VapidKeys | null {
	const e = env();
	if (!e.WEB_PUSH_PUBLIC_KEY || !e.WEB_PUSH_PRIVATE_KEY) return null;
	return {
		publicKey: e.WEB_PUSH_PUBLIC_KEY,
		privateKey: e.WEB_PUSH_PRIVATE_KEY,
		subject: `mailto:${PLATFORM_MAIL}`,
	};
}

export function pushConfigured(): boolean {
	return pushConfig() !== null;
}
