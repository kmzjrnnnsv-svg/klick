import type { CandidateProfile, Job } from "@/db/schema";
import {
	estimateMinutes,
	haversineKm,
	type TransportMode,
} from "@/lib/geo/distance";
import { anyAdjacent } from "@/lib/match/skill-clusters";

export type MatchScore = {
	hardPass: boolean;
	hardScore: 0 | 100;
	softScore: number; // 0-100
	hardReasons: string[];
	matchedSkills: string[];
	missingSkills: string[];
	// Adjacent skills the candidate brings — Quereinstieg signal. Each
	// counts at half weight in the soft score.
	adjacentSkills: string[];
	// Computed commute distance + estimated minutes for non-remote jobs.
	// null when remote, when locations missing, or when geocoding failed.
	commute: {
		km: number;
		minutes: number;
		mode: TransportMode;
		exceedsLimit: boolean;
	} | null;
};

function lc(s: string): string {
	return s.toLowerCase();
}

/**
 * Pure scoring function — no I/O. Caller passes a job + profile, gets back a
 * scoring breakdown. Hard fails set hardPass=false; soft score 0-100 ranks
 * the passing candidates.
 */
export function scoreMatch(job: Job, profile: CandidateProfile): MatchScore {
	const hardReasons: string[] = [];
	let hardPass = true;

	// Years of experience
	const minYears = job.yearsExperienceMin ?? 0;
	const candYears = profile.yearsExperience ?? 0;
	if (candYears < minYears) {
		hardPass = false;
		hardReasons.push(`Berufsjahre: ${candYears}/${minYears} (zu wenig)`);
	} else if (minYears > 0) {
		hardReasons.push(`Berufsjahre: ${candYears}/${minYears} ✓`);
	}

	// Profile skills as a set for fast lookup
	const profileSkills = new Set((profile.skills ?? []).map((s) => lc(s.name)));
	const profileSkillLevels = new Map<string, number>();
	for (const s of profile.skills ?? []) {
		if (s.level) profileSkillLevels.set(lc(s.name), s.level);
	}

	// Must-have skills (and min level). Adjacency lets a Java-Dev pass when
	// the job asks for Kotlin etc. — counted as soft match, not hard.
	const reqs = job.requirements ?? [];
	const mustReqs = reqs.filter((r) => r.weight === "must");
	const niceReqs = reqs.filter((r) => r.weight === "nice");
	const profileSkillNames = (profile.skills ?? []).map((s) => s.name);

	const mustMissing: string[] = [];
	const adjacentSkills: string[] = [];
	for (const m of mustReqs) {
		const has = profileSkills.has(lc(m.name));
		if (!has) {
			// Not the exact skill — but maybe an adjacent one (Quereinstieg).
			if (anyAdjacent(profileSkillNames, m.name)) {
				adjacentSkills.push(m.name);
				// Doesn't satisfy the hard requirement but doesn't disqualify either
				// when there are also strong matches; still flagged as missing for
				// the rationale.
			}
			mustMissing.push(m.name);
			continue;
		}
		if (m.minLevel) {
			const cl = profileSkillLevels.get(lc(m.name)) ?? 0;
			if (cl < m.minLevel) {
				mustMissing.push(`${m.name} (Lvl ${cl}/${m.minLevel})`);
			}
		}
	}
	// Quereinstiegs-Toleranz: wenn alle Muss-Skills entweder direkt oder
	// adjazent abgedeckt sind, gilt der Hard-Filter als bestanden.
	const allMustCovered = mustReqs.every(
		(m) =>
			profileSkills.has(lc(m.name)) || anyAdjacent(profileSkillNames, m.name),
	);
	if (mustMissing.length > 0 && !allMustCovered) {
		hardPass = false;
		hardReasons.push(`Muss-Skills fehlen: ${mustMissing.join(", ")}`);
	} else if (mustReqs.length > 0) {
		const exact = mustReqs.length - mustMissing.length;
		hardReasons.push(
			adjacentSkills.length > 0
				? `Muss-Skills: ${exact}/${mustReqs.length} direkt + ${adjacentSkills.length} Quereinstieg ✓`
				: `Muss-Skills: ${mustReqs.length}/${mustReqs.length} ✓`,
		);
	}

	// Language overlap (any 2-letter code match)
	if (job.languages && job.languages.length > 0) {
		const candCodes = (profile.languages ?? []).map((l) => l.split(":")[0]);
		const jobCodes = job.languages.map((l) => l.split(":")[0]);
		const overlap = candCodes.some((c) => jobCodes.includes(c));
		if (!overlap) {
			hardPass = false;
			hardReasons.push(
				`Sprache: ${jobCodes.join("/")} verlangt, vorhanden ${candCodes.join("/") || "—"}`,
			);
		} else {
			hardReasons.push("Sprache ✓");
		}
	}

	// Commute gating + scoring (only for non-remote jobs).
	let commute: MatchScore["commute"] = null;
	if (
		job.remotePolicy !== "remote" &&
		profile.addressLat != null &&
		profile.addressLng != null &&
		job.locationLat != null &&
		job.locationLng != null
	) {
		const km = haversineKm(
			{ lat: profile.addressLat, lng: profile.addressLng },
			{ lat: job.locationLat, lng: job.locationLng },
		);
		const mode: TransportMode = profile.transportMode ?? "car";
		const minutes = estimateMinutes(km, mode);
		const limit = profile.maxCommuteMinutes ?? null;
		const exceedsLimit = limit != null && minutes > limit;
		commute = { km: Math.round(km), minutes, mode, exceedsLimit };
		if (exceedsLimit) {
			hardPass = false;
			hardReasons.push(
				`Pendelweg: ${Math.round(km)} km · ~${minutes} min ${labelMode(mode)} · Wunsch ≤ ${limit} min`,
			);
		} else if (limit != null) {
			hardReasons.push(
				`Pendelweg: ${Math.round(km)} km · ~${minutes} min ${labelMode(mode)} ✓`,
			);
		}
	}

	// Soft score: nice-to-haves + experience headroom + Quereinstieg credit.
	const niceMatched = niceReqs.filter((n) => profileSkills.has(lc(n.name)));
	const niceAdjacent = niceReqs.filter(
		(n) =>
			!profileSkills.has(lc(n.name)) && anyAdjacent(profileSkillNames, n.name),
	);
	for (const n of niceAdjacent) {
		if (!adjacentSkills.includes(n.name)) adjacentSkills.push(n.name);
	}
	const niceCredit = niceMatched.length + niceAdjacent.length * 0.5;
	const niceRatio =
		niceReqs.length > 0 ? Math.min(1, niceCredit / niceReqs.length) : 1;
	const expBonus = minYears > 0 ? Math.min(1, (candYears - minYears) / 5) : 0;
	let softScore = Math.round((niceRatio * 0.7 + expBonus * 0.3) * 100);
	// Soft penalty for long commutes that are still within the limit.
	if (commute && !commute.exceedsLimit && commute.minutes > 30) {
		softScore = Math.max(
			0,
			softScore - Math.min(15, (commute.minutes - 30) / 2),
		);
		softScore = Math.round(softScore);
	}

	const matchedSkills = [
		...mustReqs.filter((r) => !mustMissing.find((mm) => mm.startsWith(r.name))),
		...niceMatched,
	].map((r) => r.name);

	const missingSkills = [
		...mustMissing,
		...niceReqs
			.filter((n) => !profileSkills.has(lc(n.name)))
			.map((n) => n.name),
	];

	return {
		hardPass,
		hardScore: hardPass ? 100 : 0,
		softScore,
		hardReasons,
		matchedSkills,
		missingSkills,
		adjacentSkills,
		commute,
	};
}

function labelMode(mode: TransportMode): string {
	switch (mode) {
		case "car":
			return "mit Auto";
		case "transit":
			return "mit ÖPNV";
		case "bike":
			return "mit Rad";
		case "walk":
			return "zu Fuß";
	}
}
