/* Abnahme nach Apple HIG (docs/design/hig.md): prüft Seiten im Browser auf
 *   - Tippflächen: am Handy (390 px, Touch) ≥ 44 × 44, am Desktop ≥ 28 × 28;
 *     Links mitten im Fließtext sind ausgenommen (WCAG 2.5.8, Inline),
 *     Checkbox/Radio zählen mit ihrem Label;
 *   - Kontrast: jeder sichtbare Text gegen seinen tatsächlichen Hintergrund,
 *     hell und dunkel, ≥ 4,5 : 1 (große Schrift ≥ 3 : 1); deaktivierte
 *     Bedienelemente und Text auf Bildern/Verläufen sind ausgenommen;
 *   - Textgröße 200 % (Dynamic Type, WCAG 1.4.4): Grundschrift verdoppelt,
 *     bei 768 px kein seitlicher Überlauf;
 *   - mit --shots <ordner>: Bildschirmfotos dunkel, erhöhter Kontrast und
 *     reduzierte Bewegung;
 *   - mit --dialogs: zusätzlich je Seite die Dialoge (Auslöser mit
 *     aria-haspopup="dialog", höchstens 12) öffnen und darin Tippflächen und
 *     Kontrast messen — der Rest der Seite ist dabei aria-hidden.
 *
 *   pnpm exec tsx scripts/qa/hig-check.ts /heute /risiken /einstellungen
 *   QA_BASE=http://localhost:3410 QA_STATE_FILE=… pnpm exec tsx scripts/qa/hig-check.ts /
 *
 * Sitzung aus QA_STATE (crawl.ts --login) oder QA_STATE_FILE, Report als
 * hig-<port>.json in QA_DIR. Nicht Teil der CI — braucht eine laufende
 * Instanz. Exit-Code 1, wenn etwas fehlschlägt.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import { QA_BASE, QA_DIR, QA_STATE, writePrivate } from "./paths";
import { quietHmr } from "./webauthn";

const EXEC = existsSync("/opt/pw-browsers/chromium")
	? "/opt/pw-browsers/chromium"
	: undefined;
const args = process.argv.slice(2);
const opt = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const SHOTS = opt("--shots");
const DIALOGS = args.includes("--dialogs");
const paths = args.filter(
	(a, i) => a.startsWith("/") && args[i - 1] !== "--shots",
);
const STATE = process.env.QA_STATE_FILE ?? QA_STATE;
const PORT = new URL(QA_BASE).port || "80";

type Finding = { kind: string; detail: string };
type PageResult = { path: string; mode: string; findings: Finding[] };

// Läuft im Browser: Tippflächen messen
function measureTargets(min: number): Finding[] {
	const sel =
		'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"]';
	const out: Finding[] = [];
	const seen = new Set<Element>();
	for (const el of document.querySelectorAll<HTMLElement>(sel)) {
		if (seen.has(el)) continue;
		seen.add(el);
		const r = el.getBoundingClientRect();
		const st = getComputedStyle(el);
		if (!r.width || !r.height || st.visibility === "hidden") continue;
		// sr-only (1 × 1, abgeschnitten) und versteckte Eingaben hinter Labels
		if (r.width <= 2 && r.height <= 2) continue;
		if (el.closest("[aria-hidden='true'], [inert]")) continue;
		// Link mitten im Satz: Elternteil hat eigenen Text neben dem Link
		if (el.tagName === "A") {
			const parent = el.parentElement;
			const inline =
				st.display === "inline" &&
				parent &&
				[...parent.childNodes].some(
					(n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
				);
			if (inline) continue;
		}
		let w = r.width;
		let h = r.height;
		// Unsichtbares Vorfeld (::before/::after, absolut mit negativem
		// Abstand) zählt mit, solange das Element es nicht abschneidet
		if (st.overflow === "visible") {
			for (const pseudo of ["::before", "::after"]) {
				const ps = getComputedStyle(el, pseudo);
				if (ps.content === "none" || ps.position !== "absolute") continue;
				const grow = (v: string) => Math.max(0, -Number.parseFloat(v) || 0);
				w = Math.max(w, r.width + grow(ps.left) + grow(ps.right));
				h = Math.max(h, r.height + grow(ps.top) + grow(ps.bottom));
			}
		}
		// Checkbox/Radio: das Label ist Teil der Tippfläche
		const input = el as HTMLInputElement;
		if (input.labels?.length) {
			for (const l of input.labels) {
				const lr = l.getBoundingClientRect();
				w = Math.max(w, lr.width);
				h = Math.max(h, lr.height);
			}
		}
		if (w + 0.5 < min || h + 0.5 < min) {
			const name = (
				el.getAttribute("aria-label") ??
				el.textContent ??
				el.getAttribute("placeholder") ??
				""
			)
				.trim()
				.replace(/\s+/g, " ")
				.slice(0, 40);
			out.push({
				kind: "target",
				detail: `${el.tagName.toLowerCase()} „${name}“ ${Math.round(w)}×${Math.round(h)}`,
			});
		}
	}
	return out;
}

// Läuft im Browser: Kontrast jedes Textknotens gegen den Hintergrund
function measureContrast(): Finding[] {
	type RGBA = [number, number, number, number];
	const parse = (c: string): RGBA | null => {
		const m = c.match(/rgba?\(([^)]+)\)/);
		if (!m) return null;
		const p = m[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
	};
	const over = (top: RGBA, bottom: RGBA): RGBA => {
		const a = top[3] + bottom[3] * (1 - top[3]);
		if (a === 0) return [0, 0, 0, 0];
		const mix = (i: number) =>
			(top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
		return [mix(0), mix(1), mix(2), a];
	};
	const lum = ([r, g, b]: RGBA) => {
		const f = (v: number) => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		};
		return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
	};
	// Hintergrund von unten nach oben zusammensetzen; null = Bild/Verlauf
	const background = (el: Element): RGBA | null => {
		const layers: RGBA[] = [];
		for (let n: Element | null = el; n; n = n.parentElement) {
			const st = getComputedStyle(n);
			if (st.backgroundImage !== "none") return null;
			const c = parse(st.backgroundColor);
			if (c && c[3] > 0) {
				layers.push(c);
				if (c[3] >= 1) break;
			}
		}
		let acc: RGBA = parse(getComputedStyle(document.body).backgroundColor) ?? [
			255, 255, 255, 1,
		];
		if (acc[3] < 1) acc = over(acc, [255, 255, 255, 1]);
		for (const l of layers.reverse()) acc = over(l, acc);
		return acc;
	};
	const out: Finding[] = [];
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	const done = new Set<Element>();
	for (let t = walker.nextNode(); t; t = walker.nextNode()) {
		const el = t.parentElement;
		if (!el || done.has(el) || !(t.textContent ?? "").trim()) continue;
		done.add(el);
		const r = el.getBoundingClientRect();
		const st = getComputedStyle(el);
		if (!r.width || !r.height || st.visibility === "hidden") continue;
		if (r.width <= 2 && r.height <= 2) continue;
		if (el.closest("svg, [aria-hidden='true'], [inert], noscript")) continue;
		// Inaktive Bedienelemente sind ausgenommen (WCAG 1.4.3)
		if (el.closest(":disabled, [aria-disabled='true'], [data-disabled]"))
			continue;
		let opacity = 1;
		for (let n: Element | null = el; n; n = n.parentElement)
			opacity *= Number(getComputedStyle(n).opacity);
		if (opacity < 0.05) continue;
		const bg = background(el);
		const fg0 = parse(st.color);
		if (!bg || !fg0) continue;
		const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], bg);
		const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
		const ratio = (a + 0.05) / (b + 0.05);
		const size = Number.parseFloat(st.fontSize);
		const bold = Number(st.fontWeight) >= 700;
		const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
		if (ratio + 0.005 < need) {
			out.push({
				kind: "contrast",
				detail: `${ratio.toFixed(2)} < ${need} „${(t.textContent ?? "").trim().slice(0, 40)}“ ${st.color} auf rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
			});
		}
	}
	return out;
}

// Läuft im Browser: seitlicher Überlauf mit den breitesten Verursachern
function measureOverflow(): Finding[] {
	const doc = document.documentElement;
	// ab 1024 px scrollt die rechte Spalte (data-scroll-root), nicht das Fenster
	const root = document.querySelector<HTMLElement>("[data-scroll-root]");
	if (
		root &&
		getComputedStyle(root).overflowY === "auto" &&
		root.scrollWidth > root.clientWidth + 1
	)
		return [
			{
				kind: "overflow",
				detail: `Scrollbereich ${root.scrollWidth} > ${root.clientWidth}`,
			},
		];
	if (doc.scrollWidth <= doc.clientWidth + 1) return [];
	const wide = [...document.querySelectorAll<HTMLElement>("body *")]
		.filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1)
		.filter(
			(e) =>
				![...e.children].some(
					(c) => c.getBoundingClientRect().right > doc.clientWidth + 1,
				),
		)
		.slice(0, 3)
		.map(
			(e) =>
				`${e.tagName.toLowerCase()} „${(e.textContent ?? "").trim().slice(0, 30)}“ bis ${Math.round(e.getBoundingClientRect().right)}`,
		);
	return [
		{
			kind: "overflow",
			detail: `${doc.scrollWidth} > ${doc.clientWidth}: ${wide.join(" · ")}`,
		},
	];
}

async function open(page: Page, path: string) {
	const res = await page.goto(QA_BASE + path, {
		waitUntil: "networkidle",
		timeout: 180_000,
	});
	// Einmal durchscrollen: Einblend-Animationen (Website) laufen ab, sonst
	// messen wir halb durchsichtigen Text
	await page.evaluate(async () => {
		const step = window.innerHeight * 0.8;
		for (let y = 0; y < document.body.scrollHeight; y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 60));
		}
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(800);
	return res?.status() ?? 0;
}

// Dialoge der Seite nacheinander öffnen, messen, mit Escape schließen
async function eachDialog(
	page: Page,
	measure: (label: string) => Promise<void>,
) {
	const triggers = page.locator('[aria-haspopup="dialog"]:visible');
	const n = Math.min(await triggers.count(), 12);
	for (let i = 0; i < n; i++) {
		const t = triggers.nth(i);
		const label = (
			(await t.getAttribute("aria-label")) ??
			(await t.innerText().catch(() => ""))
		)
			.trim()
			.slice(0, 40);
		try {
			await t.click({ timeout: 5000 });
			await page
				.locator('[role="dialog"], [role="alertdialog"]')
				.first()
				.waitFor({ timeout: 5000 });
			await page.waitForTimeout(300);
			await measure(label || `Dialog ${i + 1}`);
		} catch {
			// nicht zu öffnen (deaktiviert, verdeckt) — kein Fund
		}
		await page.keyboard.press("Escape");
		await page.waitForTimeout(250);
	}
}

async function context(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	phone: boolean,
	scheme: "light" | "dark",
): Promise<BrowserContext> {
	const ctx = await browser.newContext({
		viewport: phone
			? { width: 390, height: 844 }
			: { width: 1440, height: 900 },
		isMobile: phone,
		hasTouch: phone,
		colorScheme: scheme,
		...(existsSync(STATE) ? { storageState: STATE } : {}),
	});
	await prepare(ctx);
	return ctx;
}

// HMR-Neustarts verwerfen; tsx/esbuild hängt __name() an Funktionen, die
// page.evaluate in den Browser schickt
async function prepare(ctx: BrowserContext) {
	await quietHmr(ctx);
	await ctx.addInitScript("globalThis.__name = (f) => f;");
}

async function main() {
	if (paths.length === 0) {
		console.error("Pfade angeben, z. B. /heute /risiken");
		process.exit(2);
	}
	const browser = await chromium.launch({ executablePath: EXEC });
	const results: PageResult[] = [];
	const record = (path: string, mode: string, findings: Finding[]) => {
		results.push({ path, mode, findings });
		const tag = findings.length ? `✖ ${findings.length}` : "✔";
		console.log(`${tag} ${mode.padEnd(14)} ${path}`);
		for (const f of findings.slice(0, 6))
			console.log(`    ${f.kind}: ${f.detail}`);
		if (findings.length > 6)
			console.log(`    … ${findings.length - 6} weitere`);
	};

	for (const scheme of ["light", "dark"] as const) {
		for (const phone of [true, false]) {
			const ctx = await context(browser, phone, scheme);
			const page = await ctx.newPage();
			const coarse = await page.evaluate(
				() => matchMedia("(pointer: coarse)").matches,
			);
			const mode = `${phone ? "handy" : "desktop"}/${scheme === "light" ? "hell" : "dunkel"}`;
			for (const path of paths) {
				const status = await open(page, path);
				const findings: Finding[] = [];
				if (status >= 400)
					findings.push({ kind: "status", detail: String(status) });
				findings.push(...(await page.evaluate(measureContrast)));
				// Tippflächen und Überlauf hängen nicht am Farbschema
				if (scheme === "light") {
					findings.push(
						...(await page.evaluate(measureTargets, phone && coarse ? 44 : 28)),
						...(await page.evaluate(measureOverflow)),
					);
				}
				record(path, mode, findings);
				if (DIALOGS)
					await eachDialog(page, async (label) => {
						const inDialog: Finding[] = [
							...(await page.evaluate(measureContrast)),
						];
						if (scheme === "light")
							inDialog.push(
								...(await page.evaluate(
									measureTargets,
									phone && coarse ? 44 : 28,
								)),
							);
						record(`${path} · Dialog „${label}“`, mode, inDialog);
					});
			}
			await ctx.close();
		}
	}

	// Textgröße 200 % bei 768 px (Tablet bzw. Dynamic Type groß)
	{
		const ctx = await browser.newContext({
			viewport: { width: 768, height: 1024 },
			...(existsSync(STATE) ? { storageState: STATE } : {}),
		});
		await prepare(ctx);
		const page = await ctx.newPage();
		for (const path of paths) {
			await open(page, path);
			await page.evaluate(() => {
				document.documentElement.style.fontSize = "200%";
			});
			await page.waitForTimeout(200);
			record(path, "text-200%", await page.evaluate(measureOverflow));
		}
		await ctx.close();
	}

	if (SHOTS) {
		for (const [name, media] of [
			["dunkel", { colorScheme: "dark" }],
			["kontrast", { contrast: "more" }],
			["bewegung", { reducedMotion: "reduce" }],
		] as const) {
			const ctx = await context(browser, true, "light");
			const page = await ctx.newPage();
			await page.emulateMedia(media);
			for (const path of paths) {
				await open(page, path);
				const file = `${path.replace(/[^a-z0-9]+/gi, "_") || "_"}-${name}.png`;
				await page.screenshot({ path: join(SHOTS, file) });
			}
			await ctx.close();
		}
	}

	await browser.close();
	const report = join(QA_DIR, `hig-${PORT}.json`);
	writePrivate(report, JSON.stringify(results, null, 2));
	const failed = results.filter((r) => r.findings.length > 0);
	const byKind = new Map<string, number>();
	for (const r of results)
		for (const f of r.findings)
			byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
	console.log(
		`\n${results.length} Prüfungen, ${failed.length} mit Funden (${[...byKind].map(([k, n]) => `${k} ${n}`).join(", ") || "keine"}). Report: ${report}`,
	);
	process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(2);
});
