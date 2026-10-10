/* QA-Crawler: meldet sich über die echten Flows an (Magic-Link aus dem Dev-Log,
 * TOTP, Onboarding), klickt dann alle Seiten, Dialoge und Formulare durch und
 * sammelt Fehlerseiten, 5xx, Page-Errors, Fehler-Toasts und Server-Log-Fehler.
 *
 *   AUTH_ALLOW_SIGNUP=true pnpm dev -p 3200 > /tmp/qa-dev.log 2>&1 &
 *   pnpm exec tsx scripts/qa/crawl.ts            # Login (falls nötig) + Crawl
 *   pnpm exec tsx scripts/qa/crawl.ts --login    # nur Login/Onboarding
 *   pnpm exec tsx scripts/qa/crawl.ts --only /prozesse,/risiken
 *
 * Nicht Teil der CI — braucht eine laufende Instanz mit Dev-Log.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "@playwright/test";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const PORT = new URL(BASE).port || "80";
const LOG = process.env.QA_LOG ?? "/tmp/qa-dev.log";
// Cookies unterscheiden sich zwischen Dev- und Prod-Build (Prefix), daher
// Sitzung je Port; der TOTP-Schlüssel gehört zum QA-Konto und ist geteilt.
const STATE = `/tmp/qa-state-${PORT}.json`;
const SECRET_FILE = "/tmp/qa-totp.txt";
const REPORT = `/tmp/qa-report-${PORT}.json`;
const EXEC = existsSync("/opt/pw-browsers/chromium")
	? "/opt/pw-browsers/chromium"
	: undefined;
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
	const i = args.indexOf(f);
	return i >= 0 ? args[i + 1] : undefined;
};

// ── TOTP (RFC 6238, SHA-1, 30 s, 6 Stellen) ──────────────────────────────
function base32Decode(s: string): Buffer {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const ch of s.toUpperCase().replace(/=+$/, "")) {
		const v = alphabet.indexOf(ch);
		if (v < 0) continue;
		bits += v.toString(2).padStart(5, "0");
	}
	const out: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8)
		out.push(Number.parseInt(bits.slice(i, i + 8), 2));
	return Buffer.from(out);
}
export function totp(secret: string, now = Date.now()): string {
	const counter = Math.floor(now / 30_000);
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter));
	const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
	const off = (h[h.length - 1] ?? 0) & 0xf;
	const code =
		(((h[off] ?? 0) & 0x7f) << 24) |
		(((h[off + 1] ?? 0) & 0xff) << 16) |
		(((h[off + 2] ?? 0) & 0xff) << 8) |
		((h[off + 3] ?? 0) & 0xff);
	return String(code % 1_000_000).padStart(6, "0");
}

// ── Report ────────────────────────────────────────────────────────────────
type Finding = {
	kind:
		| "error_page"
		| "not_found"
		| "http_5xx"
		| "page_error"
		| "console_error"
		| "toast_error"
		| "server_log"
		| "timeout";
	where: string;
	action?: string;
	detail: string;
};
const findings: Finding[] = [];
const seen = new Set<string>();
function record(f: Finding) {
	const key = `${f.kind}|${f.where}|${f.action ?? ""}|${f.detail.slice(0, 120)}`;
	if (seen.has(key)) return;
	seen.add(key);
	findings.push(f);
	console.log(
		`  ✗ [${f.kind}] ${f.where}${f.action ? ` → ${f.action}` : ""}: ${f.detail.slice(0, 200)}`,
	);
}

// ── Helfer ────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function logSize() {
	return existsSync(LOG) ? readFileSync(LOG, "utf8").length : 0;
}
function logSince(pos: number): string {
	return existsSync(LOG) ? readFileSync(LOG, "utf8").slice(pos) : "";
}
// Der Link steht in der Konsolen-Mail (kein Mail-Provider konfiguriert),
// im Dev-Log als `url:`-Zeile und im Mail-Body. Der Prod-Build loggt ihn nie —
// dort QA_LOG auf die Datei eines SMTP-Sinks zeigen lassen (SMTP_HOST/-PORT).
// Die Datenbank hilft nicht: Better Auth speichert den Token gehasht.
async function magicLinkAfter(pos: number): Promise<string> {
	for (let i = 0; i < 40; i++) {
		const m = [
			...logSince(pos)
				// Quoted-Printable aus SMTP-Mitschnitten
				.replace(/=\r?\n/g, "")
				.replace(/=3D/g, "=")
				.matchAll(/(https?:\/\/[^\s"<>]+\/login\/link\?[^\s"<>]+)/g),
		];
		const last = m.at(-1)?.[1];
		if (last) return last.replace(/[│\s]+$/, "");
		await sleep(500);
	}
	throw new Error("Magic-Link nicht im Server-Log gefunden");
}

async function settle(page: Page, ms = 1000) {
	await page.waitForLoadState("domcontentloaded").catch(() => {});
	await page
		.waitForLoadState("networkidle", { timeout: 6_000 })
		.catch(() => {});
	await sleep(ms);
}

let visibleToasts = new Set<string>();
async function checkPage(page: Page, where: string, action?: string) {
	const text =
		(await page
			.locator("body")
			.innerText()
			.catch(() => "")) ?? "";
	if (/Da ist etwas schiefgelaufen/.test(text))
		record({
			kind: "error_page",
			where,
			action,
			detail: "Fehlerseite (error.tsx) sichtbar",
		});
	if (/Internal Server Error/.test(text))
		record({
			kind: "http_5xx",
			where,
			action,
			detail: "Internal Server Error",
		});
	// Toasts bleiben einige Sekunden sichtbar — nur neue Texte zählen, sonst
	// wird derselbe Fehler dem nächsten Klick zugeschrieben.
	const toasts = page.locator("[data-sonner-toast][data-type=error]");
	const n = await toasts.count().catch(() => 0);
	const current = new Set<string>();
	for (let i = 0; i < n; i++) {
		const t = (
			await toasts
				.nth(i)
				.innerText()
				.catch(() => "")
		).trim();
		if (!t) continue;
		current.add(t);
		if (!visibleToasts.has(t))
			record({ kind: "toast_error", where, action, detail: t });
	}
	visibleToasts = current;
}

function attach(page: Page, whereRef: { current: string }) {
	page.on("pageerror", (err) =>
		record({
			kind: "page_error",
			where: whereRef.current,
			detail: String(err.message ?? err),
		}),
	);
	page.on("console", (msg) => {
		if (msg.type() !== "error") return;
		const t = msg.text();
		if (
			/Download the React DevTools|hydrat|favicon|ERR_ABORTED|net::ERR/i.test(t)
		)
			return;
		record({ kind: "console_error", where: whereRef.current, detail: t });
	});
	page.on("response", (res) => {
		const s = res.status();
		const u = res.url();
		if (s >= 500 && u.startsWith(BASE))
			record({
				kind: "http_5xx",
				where: whereRef.current,
				detail: `${s} ${u.replace(BASE, "")}`,
			});
	});
}

// ── Login / Onboarding ───────────────────────────────────────────────────
async function login(ctx: BrowserContext): Promise<void> {
	const page = await ctx.newPage();
	const email = process.env.QA_EMAIL ?? `qa+${Date.now()}@example.com`;
	console.log(`→ Login als ${email}`);
	const pos = logSize();
	await page.goto(`${BASE}/login`);
	await page.fill("#email", email);
	await page.click('form button[type="submit"]');
	await page.waitForURL(/\/login\/verify/, { timeout: 30_000 });
	const link = await magicLinkAfter(pos);
	// Bestätigungsseite: erst der Klick löst den Einmal-Token ein.
	await page.goto(link);
	await page.getByRole("button", { name: /Jetzt anmelden/ }).click();
	await settle(page);
	// Erster Login: MFA-Enrolment
	if (page.url().includes("/einrichtung/2fa")) {
		const secretEl = page.locator("code");
		await secretEl.first().waitFor({ timeout: 30_000 });
		const secret = (await secretEl.first().innerText()).trim();
		writeFileSync(SECRET_FILE, secret);
		await page.fill("#code", totp(secret));
		await page.click('form button[type="submit"]');
		await page
			.getByRole("button", { name: /Weiter zur App/ })
			.click({ timeout: 30_000 });
		await settle(page);
	} else if (page.url().includes("/login/2fa")) {
		const secret = readFileSync(SECRET_FILE, "utf8").trim();
		await page.fill("#code", totp(secret));
		await page.click('form button[type="submit"]');
		await settle(page);
	}
	// Onboarding
	if (page.url().includes("/onboarding")) {
		console.log("→ Onboarding (CASP, Stufe 2, alle Rahmenwerke)");
		await page.fill('input[name="name"]', `QA Org ${Date.now() % 100000}`);
		// Sektor + Stufe über Radix-Select
		const triggers = page.locator('button[role="combobox"]');
		await triggers.nth(0).click();
		await page.getByRole("option", { name: /Krypto-Dienstleister/ }).click();
		await triggers.nth(1).click();
		await page.getByRole("option").nth(2).click();
		await page.getByRole("button", { name: /^Weiter$/ }).click();
		await sleep(500);
		const boxes = page.locator('button[role="checkbox"]');
		const n = await boxes.count();
		for (let i = 0; i < n; i++) {
			const b = boxes.nth(i);
			if ((await b.getAttribute("data-state")) !== "checked") await b.click();
		}
		await page.getByRole("button", { name: /^Weiter$/ }).click();
		await sleep(500);
		const baseline = page.locator('button[role="checkbox"]');
		if ((await baseline.count()) > 0) await baseline.first().click();
		await page
			.getByRole("button", { name: /anlegen|Organisation anlegen/i })
			.last()
			.click();
		await page.waitForURL(/\/ueberblick|\/heute/, { timeout: 120_000 });
		await settle(page, 3000);
	}
	await ctx.storageState({ path: STATE });
	console.log(`✔ Sitzung gespeichert (${page.url()})`);
	await page.close();
}

async function stepUp(page: Page) {
	if (!existsSync(SECRET_FILE)) return;
	const secret = readFileSync(SECRET_FILE, "utf8").trim();
	await page.goto(`${BASE}/login/2fa?stepup=1&zurueck=/heute`);
	await page.fill("#code", totp(secret));
	await page.click('form button[type="submit"]');
	await page.waitForURL(/\/heute/, { timeout: 30_000 }).catch(() => {});
	await settle(page, 500);
}

// ── Generisches Formular-Füllen ──────────────────────────────────────────
let counter = 0;
async function fillDialog(page: Page, scope: ReturnType<Page["locator"]>) {
	counter += 1;
	const inputs = scope.locator(
		"input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]):not([readonly]), textarea:not([disabled])",
	);
	const n = await inputs.count();
	for (let i = 0; i < n; i++) {
		const el = inputs.nth(i);
		if (!(await el.isVisible().catch(() => false))) continue;
		const type = ((await el.getAttribute("type")) ?? "text").toLowerCase();
		const name = (
			(await el.getAttribute("name")) ??
			(await el.getAttribute("id")) ??
			""
		).toLowerCase();
		const current = await el.inputValue().catch(() => "");
		if (current.trim() !== "") continue;
		let value = `QA ${counter}`;
		if (type === "email" || name.includes("email"))
			value = `qa-${counter}@example.com`;
		else if (type === "number") value = "3";
		else if (type === "date")
			value = new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10);
		else if (type === "datetime-local")
			value = new Date().toISOString().slice(0, 16);
		else if (type === "url" || name.includes("url") || name.includes("issuer"))
			value = "https://example.org";
		else if (name.includes("slug")) value = `qa-${counter}`;
		else if (name.includes("code")) value = "123456";
		else if (name.includes("domain")) value = "example.org";
		else if (name.includes("lei")) value = "5299000HVJYR6QP3DK12";
		else if (name.includes("iso2") || name.includes("country")) value = "DE";
		else if ((await el.evaluate((e) => e.tagName)) === "TEXTAREA")
			value = `QA-Beschreibung ${counter}`;
		await el.fill(value).catch(() => {});
	}
	// Radix-Selects: erste nicht-leere Option
	const combos = scope.locator('button[role="combobox"]');
	const cn = await combos.count();
	for (let i = 0; i < cn; i++) {
		const c = combos.nth(i);
		if (!(await c.isVisible().catch(() => false))) continue;
		const txt = (await c.innerText().catch(() => "")).trim();
		if (txt && txt !== "—" && txt !== "–") continue;
		await c.click().catch(() => {});
		const opts = page.locator('[role="option"]');
		const on = await opts.count();
		let picked = false;
		for (let j = 0; j < on && !picked; j++) {
			const o = opts.nth(j);
			const ot = (await o.innerText().catch(() => "")).trim();
			if (ot && ot !== "—") {
				await o.click().catch(() => {});
				picked = true;
			}
		}
		if (!picked) await page.keyboard.press("Escape");
		await sleep(150);
	}
}

const SKIP_BUTTON =
	/abmelden|löschen|entfernen|verwerfen|organisation löschen|endgültig|export|herunterladen|ablehnen|zurückziehen|beenden|kündigen|passkey|alle anderen sitzungen|backup-codes|prüfungspaket|informationsregister|lieferantenpaket/i;
const SKIP_HREF =
	/\/api\/|\/logout|\/login|\/einrichtung|\/onboarding|\/einladung|\.md$|\.zip$|\.csv$|mailto:|#$/;

// Header-Buttons (⌘K, Glocke, Menü) nur einmal auf der ersten Seite; in
// Registern denselben Button-Text (z. B. „Bearbeiten“ je Zeile) nur einmal.
let headerDone = false;
async function exerciseDialogs(page: Page, where: string) {
	const selector = headerDone
		? "main button:visible"
		: "main button:visible, header button:visible";
	headerDone = true;
	const buttons = page.locator(selector);
	const n = Math.min(await buttons.count(), 60);
	const labels: string[] = [];
	for (let i = 0; i < n; i++)
		labels.push(
			(
				await buttons
					.nth(i)
					.innerText()
					.catch(() => "")
			).trim(),
		);
	const seenLabel = new Set<string>();
	let clicks = 0;
	for (let i = 0; i < n && clicks < 25; i++) {
		const label = labels[i] ?? "";
		if (!label || SKIP_BUTTON.test(label) || seenLabel.has(label)) continue;
		seenLabel.add(label);
		const btn = page.locator(selector).nth(i);
		if (!(await btn.isVisible().catch(() => false))) continue;
		clicks += 1;
		const before = page.url();
		await btn.click({ timeout: 5_000 }).catch(() => {});
		await sleep(400);
		const dialog = page.locator('[role="dialog"]:visible').last();
		if (await dialog.count()) {
			const title = (
				await dialog
					.locator("h2, [data-slot=dialog-title]")
					.first()
					.innerText()
					.catch(() => label)
			).trim();
			await fillDialog(page, dialog);
			const submit = dialog.locator('button[type="submit"]:visible').last();
			if (await submit.count()) {
				await submit.click({ timeout: 5_000 }).catch(() => {});
				await settle(page, 1500);
				await checkPage(page, where, `Dialog „${title}“ → Speichern`);
			}
			if (await page.locator('[role="dialog"]:visible').count()) {
				await page.keyboard.press("Escape").catch(() => {});
				await sleep(300);
			}
			if (page.url() !== before) {
				await checkPage(
					page,
					page.url().replace(BASE, ""),
					`nach Dialog „${title}“`,
				);
				queue(page.url());
				await page.goto(before).catch(() => {});
				await settle(page, 800);
			}
		} else {
			await settle(page, 400);
			await checkPage(page, where, `Button „${label}“`);
			if (page.url() !== before) {
				queue(page.url());
				await page.goto(before).catch(() => {});
				await settle(page, 800);
			}
		}
	}
}

// ── Crawl ─────────────────────────────────────────────────────────────────
const START = [
	"/heute",
	"/heute/aufgaben",
	"/heute/freigaben",
	"/heute/verantwortung",
	"/ueberblick",
	"/controls",
	"/synergien",
	"/synergien?tab=matrix",
	"/synergien?tab=vergleich",
	"/synergien?tab=was-waere-wenn",
	"/rahmenwerke",
	"/nachweise",
	"/risiken",
	"/risiken?tab=matrix",
	"/risiken?tab=ausnahmen",
	"/risiken?tab=schadensfaelle",
	"/dokumente",
	"/prozesse",
	"/dienstleister",
	"/dienstleister?tab=werkzeuge",
	"/assets",
	"/vorfaelle",
	"/vorfaelle/neu",
	"/schulungen",
	"/datenschutz",
	"/datenschutz?tab=dsfa",
	"/datenschutz?tab=anfragen",
	"/organisation",
	"/organisation?tab=geltungsbereich",
	"/organisation?tab=rollen",
	"/organisation?tab=ziele",
	"/organisation?tab=kommunikation",
	"/organisation?tab=aufsicht",
	"/organisation?tab=gesellschafter",
	"/organisation?tab=versicherungen",
	"/organisation?tab=interessenkonflikte",
	"/organisation/krisenkontakte",
	"/beschluesse",
	"/audits",
	"/audits?tab=programm",
	"/audits?tab=findings",
	"/managementbewertung",
	"/abweichungen",
	"/testprogramm",
	"/kalender",
	"/roadmap",
	"/aml",
	"/aml?tab=sorgfalt",
	"/aml?tab=monitoring",
	"/aml?tab=verdacht",
	"/aml?tab=laender",
	"/aml?tab=travel-rule",
	"/aml?tab=schulung",
	"/eigenmittel",
	"/eigenmittel?tab=risikotragfaehigkeit",
	"/kryptowerte",
	"/beschwerden",
	"/beschwerden?tab=hinweise",
	"/antrag",
	"/antrag?mappe=zag",
	"/baseline",
	"/team",
	"/aktivitaet",
	"/suche?q=test",
	"/einstellungen",
	"/einstellungen?tab=frameworks",
	"/einstellungen?tab=workflows",
	"/einstellungen?tab=risk",
	"/einstellungen?tab=numbering",
	"/einstellungen?tab=organisation",
	"/einstellungen?tab=sso",
	"/einstellungen?tab=notifications",
	"/admin",
	"/admin/orgs",
	"/admin/users",
	"/admin/audit",
	"/admin/cms",
];
const queued: string[] = [];
const visited = new Set<string>();
const patternCount = new Map<string, number>();
function shape(path: string) {
	return path
		.replace(/\?.*$/, "")
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id")
		.replace(/\/(P|R|V|A|NC|RL|VA|KZ|PL|BE)-[\w.]+/g, "/:code")
		.replace(/\/[^/]+$/, (m) =>
			/^\/(controls|rahmenwerke)/.test(path) ? "/:x" : m,
		);
}
function queue(url: string) {
	const path = url.replace(BASE, "");
	if (
		!path.startsWith("/") ||
		SKIP_HREF.test(path) ||
		visited.has(path) ||
		queued.includes(path)
	)
		return;
	const s = shape(path);
	const c = patternCount.get(s) ?? 0;
	if (c >= 3) return;
	patternCount.set(s, c + 1);
	queued.push(path);
}

async function crawl(ctx: BrowserContext, only?: string[]) {
	const page = await ctx.newPage();
	const whereRef = { current: "" };
	attach(page, whereRef);
	await stepUp(page);
	let lastStepUp = Date.now();
	for (const p of only ?? START) queue(`${BASE}${p}`);
	const logPos = logSize();
	while (queued.length > 0) {
		const path = queued.shift() as string;
		if (visited.has(path)) continue;
		visited.add(path);
		whereRef.current = path;
		if (Date.now() - lastStepUp > 8 * 60_000) {
			await stepUp(page);
			lastStepUp = Date.now();
		}
		console.log(`→ ${path}`);
		const res = await page
			.goto(`${BASE}${path}`, { timeout: 90_000 })
			.catch((e) => {
				record({
					kind: "timeout",
					where: path,
					detail: String(e.message ?? e),
				});
				return null;
			});
		if (!res) continue;
		await settle(page, 800);
		if (res.status() >= 500)
			record({
				kind: "http_5xx",
				where: path,
				detail: `Status ${res.status()}`,
			});
		if (page.url().includes("/login")) {
			record({
				kind: "error_page",
				where: path,
				detail: "Umleitung zum Login (Sitzung verloren?)",
			});
			break;
		}
		const text =
			(await page
				.locator("body")
				.innerText()
				.catch(() => "")) ?? "";
		if (/Diese Seite gibt es nicht/.test(text))
			record({ kind: "not_found", where: path, detail: "404-Seite" });
		await checkPage(page, path);
		// Links einsammeln
		const hrefs = await page
			.locator('a[href^="/"]')
			.evaluateAll((as) =>
				as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
			);
		if (!flag("--no-follow")) for (const h of hrefs) queue(`${BASE}${h}`);
		if (!flag("--pages-only")) await exerciseDialogs(page, path);
	}
	const log = logSince(logPos);
	for (const m of log.matchAll(
		/(?:⨯|Error:|TypeError|ReferenceError|PostgresError|request error)[^\n]{0,300}/g,
	)) {
		const line = m[0];
		if (
			/AuthError\]: (unauthenticated|step_up_required|no_org|forbidden)|"message":"(unauthenticated|step_up_required|forbidden)"/.test(
				line,
			)
		)
			continue;
		record({ kind: "server_log", where: "dev-log", detail: line });
	}
	await page.close();
}

async function main() {
	const browser: Browser = await chromium.launch({
		executablePath: EXEC,
		headless: true,
	});
	try {
		let ctx: BrowserContext;
		if (flag("--login") || !existsSync(STATE)) {
			ctx = await browser.newContext({
				baseURL: BASE,
				viewport: { width: 1400, height: 1000 },
			});
			await login(ctx);
			if (flag("--login")) return;
		} else {
			ctx = await browser.newContext({
				storageState: STATE,
				baseURL: BASE,
				viewport: { width: 1400, height: 1000 },
			});
		}
		const only = opt("--only")
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		await crawl(ctx, only);
		writeFileSync(
			REPORT,
			JSON.stringify(
				{ at: new Date().toISOString(), visited: [...visited], findings },
				null,
				2,
			),
		);
		console.log(
			`\n${visited.size} Seiten besucht · ${findings.length} Funde → ${REPORT}`,
		);
		for (const f of findings)
			console.log(
				`- [${f.kind}] ${f.where}${f.action ? ` → ${f.action}` : ""}: ${f.detail.slice(0, 160)}`,
			);
	} finally {
		await browser.close();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
