import { describe, expect, it } from "vitest";
import { pushEndpointAllowed } from "@/lib/push/endpoint";
import { webPushSender } from "@/lib/push/http";
import { generateVapidKeys } from "@/lib/push/webpush";
import {
	channelPrefsSchema,
	pushSubscriptionSchema,
} from "@/lib/validation/push";

// Web Push je Person: nur bekannte Push-Dienste (Schutz gegen SSRF, der
// Endpunkt kommt aus dem Browser), Schlüssel in der Länge aus RFC 8291,
// Kanäle je Art mit Rückfall auf Mail.

describe("Endpunkte nur bei bekannten Push-Diensten", () => {
	it.each([
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://web.push.apple.com/QGx1",
		"https://api.push.apple.com/3/device/x",
		"https://wns2-db5p.notify.windows.com/w/?token=abc",
	])("erlaubt %s", (u) => {
		expect(pushEndpointAllowed(u)).not.toBeNull();
	});
	it.each([
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://fcm.googleapis.com:8443/fcm/send/abc",
		"https://user:pw@fcm.googleapis.com/fcm/send/abc",
		"https://evil.example/fcm.googleapis.com",
		"https://fcm.googleapis.com.evil.example/x",
		"https://push.apple.com/x",
		"https://notify.windows.com/x",
		"https://127.0.0.1/x",
		"https://localhost/x",
		"file:///etc/passwd",
		"kein Link",
		`https://fcm.googleapis.com/${"a".repeat(1000)}`,
	])("lehnt %s ab", (u) => {
		expect(pushEndpointAllowed(u)).toBeNull();
	});
	it("Sender schickt nie an fremde Hosts", async () => {
		const send = webPushSender({
			...generateVapidKeys(),
			subject: "mailto:x@y.de",
		});
		const res = await send(
			{ endpoint: "https://10.0.0.1/x", p256dh: "a", auth: "b" },
			{ title: "t", url: "https://raza.work/heute" },
			{},
		);
		expect(res).toEqual({ ok: false, error: "host_not_allowed" });
	});
});

describe("Abo aus dem Browser prüfen", () => {
	const p256dh = Buffer.concat([
		Buffer.from([4]),
		Buffer.alloc(64, 7),
	]).toString("base64url");
	const auth = Buffer.alloc(16, 3).toString("base64url");
	it("nimmt ein gültiges Abo an", () => {
		const r = pushSubscriptionSchema.safeParse({
			endpoint: "https://fcm.googleapis.com/fcm/send/abc",
			p256dh,
			auth,
			label: "Chrome auf Mac",
		});
		expect(r.success).toBe(true);
	});
	it("lehnt falsche Schlüssellängen und komprimierte Punkte ab", () => {
		const base = { endpoint: "https://fcm.googleapis.com/fcm/send/abc" };
		expect(
			pushSubscriptionSchema.safeParse({ ...base, p256dh, auth: "AAAA" })
				.success,
		).toBe(false);
		const compressed = Buffer.concat([
			Buffer.from([2]),
			Buffer.alloc(64),
		]).toString("base64url");
		expect(
			pushSubscriptionSchema.safeParse({ ...base, p256dh: compressed, auth })
				.success,
		).toBe(false);
	});
});

describe("Kanäle je Art speichern", () => {
	it("leere Auswahl wird Mail, doppelte fallen weg", () => {
		const r = channelPrefsSchema.parse({
			channels: { task_assigned: [], mentioned: ["push", "push", "teams"] },
			digestEnabled: false,
		});
		expect(r.channels.task_assigned).toEqual(["mail"]);
		expect(r.channels.mentioned).toEqual(["push", "teams"]);
	});
	it("unbekannte Wege und Arten werden abgelehnt", () => {
		expect(
			channelPrefsSchema.safeParse({
				channels: { task_assigned: ["sms"] },
				digestEnabled: true,
			}).success,
		).toBe(false);
		expect(
			channelPrefsSchema.safeParse({
				channels: { erfunden: ["mail"] },
				digestEnabled: true,
			}).success,
		).toBe(false);
	});
});
