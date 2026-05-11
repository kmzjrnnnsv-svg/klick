import type {
	CandidateProfile,
	ExtractedDocumentMeta,
	ProfileExperience,
	VaultItem,
} from "@/db/schema";
import { classifyIssuer } from "./issuers";
import type {
	CandidateInsights,
	CertificateStats,
	ExperienceConflict,
	TenureScore,
	TenureStats,
} from "./types";

// Parse "YYYY-MM" or "YYYY" or "present" into months-since-epoch (rough,
// just for delta math). Returns null if unparseable.
function parseYm(raw: string | undefined | null): number | null {
	if (!raw) return null;
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed || trimmed === "present" || trimmed === "current") {
		return monthsSinceEpoch(new Date());
	}
	const m = trimmed.match(/^(\d{4})(?:-(\d{1,2}))?/);
	if (!m) return null;
	const year = Number.parseInt(m[1], 10);
	const month = m[2] ? Number.parseInt(m[2], 10) : 1;
	if (year < 1900 || year > 2200) return null;
	return year * 12 + Math.max(0, Math.min(11, month - 1));
}

function monthsSinceEpoch(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

function fmtYm(months: number): string {
	const y = Math.floor(months / 12);
	const m = (months % 12) + 1;
	return `${y}-${String(m).padStart(2, "0")}`;
}

// Merge overlapping ranges, return sorted by start asc.
function mergeRanges(
	ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const out: Array<{ start: number; end: number }> = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && r.start <= last.end) {
			last.end = Math.max(last.end, r.end);
		} else {
			out.push({ ...r });
		}
	}
	return out;
}

function computeTenure(
	experience: ProfileExperience[] | null | undefined,
	focusKeywords: string[],
): TenureStats {
	const rows = (experience ?? [])
		.map((e) => {
			const start = parseYm(e.start);
			const end = parseYm(e.end ?? "present");
			return start !== null && end !== null && end >= start
				? { e, start, end }
				: null;
		})
		.filter(
			(x): x is { e: ProfileExperience; start: number; end: number } =>
				x !== null,
		);

	const total = rows.length;
	const lengths = rows.map((r) => r.end - r.start);
	const longest = lengths.length ? Math.max(...lengths) : 0;
	const shortest = lengths.length ? Math.min(...lengths) : 0;
	const avg = lengths.length
		? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
		: 0;

	const mix = {
		employedMonths: 0,
		selfEmployedMonths: 0,
		freelanceMonths: 0,
		founderMonths: 0,
		internshipMonths: 0,
		otherMonths: 0,
	};
	const focusKwLc = focusKeywords
		.map((k) => k.toLowerCase().trim())
		.filter((k) => k.length >= 3);
	const focus = {
		focusedRoles: 0,
		detourRoles: 0,
		focusedMonths: 0,
		detourMonths: 0,
		detours: [] as TenureStats["focus"]["detours"],
	};
	for (const r of rows) {
		const months = r.end - r.start;
		switch (r.e.employmentType) {
			case "self_employed":
				mix.selfEmployedMonths += months;
				break;
			case "freelance":
				mix.freelanceMonths += months;
				break;
			case "founder":
				mix.founderMonths += months;
				break;
			case "internship":
				mix.internshipMonths += months;
				break;
			case "other":
				mix.otherMonths += months;
				break;
			default:
				mix.employedMonths += months;
		}

		// Focus / detour: does role/company/description mention any of the
		// candidate's core keywords (skills, education, headline)?
		// Internships / "other" can never be "focused" — treated as detour
		// unless the user has zero focus signal at all.
		const haystack = [r.e.role, r.e.company, r.e.description ?? ""]
			.join(" ")
			.toLowerCase();
		const matches =
			focusKwLc.length > 0 && focusKwLc.some((k) => haystack.includes(k));
		const isStructurallyDetour =
			r.e.employmentType === "internship" || r.e.employmentType === "other";

		if (matches && !isStructurallyDetour) {
			focus.focusedRoles += 1;
			focus.focusedMonths += months;
		} else if (focusKwLc.length > 0) {
			focus.detourRoles += 1;
			focus.detourMonths += months;
			focus.detours.push({
				company: r.e.company,
				role: r.e.role,
				months,
			});
		} else {
			// No focus signal at all → don't classify; count as focused so the
			// detour block doesn't shame an empty profile.
			focus.focusedRoles += 1;
			focus.focusedMonths += months;
		}
	}

	const currentRow = [...rows]
		.filter((r) => {
			const isPresent =
				typeof r.e.end !== "string" ||
				/^(present|current)$/i.test(r.e.end ?? "");
			return isPresent;
		})
		.sort((a, b) => b.start - a.start)[0];
	const current = currentRow
		? {
				company: currentRow.e.company,
				role: currentRow.e.role,
				sinceYearMonth: fmtYm(currentRow.start),
				monthsOngoing: currentRow.end - currentRow.start,
			}
		: undefined;

	const firstRow = [...rows].sort((a, b) => a.start - b.start)[0];
	const first = firstRow
		? {
				company: firstRow.e.company,
				role: firstRow.e.role,
				startYearMonth: fmtYm(firstRow.start),
			}
		: undefined;

	// Parallel work: positive signal. Sweep-line over month-points to find
	// how often ≥2 roles ran at the same time, plus pairwise overlap.
	const parallel = computeParallel(rows);

	// Gaps between merged employment ranges.
	const merged = mergeRanges(rows.map((r) => ({ start: r.start, end: r.end })));
	const gaps: TenureStats["gaps"] = [];
	for (let i = 1; i < merged.length; i++) {
		const prev = merged[i - 1];
		const cur = merged[i];
		const gap = cur.start - prev.end;
		if (gap >= 3) {
			gaps.push({
				fromYearMonth: fmtYm(prev.end),
				toYearMonth: fmtYm(cur.start),
				months: gap,
			});
		}
	}

	return {
		totalRoles: total,
		averageMonths: avg,
		longestMonths: longest,
		shortestMonths: shortest,
		currentRole: current,
		firstJob: first,
		gaps,
		mix,
		focus: {
			focusedRoles: focus.focusedRoles,
			detourRoles: focus.detourRoles,
			focusedMonths: focus.focusedMonths,
			detourMonths: focus.detourMonths,
			detours: focus.detours.slice(0, 5),
		},
		parallel,
	};
}

