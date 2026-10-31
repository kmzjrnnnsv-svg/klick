import { z } from "zod";
import { NOTIFICATION_KINDS } from "@/db/schema/enums";
import { DELIVERY_CHANNELS } from "@/db/schema/teams";

// Push-Benachrichtigungen je Person: Gerät anmelden (Abo aus dem Browser)
// und Kanäle je Art. Endpunkt nur bei bekannten Push-Diensten
// (pushEndpointAllowed in der Action), Schlüssel genau in der Länge aus
// RFC 8291 (P-256-Punkt 65 Byte, Auth 16 Byte, base64url).

const b64url = (bytes: number) =>
	z
		.string()
		.regex(/^[A-Za-z0-9_-]+={0,2}$/)
		.refine((s) => Buffer.from(s, "base64url").length === bytes, {
			message: "push_bad_keys",
		});

export const pushSubscriptionSchema = z.object({
	endpoint: z.string().min(10).max(1000),
	p256dh: b64url(65).refine((s) => Buffer.from(s, "base64url")[0] === 4, {
		message: "push_bad_keys",
	}),
	auth: b64url(16),
	label: z.string().trim().max(80).nullable().optional(),
});

export const channelPrefsSchema = z.object({
	channels: z.partialRecord(
		z.enum(NOTIFICATION_KINDS),
		z
			.array(z.enum(DELIVERY_CHANNELS))
			.max(DELIVERY_CHANNELS.length)
			// nichts gewählt = Mail, damit nichts verloren geht
			.transform((a) => (a.length === 0 ? ["mail" as const] : [...new Set(a)])),
	),
	digestEnabled: z.boolean(),
});
