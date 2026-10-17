// Readiness (/api/ready): je Abhängigkeit ein Zustand. `fail` → 503 (nginx/
// Deploy-Skript warten bzw. brechen ab), `warn` bleibt 200, steht aber im
// JSON (z. B. kein Mail-Provider in Produktion: Magic-Links kommen nicht an).

export type CheckState = "ok" | "fail" | "warn" | "skipped";
export type Checks = Record<string, CheckState>;

export function summarize(checks: Checks): {
	status: "ready" | "not_ready";
	httpStatus: 200 | 503;
	checks: Checks;
} {
	const failed = Object.values(checks).includes("fail");
	return {
		status: failed ? "not_ready" : "ready",
		httpStatus: failed ? 503 : 200,
		checks,
	};
}

export function mailCheck(
	source: Record<string, string | undefined>,
): CheckState {
	if (source.RESEND_API_KEY?.trim() || source.SMTP_HOST?.trim()) return "ok";
	return source.NODE_ENV === "production" ? "warn" : "skipped";
}

export async function checkReadiness(): Promise<Checks> {
	const { pingDatabase, pingOrgDatabases } = await import("@/lib/db/health");
	const s3Configured = Boolean(
		process.env.S3_ENDPOINT?.trim() &&
			process.env.S3_ACCESS_KEY_ID?.trim() &&
			process.env.S3_SECRET_ACCESS_KEY?.trim(),
	);
	const [database, orgDbs, storage, clamd, jobs] = await Promise.all([
		pingDatabase().then((ok): CheckState => (ok ? "ok" : "fail")),
		pingOrgDatabases().then(
			({ total, failed }): CheckState =>
				total === 0 ? "skipped" : failed > 0 ? "fail" : "ok",
		),
		s3Configured
			? import("@/lib/storage/s3")
					.then((m) => m.headBucket())
					.then((): CheckState => "ok")
					.catch((): CheckState => "fail")
			: Promise.resolve<CheckState>("skipped"),
		process.env.CLAMD_HOST?.trim()
			? import("@/lib/uploads/clamav")
					.then((m) => m.pingClamd())
					.then((ok): CheckState => (ok ? "ok" : "fail"))
			: Promise.resolve<CheckState>("skipped"),
		import("@/lib/jobs/boss").then(({ schedulerState }): CheckState => {
			const s = schedulerState();
			// Kurz nach dem Start läuft der Scheduler evtl. noch nicht: warnen,
			// nicht ausfallen — Requests funktionieren ohne ihn.
			return s === "disabled" ? "skipped" : s === "running" ? "ok" : "warn";
		}),
	]);
	return {
		database,
		orgDatabases: orgDbs,
		storage,
		clamd,
		jobs,
		mail: mailCheck(process.env),
	};
}