// Detect time-overlap between roles. Returns peak concurrency, total
// double-covered months, and the pairs with the longest overlap.
function computeParallel(
	rows: Array<{ e: ProfileExperience; start: number; end: number }>,
): TenureStats["parallel"] {
	if (rows.length < 2) {
		return { overlapMonths: 0, peakConcurrency: rows.length, pairs: [] };
	}

	// Sweep-line: collect (month, delta) events, sort, walk through.
	const events: Array<{ at: number; delta: number }> = [];
	for (const r of rows) {
		events.push({ at: r.start, delta: +1 });
		events.push({ at: r.end, delta: -1 });
	}
	events.sort((a, b) => a.at - b.at || b.delta - a.delta);

	let active = 0;
	let peak = 0;
	let overlap = 0;
	let lastAt = events[0]?.at ?? 0;
	for (const ev of events) {
		// Months we just crossed at `active` level
		if (active >= 2) overlap += ev.at - lastAt;
		active += ev.delta;
		peak = Math.max(peak, active);
		lastAt = ev.at;
	}

	// Pairwise overlap — only keep pairs that actually overlap, then top 5.
	const pairs: TenureStats["parallel"]["pairs"] = [];
	for (let i = 0; i < rows.length; i++) {
		for (let j = i + 1; j < rows.length; j++) {
			const a = rows[i];
			const b = rows[j];
			const start = Math.max(a.start, b.start);
			const end = Math.min(a.end, b.end);
			const months = end - start;
			// Below 2 months is just a job-change ramp, not real parallelism.
			if (months < 2) continue;
			pairs.push({
				a: { company: a.e.company, role: a.e.role },
				b: { company: b.e.company, role: b.e.role },
				months,
			});
		}
	}
	pairs.sort((x, y) => y.months - x.months);

	return {
		overlapMonths: Math.max(0, overlap),
		peakConcurrency: Math.max(1, peak),
		pairs: pairs.slice(0, 5),
	};
}

