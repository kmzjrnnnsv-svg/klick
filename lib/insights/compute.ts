import type {
	CandidateProfile,
	ExtractedDocumentMeta,
	ProfileExperience,
	VaultItem,
} from "@/db/schema";
import type {
	CandidateInsights,
	CertificateStats,
	ExperienceConflict,
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

function computeCertificateStats(items: VaultItem[]): CertificateStats {
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
	const perYear: Record<string, number> = {};
	const issuersSet = new Set<string>();

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
		if (issuer) issuersSet.add(issuer.trim());

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

	return {
		total,
		valid,
		expired,
		withoutDate,
		perYear,
		pattern,
		issuers: Array.from(issuersSet).slice(0, 8),
	};
}

export function computeInsightsFromData(
	profile: CandidateProfile,
	vaultItems: VaultItem[],
): CandidateInsights {
	const expCalc = computeExperienceConflict(
		profile.yearsExperience,
		profile.experience,
	);
	const tenure = computeTenure(profile.experience);
	const certificates = computeCertificateStats(vaultItems);

	return {
		computedAt: new Date().toISOString(),
		experience: expCalc,
		tenure,
		certificates,
	};
}
