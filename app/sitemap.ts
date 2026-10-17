import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/routes";

// Nur die öffentlichen Seiten; App-Routen sind per robots.txt ausgeschlossen.
export default function sitemap(): MetadataRoute.Sitemap {
	const base = siteUrl();
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
			url: `${base}/leistungen`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.9,
		},
		{
			url: `${base}/vertrauen`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		// Rechtstexte aus dem CMS
		...["impressum", "datenschutz-erklaerung"].map((slug) => ({
			url: `${base}/${slug}`,
			lastModified: now,
			changeFrequency: "yearly" as const,
			priority: 0.3,
		})),
	];
}
