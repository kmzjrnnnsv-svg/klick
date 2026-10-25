/**
 * Bildschirmfotos für die Website (/funktionen, /leistungen) aus Klick mit
 * Beispieldaten neu aufnehmen — nach Änderungen an der Oberfläche einmal
 * laufen lassen, Ergebnis ansehen, Maße in lib/marketing/shots.ts nachziehen
 * (das Skript gibt die Zeilen aus, Test `marketing-shots` prüft sie).
 *
 *   QA_BASE=http://localhost:3200 pnpm exec tsx scripts/qa/marketing-shots.ts [--only risiko,freigaben]
 *
 * Voraussetzungen (lokal, nie gegen Prod):
 * - Dev-Server mit der QA-Datenbank, Sitzung aus `crawl.ts --login` (QA_STATE)
 * - das QA-Konto ist Inhaber:in einer Org (Einstellungen → Freigaben) und hat
 *   Zugang zu den Beispiel-Orgs (SHOTS_ORG_MAIN, SHOTS_ORG_CUSTODY)
 * - SHOTS_TRUST_SLUG: veröffentlichtes Trust Center; SHOTS_PORTAL_TOKEN:
 *   gültiger Portal-Link (`klk_portal_…`) für das Lieferantenportal
 * Fehlt etwas, wird das Bild übersprungen (Meldung), nie ein leeres gespeichert.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { QA_BASE, QA_SECRET, QA_STATE } from "./paths";
import { EXEC, quietHmr, totp } from "./webauthn";

const ROOT = join(import.meta.dirname, "..", "..", "public");
const ORG_MAIN = process.env.SHOTS_ORG_MAIN ?? "Beispiel GmbH";
const ORG_CUSTODY = process.env.SHOTS_ORG_CUSTODY ?? "Beispiel Pay GmbH";
const TRUST_SLUG = process.env.SHOTS_TRUST_SLUG ?? "";
const PORTAL_TOKEN = process.env.SHOTS_PORTAL_TOKEN ?? "";
const ONLY = (() => {
	const i = process.argv.indexOf("--only");
	return i > 0 ? new Set((process.argv[i + 1] ?? "").split(",")) : null;
})();

// Entwicklerhinweise und Toasts gehören nicht ins Bild
const HIDE =
	"nextjs-portal,[data-sonner-toaster]{display:none!important}*{caret-color:transparent!important}";

type Box = { x: number; y: number; width: number; height: number };
type Clip = Box | "fail";

async function boxOf(page: Page, selector: string): Promise<Box | null> {
	const b = await page.locator(selector).first().boundingBox();
	if (!b) return null;
	const y = await page.evaluate(() => window.scrollY);
	return { ...b, y: b.y + y };
}

async function open(page: Page, path: string) {
	await page.goto(path, { waitUntil: "networkidle" });
	await page.addStyleTag({ content: HIDE });
	await page.waitForTimeout(600);
}

// Org wechseln über /organisationen (Zeile mit dem Namen bzw. „Inhaber:in“,
// Knopf „Öffnen“; der Knopf der offenen Org ist aus). Die Liste kommt erst
// nach dem Rendern — bis zu drei Versuche.
async function switchOrg(
	page: Page,
	pick: (page: Page) => Promise<ReturnType<Page["locator"]>>,
): Promise<boolean> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		await open(page, "/organisationen");
		await page
			.getByRole("heading", { name: /Organisation wählen/ })
			.waitFor({ timeout: 30_000 })
			.catch(() => {});
		const row = await pick(page);
		if (!(await row.count())) {
			console.error(
				"  Org-Liste:",
				page.url(),
				await page.locator("li").count(),
			);
			continue;
		}
		const button = row.getByRole("button").first();
		// die offene Org hat keinen oder einen ausgeschalteten Knopf
		if (!(await button.count()) || (await button.isDisabled())) return true;
		await button.click();
		await page
			.waitForURL((u) => u.pathname !== "/organisationen", { timeout: 60_000 })
			.catch(() => {});
		if (!page.url().includes("/organisationen")) return true;
	}
	return false;
}

// Name = erster Textknoten der Zeile (die offene Org trägt dahinter ein
// „geöffnet“-Badge im selben Absatz)
const openOrg = (page: Page, name: string) =>
	switchOrg(page, async (p) => {
		const index = await p.$$eval(
			"li",
			(rows, wanted) =>
				rows.findIndex(
					(r) =>
						r.querySelector("p")?.firstChild?.textContent?.trim() === wanted,
				),
			name,
		);
		return p.locator("li").nth(index < 0 ? 999 : index);
	});
const ownerOrg = (page: Page) =>
	switchOrg(page, async (p) =>
		p.locator("li").filter({ hasText: "Inhaber:in" }).first(),
	);

// Bereich der Seite ab einem Element, höchstens maxH CSS-Pixel hoch
async function region(
	page: Page,
	from: string,
	opts: { to?: string; maxH?: number; pad?: number; width?: number } = {},
): Promise<Clip> {
	const pad = opts.pad ?? 24;
	const main = await boxOf(page, "main");
	const start = await boxOf(page, from);
	if (!main || !start) return "fail";
	const end = opts.to ? await boxOf(page, opts.to) : null;
	const bottom = end ? end.y + end.height + pad : start.y + (opts.maxH ?? 800);
	const width = Math.min(main.width, opts.width ?? 1184);
	return {
		x: main.x,
		y: Math.max(0, start.y - pad),
		width,
		height: Math.min(bottom - (start.y - pad), opts.maxH ?? 1600),
	};
}

// Karte bzw. Abschnitt um einen Text (Überschrift), ohne Nachbarspalten
// mit Testkonten — nächster Vorfahr mit Kartenfläche oder <section>
async function cardOf(page: Page, text: string, pad = 16): Promise<Clip> {
	const box = await page.evaluate((wanted) => {
		const el = [...document.querySelectorAll("main h2, main h3, main p")].find(
			(e) => e.textContent?.trim().startsWith(wanted),
		);
		const card = el?.closest('section, [data-slot="card"], .rounded-2xl');
		if (!card) return null;
		const r = card.getBoundingClientRect();
		return {
			x: r.x,
			y: r.y + window.scrollY,
			width: r.width,
			height: r.height,
		};
	}, text);
	if (!box) return "fail";
	return {
		x: box.x - pad,
		y: box.y - pad,
		width: box.width + 2 * pad,
		height: Math.min(box.height + 2 * pad, 1100),
	};
}

type Shot = {
	name: string;
	file: string;
	org: "main" | "custody" | "owner" | "none";
	viewport?: { width: number; height: number };
	run: (page: Page) => Promise<Clip>;
};

const SHOTS: Shot[] = [
	{
		name: "risiko",
		file: "funktionen/risiko.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/risiken/neu");
			return region(p, "main h1", { maxH: 760 });
		},
	},
	{
		name: "freigaben",
		file: "funktionen/freigaben.jpg",
		org: "owner",
		run: async (p) => {
			await open(p, "/einstellungen?tab=workflows");
			const link = p.getByRole("link", { name: /Dokument veröffentlichen/ });
			if (!(await link.count())) return "fail";
			await link.first().click();
			await p.waitForURL(/\/einstellungen\/freigaben\//);
			await p.addStyleTag({ content: HIDE });
			await p.waitForTimeout(800);
			return region(p, "main h1", { maxH: 760 });
		},
	},
	{
		name: "verwahrung",
		file: "funktionen/verwahrung.jpg",
		org: "custody",
		run: async (p) => {
			await open(p, "/verwahrung?tab=abstimmung");
			return region(p, "main table", { maxH: 640 });
		},
	},
	{
		name: "trust-center",
		file: "funktionen/trust-center.jpg",
		org: "none",
		viewport: { width: 1200, height: 1000 },
		run: async (p) => {
			if (!TRUST_SLUG) return "fail";
			await open(p, `/vertrauen/${TRUST_SLUG}`);
			return region(p, "main h1", { maxH: 900, pad: 40 });
		},
	},
	{
		name: "anmeldung",
		file: "funktionen/anmeldung.jpg",
		org: "none",
		run: async (p) => {
			await open(p, "/login");
			const b = await boxOf(p, "main");
			const h = await boxOf(p, "main h1");
			if (!b || !h) return "fail";
			return {
				x: b.x + b.width / 2 - 360,
				y: h.y - 48,
				width: 720,
				height: 460,
			};
		},
	},
	{
		name: "pruefungsreife",
		file: "leistungen/pruefungsreife.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/rahmenwerke/iso27001?tab=pruefungsreife");
			const intro = p.getByText(/Wie gut würde eine Prüfung/).first();
			const b = await intro.boundingBox();
			const main = await boxOf(p, "main");
			if (!b || !main) return "fail";
			const y = b.y + (await p.evaluate(() => window.scrollY)) - 24;
			return { x: main.x, y, width: Math.min(main.width, 1184), height: 560 };
		},
	},
	{
		name: "sicherheit",
		file: "leistungen/sicherheit.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/sicherheit");
			return region(p, "main h1", { maxH: 620 });
		},
	},
	{
		name: "frage",
		file: "leistungen/frage.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/gap-analyse");
			const link = p.locator('main a[href^="/gap-analyse/"]').first();
			if (!(await link.count())) return "fail";
			await link.click();
			await p.waitForURL(/\/gap-analyse\/[0-9a-f-]{36}/);
			await p.addStyleTag({ content: HIDE });
			await p.waitForTimeout(800);
			return region(p, "main article", { to: "main article", pad: 16 });
		},
	},
	{
		name: "produkt",
		file: "leistungen/produkt.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/produkte");
			const link = p.locator('main a[href^="/produkte/"]').first();
			if (!(await link.count())) return "fail";
			await link.click();
			await p.waitForURL(/\/produkte\/[0-9a-f-]{36}/);
			await p.addStyleTag({ content: HIDE });
			await p.waitForTimeout(800);
			return cardOf(p, "Was bis zur Marktreife fehlt");
		},
	},
	{
		name: "vertrag",
		file: "leistungen/vertrag.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/dienstleister");
			const link = p.locator('main a[href^="/dienstleister/"]').first();
			if (!(await link.count())) return "fail";
			const href = await link.getAttribute("href");
			await open(p, `${href}?tab=vertrag`);
			return cardOf(p, "Klausel-Checkliste");
		},
	},
	{
		name: "cvss",
		file: "leistungen/cvss.jpg",
		org: "main",
		run: async (p) => {
			await open(p, "/sicherheit?tab=auftraege");
			const link = p.locator('main a[href^="/sicherheit/auftraege/"]').first();
			if (!(await link.count())) return "fail";
			const href = await link.getAttribute("href");
			await open(p, `${href}?tab=befunde`);
			const add = p.getByRole("button", { name: /Befund erfassen/ });
			if (!(await add.count())) return "fail";
			await add.first().click();
			const dialog = p.getByRole("dialog");
			await dialog.waitFor();
			await dialog
				.getByLabel("Titel")
				.fill("Fremde Bestellungen über die ID abrufbar");
			const vector = dialog.getByLabel(/CVSS/);
			if (await vector.count())
				await vector.fill("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N");
			const fill = async (label: RegExp, value: string) => {
				const f = dialog.getByLabel(label);
				if (await f.count()) await f.first().fill(value);
			};
			await fill(/^CWE/, "CWE-639");
			await fill(/^Ziel/, "https://app.example.com");
			await fill(/^Fundstelle/, "/api/orders/{id}");
			await fill(
				/^Beschreibung/,
				"Die API prüft nicht, ob die Bestellung zum angemeldeten Konto gehört.",
			);
			await p.waitForTimeout(400);
			const b = await dialog.boundingBox();
			if (!b) return "fail";
			return {
				x: b.x,
				y: b.y,
				width: b.width,
				height: Math.min(b.height, 840),
			};
		},
	},
	{
		name: "portal",
		file: "leistungen/portal.jpg",
		org: "none",
		viewport: { width: 390, height: 844 },
		run: async (p) => {
			if (!PORTAL_TOKEN) return "fail";
			await p.goto(`/lieferant#${PORTAL_TOKEN}`, { waitUntil: "networkidle" });
			await p.waitForTimeout(1500);
			await p.addStyleTag({ content: HIDE });
			if (!(await p.locator("main").count())) return "fail";
			return { x: 0, y: 0, width: 390, height: 844 };
		},
	},
];

async function signedIn(browser: Browser, viewport: Shot["viewport"]) {
	const ctx = await browser.newContext({
		storageState: QA_STATE,
		baseURL: QA_BASE,
		viewport: viewport ?? { width: 1440, height: 1000 },
		deviceScaleFactor: 2,
		locale: "de-DE",
		timezoneId: "Europe/Berlin",
		reducedMotion: "reduce",
	});
	await quietHmr(ctx);
	const page = await ctx.newPage();
	page.setDefaultTimeout(120_000);
	await page.goto("/heute", { waitUntil: "load" });
	if (page.url().includes("/login/2fa")) {
		await page.fill("#code", totp(readFileSync(QA_SECRET, "utf8").trim()));
		await page.click('form button[type="submit"]');
		await page.waitForURL((u) => !u.pathname.startsWith("/login"));
	}
	if (page.url().includes("/login"))
		throw new Error("QA-Sitzung abgelaufen: crawl.ts --login");
	return page;
}

const browser = await chromium.launch({ executablePath: EXEC });
const results: string[] = [];
for (const shot of SHOTS) {
	if (ONLY && !ONLY.has(shot.name)) continue;
	const page =
		shot.org === "none"
			? await (async () => {
					const ctx = await browser.newContext({
						baseURL: QA_BASE,
						viewport: shot.viewport ?? { width: 1440, height: 1000 },
						deviceScaleFactor: 2,
						locale: "de-DE",
						timezoneId: "Europe/Berlin",
						reducedMotion: "reduce",
					});
					await quietHmr(ctx);
					const p = await ctx.newPage();
					p.setDefaultTimeout(120_000);
					return p;
				})()
			: await signedIn(browser, shot.viewport);
	const ok =
		shot.org === "none" ||
		(shot.org === "owner"
			? await ownerOrg(page)
			: await openOrg(page, shot.org === "main" ? ORG_MAIN : ORG_CUSTODY));
	const clip = ok
		? await shot.run(page).catch((e: unknown) => {
				console.error(
					shot.name,
					e instanceof Error ? e.message.split("\n")[0] : e,
				);
				return "fail" as const;
			})
		: "fail";
	if (!ok) console.error(shot.name, "Org nicht erreichbar");
	if (clip === "fail") {
		results.push(`✘ ${shot.name}: übersprungen (Daten oder Zugang fehlen)`);
	} else {
		const path = join(ROOT, shot.file);
		await page.screenshot({
			path,
			type: "jpeg",
			quality: 78,
			fullPage: true,
			clip: {
				x: Math.round(clip.x),
				y: Math.round(clip.y),
				width: Math.round(clip.width),
				height: Math.round(clip.height),
			},
		});
		const w = Math.round(clip.width) * 2;
		const h = Math.round(clip.height) * 2;
		results.push(`✔ ${shot.name}: { src: "/${shot.file}", w: ${w}, h: ${h} }`);
	}
	await page.context().close();
}
await browser.close();
console.log(results.join("\n"));
