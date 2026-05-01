import { eq } from "drizzle-orm";
import { db } from "@/db";
import { geocodeCache } from "@/db/schema";

export type GeoPoint = { lat: number; lng: number };

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Geocode a free-text location ("Berlin", "Köln, DE", "Wien Mitte 1010") via
// the public Nominatim service. Cached in the geocode_cache table so we don't
// hammer the open instance — Nominatim's policy is 1 req/s, so we batch
// upstream (one lookup per save).
//
// Returns null when the geocoder couldn't place the input — caller then falls
// back to "no distance computed" rather than guessing.
export async function geocode(
	raw: string | null | undefined,
): Promise<GeoPoint | null> {
	if (!raw) return null;
	const query = raw.trim().toLowerCase();
	if (!query) return null;

	const [cached] = await db
		.select()
		.from(geocodeCache)
		.where(eq(geocodeCache.query, query))
		.limit(1);
	if (cached) {
		return cached.lat != null && cached.lng != null
			? { lat: cached.lat, lng: cached.lng }
			: null;
	}

	let result: GeoPoint | null = null;
	try {
		const url = `${NOMINATIM}?q=${encodeURIComponent(raw.trim())}&format=json&limit=1`;
		const res = await fetch(url, {
			headers: {
				// Nominatim requires a UA identifying the application.
				"User-Agent": "klick.app/1.0 (https://raza.work)",
				Accept: "application/json",
			},
		});
		if (res.ok) {
			const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
			if (arr.length > 0 && arr[0].lat && arr[0].lon) {
				const lat = Number.parseFloat(arr[0].lat);
				const lng = Number.parseFloat(arr[0].lon);
				if (Number.isFinite(lat) && Number.isFinite(lng)) {
					result = { lat, lng };
				}
			}
		}
	} catch (e) {
		console.warn("[geocode] failed", { raw, error: e });
	}

	// Cache result either way — null avoids repeat-lookups for unresolvable
	// inputs.
	await db
		.insert(geocodeCache)
		.values({
			query,
			lat: result?.lat ?? null,
			lng: result?.lng ?? null,
		})
		.onConflictDoNothing();

	return result;
}
