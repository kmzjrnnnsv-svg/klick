import { CATALOG_FRAMEWORKS } from "./catalog";

// Kurzname eines Rahmenwerks (pure): „ISO/IEC 27001:2022“ → „ISO 27001“,
// „DORA — …“ → „DORA“
export function shortFrameworkName(slug: string): string {
	const f = CATALOG_FRAMEWORKS.find((x) => x.slug === slug);
	if (!f) return slug;
	return (
		f.name.split(" — ")[0]?.replace("ISO/IEC ", "ISO ").replace(":2022", "") ??
		f.name
	);
}
