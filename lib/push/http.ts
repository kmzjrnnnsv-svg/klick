import { pinnedHttpsRequest } from "@/lib/net/pinned-https";
import type { Resolver } from "@/lib/security/quick-check/ssrf";
import { pushEndpointAllowed } from "./endpoint";
import {
	encryptPush,
	type PushTarget,
	type VapidKeys,
	vapidAuthorization,
} from "./webpush";

// Eine Push-Nachricht an ein Gerät senden: Inhalt verschlüsselt (RFC 8291),
// VAPID-Anmeldung, nur bekannte Push-Dienste, angeheftete Adresse, 15 s.

export type PushError =
	| "host_not_allowed"
	| "gone" // Abo abgelaufen oder abgemeldet (404/410): Gerät entfernen
	| "throttled"
	| "failed";

export type PushSender = (
	target: PushTarget,
	message: { title: string; body?: string; url: string; tag?: string },
	opts: { urgency?: "normal" | "high" },
) => Promise<{ ok: true } | { ok: false; error: PushError }>;

export function webPushSender(
	keys: VapidKeys,
	opts: { resolve?: Resolver; now?: () => number } = {},
): PushSender {
	return async (target, message, o) => {
		const url = pushEndpointAllowed(target.endpoint);
		if (!url) return { ok: false, error: "host_not_allowed" };
		let body: Buffer;
		try {
			body = encryptPush(target, Buffer.from(JSON.stringify(message), "utf8"));
		} catch {
			return { ok: false, error: "failed" };
		}
		const r = await pinnedHttpsRequest(
			url,
			{
				method: "POST",
				headers: {
					authorization: vapidAuthorization(
						target.endpoint,
						keys,
						(opts.now ?? Date.now)(),
					),
					"content-encoding": "aes128gcm",
					"content-type": "application/octet-stream",
					ttl: "86400",
					urgency: o.urgency ?? "normal",
				},
				body,
			},
			{ resolve: opts.resolve, timeoutMs: 15_000, maxBytes: 64 * 1024 },
		);
		if (!r.ok) return { ok: false, error: "failed" };
		const st = r.res.status;
		if (st >= 200 && st < 300) return { ok: true };
		if (st === 404 || st === 410) return { ok: false, error: "gone" };
		if (st === 429) return { ok: false, error: "throttled" };
		return { ok: false, error: "failed" };
	};
}
