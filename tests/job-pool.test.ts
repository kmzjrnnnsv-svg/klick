import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globalDb } from "@/db";
import { inJob, jobsDb, mainDb, runAsJob } from "@/lib/db/job-scope";
import {
	clampLongRunning,
	LONG_RUNNING_MAX_MS,
	POOL_LIMITS,
	poolConnection,
} from "@/lib/db/pool-options";
import { dbForOrg } from "@/lib/db/router";
import { ROOT, walkFiles } from "./helpers/walk";

// P4: Jobs haben einen eigenen Pool mit längeren Zeitgrenzen, Seiten
// bekommen 30 s je Anweisung und 5 s auf eine Sperre (nur im Server).

describe("poolConnection", () => {
	it("Grenzen nur im Server, nicht für Skripte und Tests", () => {
		expect(poolConnection("web", undefined)).toBeUndefined();
		expect(poolConnection("jobs", "edge")).toBeUndefined();
		expect(poolConnection("web", "nodejs")).toEqual({
			statement_timeout: 30_000,
			lock_timeout: 5_000,
		});
		expect(poolConnection("jobs", "nodejs")).toEqual({
			statement_timeout: POOL_LIMITS.jobs.statementMs,
			lock_timeout: POOL_LIMITS.jobs.lockMs,
		});
	});

	it("Jobs dürfen länger als Seiten, mit kleinerem Pool", () => {
		expect(POOL_LIMITS.jobs.statementMs).toBeGreaterThan(
			POOL_LIMITS.web.statementMs,
		);
		expect(POOL_LIMITS.jobs.max).toBeLessThan(POOL_LIMITS.web.max);
	});

	it("longRunning bleibt in Grenzen", () => {
		expect(clampLongRunning(120_000)).toBe(120_000);
		expect(clampLongRunning(10 * 3_600_000)).toBe(LONG_RUNNING_MAX_MS);
		expect(clampLongRunning(-1)).toBe(POOL_LIMITS.web.statementMs);
		expect(clampLongRunning(Number.NaN)).toBe(POOL_LIMITS.web.statementMs);
	});
});

describe("runAsJob", () => {
	it("withOrg und withPlatform nehmen im Job den Job-Pool", async () => {
		const org = "00000000-0000-4000-8000-000000000001";
		expect(inJob()).toBe(false);
		expect(mainDb()).toBe(globalDb);
		expect(dbForOrg(org)).toBe(globalDb);
		await runAsJob(async () => {
			expect(inJob()).toBe(true);
			// auch nach einem await bleibt der Job-Kontext
			await Promise.resolve();
			expect(mainDb()).toBe(jobsDb());
			expect(dbForOrg(org)).toBe(jobsDb());
		});
		expect(mainDb()).toBe(globalDb);
	});

	it("jeder Job-Handler läuft in runAsJob", () => {
		const src = readFileSync(join(ROOT, "lib/jobs/register.ts"), "utf8");
		// nur über den Helfer work(), außer dem Schnellcheck mit eigenem runAsJob
		const direct = [...src.matchAll(/boss\.work(?:<[^>]+>)?\(([^,]+),/g)].map(
			(m) => m[1]?.trim(),
		);
		expect(direct).toEqual(["name", "JOBS.quickCheck"]);
		expect(src).toMatch(/JOBS\.quickCheck[\s\S]*?runAsJob\(/);
	});

	it("Jobs nehmen die Datenbank über mainDb(), nicht globalDb", () => {
		const offenders: string[] = [];
		for (const file of walkFiles(["lib/jobs"])) {
			// boss.ts fragt beim Start einmal den Schema-Besitz ab
			if (file.endsWith("/boss.ts")) continue;
			const src = readFileSync(join(ROOT, file), "utf8");
			// Typ-Verweise (typeof globalDb) sind erlaubt
			if (/\bglobalDb\s*[.(]/.test(src.replace(/typeof globalDb/g, "")))
				offenders.push(file);
		}
		expect(offenders).toEqual([]);
	});
});
