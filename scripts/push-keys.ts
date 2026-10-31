// Neues VAPID-Schlüsselpaar für Push-Benachrichtigungen (Web Push):
//   pnpm push:keys
// Gibt beide Schlüssel nur im Terminal aus (base64url). Der öffentliche kommt
// als WEB_PUSH_PUBLIC_KEY in den Drop-in push.conf, der private als
// systemd-Credential web_push_private_key (Runbook „Push-Benachrichtigungen“).
// Das Paar bleibt fest: ein neues Paar meldet alle Geräte ab.
import { generateVapidKeys } from "@/lib/push/webpush";

const { publicKey, privateKey } = generateVapidKeys();
process.stdout.write(
	[
		"Öffentlicher Schlüssel (WEB_PUSH_PUBLIC_KEY in push.conf):",
		publicKey,
		"",
		"Privater Schlüssel (nur als Credential web_push_private_key, nie in Env-Dateien):",
		privateKey,
		"",
	].join("\n"),
);
