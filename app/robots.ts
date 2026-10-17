import type { MetadataRoute } from "next";
import {
	APP_SEGMENTS,
	AUTH_SEGMENTS,
	PRIVATE_SEGMENTS,
	siteUrl,
} from "@/lib/routes";

// Ein Segment wird als „/x$“ und „/x/“ gesperrt — ein nacktes „/datenschutz“
// sperrte als Präfix auch /datenschutz-erklaerung.
export default function robots(): MetadataRoute.Robots {
	const base = siteUrl();
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: [
				...APP_SEGMENTS,
				...AUTH_SEGMENTS,
				...PRIVATE_SEGMENTS,
			].flatMap((s) => [`/${s}$`, `/${s}/`, `/${s}?`]),
		},
		sitemap: `${base}/sitemap.xml`,
		host: base,
	};
}
