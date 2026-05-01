// Haversine straight-line distance — good enough for "rough commute distance"
// in a recruiting demo. Real driving / transit times need a routing API
// (OSRM, Mapbox, Google) and are not wired up here.
export function haversineKm(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number },
): number {
	const R = 6371; // earth radius km
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

// First-order estimates per transport mode for the haversine fallback.
// Real routing for car / bike / walk goes through OSRM (see osrmRoute below);
// transit always uses this fallback because public OSRM doesn't do PT.
//   car     — 60 km/h average door-to-door (urban + intercity mix)
//   transit — 35 km/h (slower than car, multi-leg)
//   bike    — 18 km/h (urban)
//   walk    — 5 km/h
const SPEED_KMH: Record<TransportMode, number> = {
	car: 60,
	transit: 35,
	bike: 18,
	walk: 5,
};

export type TransportMode = "car" | "transit" | "bike" | "walk";

export function estimateMinutes(
	distanceKm: number,
	mode: TransportMode,
): number {
	const speed = SPEED_KMH[mode] ?? 60;
	return Math.round((distanceKm / speed) * 60);
}

// Real driving / cycling / walking time via OSRM. The public demo server
// (router.project-osrm.org) is fine for low traffic but not for production
// — set OSRM_URL to point at your own instance when you need it.
//
// Returns null on any kind of failure → caller falls back to estimateMinutes.
// Transit isn't supported by OSRM (would need OpenTripPlanner / GTFS).
export async function osrmRoute(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number },
	mode: "car" | "bike" | "walk",
): Promise<{ km: number; minutes: number } | null> {
	const profile =
		mode === "car" ? "driving" : mode === "bike" ? "cycling" : "foot";
	const base = process.env.OSRM_URL ?? "https://router.project-osrm.org";
	const url = `${base}/route/v1/${profile}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "klick.app/1.0 (https://raza.work)" },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as {
			code?: string;
			routes?: Array<{ distance?: number; duration?: number }>;
		};
		if (json.code !== "Ok" || !json.routes?.[0]) return null;
		const route = json.routes[0];
		if (
			typeof route.distance !== "number" ||
			typeof route.duration !== "number"
		) {
			return null;
		}
		return {
			km: Math.round(route.distance / 100) / 10, // m → km, 1 dp
			minutes: Math.round(route.duration / 60),
		};
	} catch (e) {
		console.warn("[osrm] route failed", { mode, error: e });
		return null;
	}
}
