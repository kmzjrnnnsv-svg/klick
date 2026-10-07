import type { MetadataRoute } from "next";

// Nur die öffentlichen Seiten; App-Routen sind per robots.txt ausgeschlossen.
export default function sitemap(): MetadataRoute.Sitemap {
	const base = (process.env.BETTER_AUTH_URL ?? "https://raza.work").replace(
		/\/+$/,
		"",
	);
	const now = new Date();
	return [
		{
			url: `${base}/`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 1,
		},
		{
			url: `${base}/preise`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${base}/vertrauen`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.8,
		},
	];
}
