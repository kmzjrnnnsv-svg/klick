import type { CandidateProfile, Job } from "@/db/schema";

export type MatchScore = {
	hardPass: boolean;
	hardScore: 0 | 100;
	softScore: number; // 0-100
	hardReasons: string[];
	matchedSkills: string[];
	missingSkills: string[];
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

	// Must-have skills (and min level)
	const reqs = job.requirements ?? [];
	const mustReqs = reqs.filter((r) => r.weight === "must");
	const niceReqs = reqs.filter((r) => r.weight === "nice");

	const mustMissing: string[] = [];
	for (const m of mustReqs) {
		const has = profileSkills.has(lc(m.name));
		if (!has) {
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
	if (mustMissing.length > 0) {
		hardPass = false;
		hardReasons.push(`Muss-Skills fehlen: ${mustMissing.join(", ")}`);
	} else if (mustReqs.length > 0) {
		hardReasons.push(`Muss-Skills: ${mustReqs.length}/${mustReqs.length} ✓`);
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

	// Soft score
	const niceMatched = niceReqs.filter((n) => profileSkills.has(lc(n.name)));
	const niceRatio =
		niceReqs.length > 0 ? niceMatched.length / niceReqs.length : 1;
	const expBonus = minYears > 0 ? Math.min(1, (candYears - minYears) / 5) : 0;
	const softScore = Math.round((niceRatio * 0.7 + expBonus * 0.3) * 100);

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
	};
}