function computeExperienceConflict(
	declared: number | null | undefined,
	experience: ProfileExperience[] | null | undefined,
): {
	yearsContinuous: number;
	yearsActive: number;
	conflict: ExperienceConflict;
} {
	const rows = (experience ?? [])
		.map((e) => ({
			start: parseYm(e.start),
			end: parseYm(e.end ?? "present"),
		}))
		.filter(
			(r): r is { start: number; end: number } =>
				r.start !== null && r.end !== null && r.end >= r.start,
		);

	const merged = mergeRanges(rows);
	const totalMonths = merged.reduce((a, r) => a + (r.end - r.start), 0);
	const longestMonths = merged.reduce(
		(a, r) => Math.max(a, r.end - r.start),
		0,
	);
	const yearsActive = Math.round(totalMonths / 12);
	const yearsContinuous = Math.round(longestMonths / 12);

	const declaredVal = declared ?? 0;
	const delta = declaredVal - yearsActive;
	let severity: ExperienceConflict["severity"] = "none";
	if (Math.abs(delta) >= 4) severity = "major";
	else if (Math.abs(delta) >= 2) severity = "minor";
	if (declared == null || rows.length === 0) severity = "none";

	return {
		yearsContinuous,
		yearsActive,
		conflict: {
			declared: declaredVal,
			computed: yearsActive,
			delta,
			severity,
		},
	};
}

function computeCertificateStats(
	items: VaultItem[],
	candidateSkills: string[],
	candidateRoleHints: string[],
): CertificateStats {
	// Includes both encrypted certificate uploads (kind=certificate) and
	// URL-based / file-based open badges (kind=badge). For the cert pattern
	// we count anything with a recognizable issued year.
	const relevant = items.filter(
		(i) => i.kind === "certificate" || i.kind === "badge",
	);

	const now = new Date();
	let valid = 0;
	let expired = 0;
	let withoutDate = 0;
	let alignedCount = 0;
	const perYear: Record<string, number> = {};
	const issuersSet = new Set<string>();
	const verifiedIssuersSet = new Set<string>();
	const skillsLc = candidateSkills.map((s) => s.toLowerCase());
	const roleHintsLc = candidateRoleHints.map((s) => s.toLowerCase());

	for (const item of relevant) {
		const meta = item.extractedMeta as ExtractedDocumentMeta | null;
		const badge = item.badgeMeta;
		const data = (meta?.data ?? {}) as Record<string, unknown>;

		const issued =
			typeof data.issuedAt === "string"
				? data.issuedAt
				: typeof badge?.issuedAt === "string"
					? badge.issuedAt
					: null;
		const expires = typeof data.expiresAt === "string" ? data.expiresAt : null;
		const issuer =
			(typeof data.issuer === "string" && data.issuer) ||
			(typeof data.issuerName === "string" && data.issuerName) ||
			(typeof badge?.issuerName === "string" && badge.issuerName) ||
			null;
		if (issuer) {
			issuersSet.add(issuer.trim());
			const cls = classifyIssuer(issuer);
			if (cls.verified) verifiedIssuersSet.add(cls.name);
		}

		// Career alignment: cert title / subject mentions a candidate skill or
		// role keyword. Item filename is also checked as fallback.
		const haystackParts = [
			typeof data.title === "string" ? data.title : "",
			typeof data.subject === "string" ? data.subject : "",
			typeof data.name === "string" ? data.name : "",
			typeof badge?.name === "string" ? badge.name : "",
			item.filename,
		];
		const haystack = haystackParts.join(" ").toLowerCase();
		const hits =
			haystack.length > 0 &&
			(skillsLc.some((s) => s.length >= 2 && haystack.includes(s)) ||
				roleHintsLc.some((r) => r.length >= 3 && haystack.includes(r)));
		if (hits) alignedCount += 1;

		if (expires) {
			const expDate = new Date(expires);
			if (!Number.isNaN(expDate.getTime())) {
				if (expDate < now) expired += 1;
				else valid += 1;
			} else {
				valid += 1;
			}
		} else {
			valid += 1;
		}

		if (issued) {
			const yearMatch = issued.match(/(\d{4})/);
			if (yearMatch) {
				const yr = yearMatch[1];
				perYear[yr] = (perYear[yr] ?? 0) + 1;
			} else {
				withoutDate += 1;
			}
		} else {
			withoutDate += 1;
		}
	}

	const total = relevant.length;
	let pattern: CertificateStats["pattern"] = "none";
	const years = Object.keys(perYear);
	if (total === 0) pattern = "none";
	else if (total === 1) pattern = "single";
	else if (years.length === 1) pattern = "burst";
	else {
		const max = Math.max(...Object.values(perYear));
		const avg = total / Math.max(years.length, 1);
		if (max > avg * 2.5) pattern = "burst";
		else if (years.length >= 3) pattern = "steady";
		else pattern = "sparse";
	}

	const verifiedIssuers = verifiedIssuersSet.size;
	const unknownIssuers = Math.max(0, issuersSet.size - verifiedIssuers);
	const careerAlignmentPct =
		total > 0 ? Math.round((alignedCount / total) * 100) : 0;

	return {
		total,
		valid,
		expired,
		withoutDate,
		perYear,
		pattern,
		issuers: Array.from(issuersSet).slice(0, 8),
		verifiedIssuers,
		unknownIssuers,
		careerAlignmentPct,
	};
}

