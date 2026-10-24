// Zustand einer Verbindung zu both.money (pure, für /krypto und den Tick):
// Lebenszeichen, Tagesabschluss, Sanktionsliste, Token-Ablauf, offene
// Hinweise. Schwellen aus dem Plan both.money (K4).

export const HEARTBEAT_STALE_MS = 2 * 60 * 60 * 1000;
export const DAY_CLOSE_DUE_HOUR = 9;
export const SANCTIONS_STALE_DAYS = 7;
export const TOKEN_WARN_DAYS = 30;
export const ALERT_REMIND_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const berlin = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/Berlin",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	hourCycle: "h23",
});

function berlinParts(at: Date): { day: string; hour: number } {
	const p = Object.fromEntries(
		berlin.formatToParts(at).map((x) => [x.type, x.value]),
	);
	return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// Vortag (Berlin) — der Tag, den der Abschluss um 00:10 Uhr schließt
export function expectedClosedDay(now: Date): string {
	const { day } = berlinParts(now);
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export type LinkHealthInput = {
	walletOrgId: string | null;
	createdAt: Date;
	lastHeartbeatAt: Date | null;
	lastDayClosed: string | null;
	sanctionsList: { importedAt: string } | null;
	tokenExpiresAt: Date | null;
};

export type LinkHealth = {
	bound: boolean;
	heartbeatStale: boolean;
	// erwarteter, aber fehlender Tagesabschluss (YYYY-MM-DD)
	dayCloseMissing: string | null;
	sanctionsStale: boolean;
	tokenExpiresSoon: boolean;
};

export function linkHealth(l: LinkHealthInput, now: Date): LinkHealth {
	const bound = Boolean(l.walletOrgId);
	const age = now.getTime() - l.createdAt.getTime();
	const settled = bound && age > DAY_MS;
	const heartbeatStale =
		bound &&
		(l.lastHeartbeatAt
			? now.getTime() - l.lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS
			: age > HEARTBEAT_STALE_MS);
	const expected = expectedClosedDay(now);
	const dayCloseMissing =
		settled &&
		berlinParts(now).hour >= DAY_CLOSE_DUE_HOUR &&
		(!l.lastDayClosed || l.lastDayClosed < expected)
			? expected
			: null;
	const sanctionsStale =
		settled &&
		(!l.sanctionsList ||
			now.getTime() - new Date(l.sanctionsList.importedAt).getTime() >
				SANCTIONS_STALE_DAYS * DAY_MS);
	const tokenExpiresSoon =
		l.tokenExpiresAt !== null &&
		l.tokenExpiresAt.getTime() - now.getTime() < TOKEN_WARN_DAYS * DAY_MS;
	return {
		bound,
		heartbeatStale,
		dayCloseMissing,
		sanctionsStale,
		tokenExpiresSoon,
	};
}

// Hinweis länger als 24 h offen → Erinnerung
export function alertOverdue(
	a: { raisedAt: Date; resolvedAt: Date | null },
	now: Date,
): boolean {
	return (
		!a.resolvedAt && now.getTime() - a.raisedAt.getTime() > ALERT_REMIND_MS
	);
}
