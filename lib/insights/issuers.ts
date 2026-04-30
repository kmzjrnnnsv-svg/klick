// Known certificate / badge issuers, used to label legitimacy in the
// candidate insights view. Curated; conservative — anything we don't know
// stays "unknown" and the employer makes their own call.
//
// Categories:
//   "cloud"   — AWS / Azure / GCP / IBM Cloud …
//   "vendor"  — vendor-specific certs (Oracle, SAP, Cisco, Salesforce …)
//   "mooc"    — public learning platforms (Coursera, edX, Udacity …)
//   "academic"— universities, official ed institutions
//   "open"    — open-badge networks (Credly, Badgr, Mozilla, Open Badges)
//   "industry"— trade bodies (PMI, Scrum.org, ITIL/AXELOS …)

export type IssuerCategory =
	| "cloud"
	| "vendor"
	| "mooc"
	| "academic"
	| "open"
	| "industry";

type IssuerEntry = { match: RegExp; name: string; category: IssuerCategory };

const ISSUERS: IssuerEntry[] = [
	// Cloud
	{
		match: /\b(aws|amazon\s*web\s*services)\b/i,
		name: "AWS",
		category: "cloud",
	},
	{ match: /\bmicrosoft\b|\bazure\b/i, name: "Microsoft", category: "cloud" },
	{
		match: /\bgoogle\s*(cloud)?\b|\bgcp\b/i,
		name: "Google",
		category: "cloud",
	},
	{ match: /\bibm\b/i, name: "IBM", category: "cloud" },
	{ match: /\boracle\b/i, name: "Oracle", category: "vendor" },

	// MOOC / Learning
	{ match: /\bcoursera\b/i, name: "Coursera", category: "mooc" },
	{ match: /\bedx\b/i, name: "edX", category: "mooc" },
	{ match: /\budacity\b/i, name: "Udacity", category: "mooc" },
	{ match: /\budemy\b/i, name: "Udemy", category: "mooc" },
	{ match: /\bpluralsight\b/i, name: "Pluralsight", category: "mooc" },
	{
		match: /\blinkedin\s*learning\b/i,
		name: "LinkedIn Learning",
		category: "mooc",
	},
	{ match: /\bopenhpi\b/i, name: "openHPI", category: "mooc" },

	// Vendor / industry
	{ match: /\bcisco\b/i, name: "Cisco", category: "vendor" },
	{ match: /\bsap\b/i, name: "SAP", category: "vendor" },
	{ match: /\bsalesforce\b/i, name: "Salesforce", category: "vendor" },
	{ match: /\bhubspot\b/i, name: "HubSpot", category: "vendor" },
	{ match: /\bmongodb\b/i, name: "MongoDB", category: "vendor" },
	{ match: /\belastic\b/i, name: "Elastic", category: "vendor" },
	{ match: /\bdatabricks\b/i, name: "Databricks", category: "vendor" },
	{ match: /\bsnowflake\b/i, name: "Snowflake", category: "vendor" },
	{ match: /\bdocker\b/i, name: "Docker", category: "vendor" },
	{
		match: /\bcncf\b|kubernetes/i,
		name: "CNCF / Kubernetes",
		category: "vendor",
	},
	{ match: /\bredhat\b|\bred\s*hat\b/i, name: "Red Hat", category: "vendor" },
	{ match: /\bnvidia\b/i, name: "NVIDIA", category: "vendor" },
	{ match: /\bgithub\b/i, name: "GitHub", category: "vendor" },
	{ match: /\bgitlab\b/i, name: "GitLab", category: "vendor" },
	{ match: /\bopenai\b/i, name: "OpenAI", category: "vendor" },
	{ match: /\banthropic\b/i, name: "Anthropic", category: "vendor" },

	// Industry bodies
	{
		match: /\bpmi\b|project\s*management\s*institute/i,
		name: "PMI",
		category: "industry",
	},
	{
		match: /\bscrum\.org\b|scrum\s*alliance/i,
		name: "Scrum.org / Alliance",
		category: "industry",
	},
	{
		match: /\baxelos\b|\bitil\b|\bprince2\b/i,
		name: "AXELOS",
		category: "industry",
	},
	{ match: /\biiba\b/i, name: "IIBA", category: "industry" },
	{ match: /\bisaca\b/i, name: "ISACA", category: "industry" },
	{ match: /\bisc²|cissp|isc2/i, name: "(ISC)²", category: "industry" },
	{
		match: /\bgoogle\s*analytics\b/i,
		name: "Google Analytics",
		category: "vendor",
	},

	// Open Badge networks
	{ match: /\bcredly\b/i, name: "Credly", category: "open" },
	{ match: /\bbadgr\b/i, name: "Badgr", category: "open" },
	{ match: /\bmozilla\b/i, name: "Mozilla", category: "open" },

	// Common academic institutions (heuristic; "universität|university" alone
	// is enough to mark as academic without naming).
	{
		match: /\bharvard\b|\bmit\b|\bstanford\b|\boxford\b|\bcambridge\b/i,
		name: "Top university",
		category: "academic",
	},
	{
		match:
			/universit(ä|y|ät)|hochschule|fachhochschule|polytechnique|tu\s+\w+/i,
		name: "University",
		category: "academic",
	},
];

export function classifyIssuer(
	raw: string | null | undefined,
):
	| { name: string; category: IssuerCategory; verified: true }
	| { verified: false } {
	if (!raw) return { verified: false };
	const normalized = raw.trim();
	if (!normalized) return { verified: false };
	for (const entry of ISSUERS) {
		if (entry.match.test(normalized)) {
			return { name: entry.name, category: entry.category, verified: true };
		}
	}
	return { verified: false };
}
