// Service Worker von Klick: nur Push-Benachrichtigungen (Einstellungen >
// Benachrichtigungen). Kein Cache, keine Anfragen an den Server. Die
// Nachricht kommt verschlüsselt vom Push-Dienst des Browsers und enthält nur
// Titel und Link; geöffnet werden nur Seiten dieser Instanz.

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

function sameOrigin(raw) {
	try {
		const url = new URL(raw, self.location.origin);
		return url.origin === self.location.origin ? url.href : null;
	} catch {
		return null;
	}
}

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = {};
	}
	const title =
		typeof data.title === "string" && data.title.length > 0
			? data.title.slice(0, 150)
			: "Neuer Hinweis in Klick";
	const url = sameOrigin(typeof data.url === "string" ? data.url : "/heute");
	event.waitUntil(
		self.registration.showNotification(title, {
			body: typeof data.body === "string" ? data.body.slice(0, 200) : "Klick",
			tag: typeof data.tag === "string" ? data.tag.slice(0, 64) : undefined,
			icon: "/apple-icon.png",
			data: { url: url ?? `${self.location.origin}/heute` },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target =
		sameOrigin(event.notification.data?.url) ?? `${self.location.origin}/heute`;
	event.waitUntil(
		(async () => {
			const all = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const c of all) {
				if (new URL(c.url).origin === self.location.origin && "focus" in c) {
					await c.focus();
					if ("navigate" in c) await c.navigate(target);
					return;
				}
			}
			await self.clients.openWindow(target);
		})(),
	);
});
