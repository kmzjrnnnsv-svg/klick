// OpenTripPlanner (OTP) integration for public-transit routing.
//
// OTP is the de-facto open-source engine for multi-modal transit routing
// (bus + train + tram + walk legs). It needs:
//   1. OSM data for the region (same .pbf as OSRM)
//   2. A GTFS feed from the local Verkehrsverbund (VBB Berlin, HVV Hamburg,
//      MVV München, ÖBB Österreich, etc.)
//   3. A running OTP server (Java, Docker)
//
// See `deploy/otp/README.md` for the full setup. When `OTP_URL` isn't set,
// this function returns null and the match engine falls back to the
// haversine-based estimate (transit ≈ 35 km/h).

export type TransitRoute = {
	km: number;
	minutes: number;
	walkingMinutes: number;
	legs: number; // count of transit legs (bus, train, …) — 0 means walk-only
};

export async function otpTransitRoute(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number },
	when: Date = new Date(),
): Promise<TransitRoute | null> {
	const base = process.env.OTP_URL;
	if (!base) return null;

	// OTP REST: GET /otp/routers/default/plan?fromPlace=lat,lng&toPlace=lat,lng&mode=TRANSIT,WALK&date=…&time=…
	const date = when.toISOString().slice(0, 10).replace(/-/g, "/"); // OTP wants MM/DD/YYYY OR YYYY/MM/DD depending on version; safest: YYYY-MM-DD
	const time = when.toTimeString().slice(0, 8); // HH:MM:SS
	const url =
		`${base}/otp/routers/default/plan` +
		`?fromPlace=${a.lat},${a.lng}&toPlace=${b.lat},${b.lng}` +
		`&mode=TRANSIT,WALK&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}` +
		`&numItineraries=1&maxWalkDistance=2000`;

	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent": "klick.app/1.0 (https://raza.work)",
				Accept: "application/json",
			},
		});
		if (!res.ok) return null;
		const json = (await res.json()) as {
			plan?: {
				itineraries?: Array<{
					duration?: number;
					walkDistance?: number;
					walkTime?: number;
					transitTime?: number;
					legs?: Array<{ mode?: string; distance?: number }>;
				}>;
			};
			error?: unknown;
		};
		const it = json.plan?.itineraries?.[0];
		if (!it || typeof it.duration !== "number") return null;

		const legs = it.legs ?? [];
		const transitLegs = legs.filter(
			(l) => l.mode && !["WALK", "BICYCLE"].includes(l.mode),
		);
		const totalMeters = legs.reduce(
			(sum, l) => sum + (typeof l.distance === "number" ? l.distance : 0),
			0,
		);
		return {
			km: Math.round(totalMeters / 100) / 10,
			minutes: Math.round(it.duration / 60),
			walkingMinutes: Math.round((it.walkTime ?? 0) / 60),
			legs: transitLegs.length,
		};
	} catch (e) {
		console.warn("[otp] route failed", { error: e });
		return null;
	}
}
