// Messung je Seite: Antwortzeit, SQL-Anweisungen, Bytes von HTML/RSC und
// JavaScript beim ersten Laden. Gegen einen Server, der mit
// KLICK_QUERY_LOG=true läuft und dessen Ausgabe in PERF_LOG steht.
// Die Sitzung legt das Skript selbst in der Mess-Datenbank an (nur *_perf).
//
//   PERF_BASE=http://localhost:3500 PERF_LOG=…/perf-server.log \
//   PERF_DATABASE_URL=postgres://postgres:…@localhost:5432/klick_perf \
//   BETTER_AUTH_SECRET=… pnpm exec tsx scripts/qa/perf.ts \
//     --user qa+…@example.com --org qa-org-82629 --out …/perf-vorher.json
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import postgres from "postgres";

const BASE = process.env.PERF_BASE ?? "http://localhost:3500";
const LOG = process.env.PERF_LOG;
const DB = process.env.PERF_DATABASE_URL;
const SECRET = process.env.BETTER_AUTH_SECRET;
if (!LOG || !DB || !SECRET)
	throw new Error("PERF_LOG, PERF_DATABASE_URL und BETTER_AUTH_SECRET setzen");
if (!/_perf$/.test(new URL(DB).pathname))
	throw new Error("Sitzungen nur in einer Mess-Datenbank (*_perf) anlegen");

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const email = arg("user");
const slug = arg("org");
const out = arg("out");
const runs = Number(arg("runs") ?? "3");
// Produktions-Build: useSecureCookies, also mit Präfix „__Secure-“
const COOKIE = process.env.PERF_COOKIE ?? "__Secure-klick.session_token";
if (!email || !slug || !out) throw new Error("--user, --org und --out angeben");

const PAGES = [
	"/heute",
	"/ueberblick",
	"/controls",
	"/nachweise",
	"/risiken",
	"/dokumente",
	"/dienstleister",
	"/aktivitaet",
	"/rahmenwerke/iso27001?tab=nachweise",
	"/einstellungen",
	"/suche?q=Zugriff",
];

async function mintSession() {
	const sql = postgres(DB as string, { max: 1 });
	try {
		const [row] = await sql<{ user_id: string; org_id: string }[]>`
			select u.id as user_id, o.id as org_id
			from "user" u
			join member m on m.user_id = u.id
			join organization o on o.id = m.organization_id
			where u.email = ${email as string} and o.slug = ${slug as string}`;
		if (!row) throw new Error("Konto oder Mitgliedschaft nicht gefunden");
		const token = randomBytes(24).toString("base64url");
		await sql`
			insert into session (id, token, user_id, active_organization_id,
				expires_at, created_at, updated_at, last_active_at, mfa_verified_at,
				ip_address, user_agent)
			values (gen_random_uuid(), ${token}, ${row.user_id}, ${row.org_id},
				now() + interval '12 hours', now(), now(), now(), now(),
				'127.0.0.1', 'klick-perf')`;
		const sig = createHmac("sha256", SECRET as string)
			.update(token)
			.digest("base64");
		return encodeURIComponent(`${token}.${sig}`);
	} finally {
		await sql.end();
	}
}

function logSize() {
	return statSync(LOG as string).size;
}
function sqlSince(offset: number) {
	const text = readFileSync(LOG as string, "utf8").slice(offset);
	return text
		.split("\n")
		.filter((l) => l.startsWith("[klick-sql] "))
		.map((l) => l.slice(12));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
};

type Row = {
	page: string;
	status: number;
	ms: number;
	statements: number;
	htmlKb: number;
	rscKb: number;
	jsKb: number;
	repeated: [string, number][];
};

async function main() {
	const value = await mintSession();
	const cookie = `${COOKIE}=${value}`;
	const headers = { cookie };
	const results: Row[] = [];

	const browser = await chromium.launch({
		executablePath: existsSync("/opt/pw-browsers/chromium")
			? "/opt/pw-browsers/chromium"
			: undefined,
	});
	const cookieSpec = [
		{
			name: COOKIE,
			value,
			domain: new URL(BASE).hostname,
			path: "/",
			secure: COOKIE.startsWith("__Secure-"),
			httpOnly: true,
			sameSite: "Lax" as const,
		},
	];

	for (const path of PAGES) {
		// Aufwärmen (Modul-Laden, Caches)
		await fetch(BASE + path, { headers, redirect: "manual" });
		const times: number[] = [];
		let statements: string[] = [];
		let status = 0;
		let html = 0;
		for (let i = 0; i < runs; i++) {
			await sleep(250);
			const before = logSize();
			const t0 = performance.now();
			const res = await fetch(BASE + path, { headers, redirect: "manual" });
			const body = await res.text();
			times.push(performance.now() - t0);
			status = res.status;
			html = Buffer.byteLength(body);
			await sleep(400);
			if (i === 0) statements = sqlSince(before);
		}
		// Navigation im Browser: Next verlangt einen _rsc-Wert passend zu den
		// Kopfzeilen und leitet einmal dorthin um
		const rscHeaders = { ...headers, RSC: "1" };
		let rsc = await fetch(BASE + path, {
			headers: rscHeaders,
			redirect: "manual",
		});
		const loc = rsc.headers.get("location");
		if (rsc.status === 307 && loc?.includes("_rsc"))
			rsc = await fetch(new URL(loc, BASE), {
				headers: rscHeaders,
				redirect: "manual",
			});
		const rscBytes =
			rsc.status === 200 ? Buffer.byteLength(await rsc.text()) : -1;

		// Frischer Kontext je Seite: JavaScript beim ersten Laden, ohne Cache
		const ctx = await browser.newContext();
		await ctx.addCookies(cookieSpec);
		const page = await ctx.newPage();
		await page.goto(BASE + path, { waitUntil: "networkidle" });
		const jsBytes = await page.evaluate(() =>
			performance
				.getEntriesByType("resource")
				.filter(
					(e) => (e as PerformanceResourceTiming).initiatorType === "script",
				)
				.reduce((s, e) => s + (e as PerformanceResourceTiming).transferSize, 0),
		);
		await ctx.close();

		const counts = new Map<string, number>();
		for (const s of statements) counts.set(s, (counts.get(s) ?? 0) + 1);
		const repeated = [...counts.entries()]
			.filter(([, n]) => n > 1)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8)
			.map(([q, n]) => [q.slice(0, 140), n] as [string, number]);

		const row: Row = {
			page: path,
			status,
			ms: Math.round(median(times)),
			statements: statements.length,
			htmlKb: Math.round(html / 1024),
			rscKb: rscBytes < 0 ? -1 : Math.round(rscBytes / 1024),
			jsKb: Math.round(jsBytes / 1024),
			repeated,
		};
		results.push(row);
		console.log(
			`${path.padEnd(40)} ${String(row.status).padEnd(4)} ${String(row.ms).padStart(6)} ms ${String(row.statements).padStart(5)} SQL  HTML ${row.htmlKb} KB  RSC ${row.rscKb} KB  JS ${row.jsKb} KB`,
		);
	}
	await browser.close();
	writeFileSync(out as string, JSON.stringify(results, null, 2));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
