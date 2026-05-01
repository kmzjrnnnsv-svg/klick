// Skill clusters for "Quereinstieg" (lateral career moves). When a candidate's
// skill A is in the same cluster as a job's required skill B, the match engine
// counts it at half weight — opens up cross-overs (Java dev → Kotlin role,
// PHP dev → Node.js, Sketch designer → Figma) without false-positives across
// totally unrelated fields.
//
// Conservative on purpose: only well-established adjacency. Add entries as
// real demand surfaces.
const CLUSTERS: Array<Set<string>> = [
	// JS / TS web ecosystem
	new Set(["javascript", "typescript", "node.js", "deno", "bun"]),
	// React family
	new Set(["react", "react native", "next.js", "remix", "gatsby"]),
	// Vue / Angular family (separate cluster — different mental model)
	new Set(["vue", "vue.js", "nuxt", "angular"]),
	// JVM
	new Set(["java", "kotlin", "scala", "groovy", "spring boot", "spring"]),
	// Python data + scripting
	new Set(["python", "django", "flask", "fastapi", "pandas", "numpy"]),
	// Backend dynamic web
	new Set(["php", "laravel", "symfony", "ruby", "rails", "ruby on rails"]),
	// Cloud + infra
	new Set([
		"aws",
		"azure",
		"gcp",
		"google cloud",
		"kubernetes",
		"terraform",
		"docker",
		"helm",
		"cncf / kubernetes",
	]),
	// Data / analytics
	new Set([
		"sql",
		"postgresql",
		"mysql",
		"mariadb",
		"snowflake",
		"bigquery",
		"redshift",
		"dbt",
		"airflow",
		"spark",
	]),
	// Mobile native
	new Set(["ios", "swift", "objective-c", "android", "kotlin"]),
	// Design tools
	new Set(["figma", "sketch", "adobe xd", "design systems", "prototyping"]),
	// Marketing / growth
	new Set([
		"performance marketing",
		"seo",
		"sea",
		"content strategy",
		"hubspot",
		"google analytics",
		"analytics",
	]),
];

const NORM = (s: string): string => s.trim().toLowerCase();

// True iff `a` and `b` live in the same skill-cluster (and aren't identical).
export function areAdjacent(a: string, b: string): boolean {
	const x = NORM(a);
	const y = NORM(b);
	if (x === y || !x || !y) return false;
	for (const c of CLUSTERS) {
		if (c.has(x) && c.has(y)) return true;
	}
	return false;
}

// For a list of profile skills, decide whether any of them is adjacent to
// the requested skill. Used to recover Quereinstieg candidates.
export function anyAdjacent(
	profileSkills: string[],
	required: string,
): boolean {
	return profileSkills.some((s) => areAdjacent(s, required));
}
