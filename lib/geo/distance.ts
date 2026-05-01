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

// Honest first-order estimates for commute time per transport mode.
// Until we plug a real routing API:
//   car     — 60 km/h average over door-to-door (urban + intercity mix)
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