function computeTenureScore(stats: TenureStats): TenureScore {
	if (stats.totalRoles === 0) {
		return { value: 0, band: "weak", rationale: "Keine Anstellungen erfasst." };
	}
	const avg = stats.averageMonths;
	let value = 0;
	if (avg >= 48) value = 95;
	else if (avg >= 30) value = 85;
	else if (avg >= 18) value = 70;
	else if (avg >= 12) value = 55;
	else if (avg >= 6) value = 35;
	else value = 20;

	// Penalty: short shortest tenure with many roles → suggests churn.
	if (stats.shortestMonths < 6 && stats.totalRoles >= 3) value -= 10;
	// Bonus: a single long role is a strong stability signal.
	if (stats.longestMonths >= 60) value = Math.min(100, value + 5);
	value = Math.max(0, Math.min(100, value));

	let band: TenureScore["band"] = "weak";
	if (value >= 80) band = "strong";
	else if (value >= 65) band = "good";
	else if (value >= 45) band = "ok";

	const rationale = (() => {
		const yrs = avg / 12;
		const yrsLabel =
			yrs < 1 ? "< 1 Jahr" : `${Math.round(yrs * 10) / 10} Jahre`;
		const longest = stats.longestMonths / 12;
		const longestLabel =
			longest < 1
				? `${stats.longestMonths} Monate`
				: `${Math.round(longest)} Jahre`;
		return `Ø Verweildauer ${yrsLabel}, längste ${longestLabel}.`;
	})();

	return { value, band, rationale };
}

export function computeInsightsFromData(
	profile: CandidateProfile,
	vaultItems: VaultItem[],
): CandidateInsights {
	const expCalc = computeExperienceConflict(
		profile.yearsExperience,
		profile.experience,
	);

	const skillNames = (profile.skills ?? []).map((s) => s.name);
	const eduTokens = (profile.education ?? []).flatMap((e) =>
		[e.degree, e.institution]
			.filter((s): s is string => typeof s === "string")
			.flatMap((s) => s.split(/[\s.,;:/-]+/))
			.filter((s) => s.length >= 3),
	);
	const headlineTokens = profile.headline
		? profile.headline.split(/[\s.,;:/-]+/).filter((s) => s.length >= 3)
		: [];
	const focusKeywords = [
		...skillNames,
		...eduTokens,
		...headlineTokens,
		...(profile.industries ?? []),
	];

	const tenure = computeTenure(profile.experience, focusKeywords);
	const tenureScore = computeTenureScore(tenure);

	const roleHints = [
		...(profile.headline ? [profile.headline] : []),
		...(profile.experience ?? []).map((e) => e.role),
		...(profile.industries ?? []),
	];
	const certificates = computeCertificateStats(
		vaultItems,
		skillNames,
		roleHints,
	);

	return {
		computedAt: new Date().toISOString(),
		experience: expCalc,
		tenure,
		tenureScore,
		certificates,
	};
}
