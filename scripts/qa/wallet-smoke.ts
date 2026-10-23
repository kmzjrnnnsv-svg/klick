/**
 * Wallet-Bereich mit virtuellem Authenticator: Passkey anlegen → /wallet
 * ist gesperrt → Entsperren per Passkey → Leiste mit Restzeit → Einführung
 * (sechs Schritte, Watchlist, „Später“) → „Jetzt
 * sperren“ → Rückweg nur auf Wallet-Seiten → Umschalter Compliance/Wallet.
 * Mit lokaler Testkette (scripts/wallet-devchain.ts, Dev-Server mit
 * WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443) zusätzlich:
 * Konto aus tpub anlegen → Adresse + QR → neue Adresse → Zahlung aus dem
 * Faucet → wallet-sync → Bestand, Bewegungen, CSV.
 *
 * Voraussetzung: QA-Konto aus `pnpm exec tsx scripts/qa/crawl.ts --login`.
 *
 *   pnpm exec tsx scripts/qa/wallet-smoke.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { type Browser, chromium, type Page } from "@playwright/test";
import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { loadEnvFiles } from "../../lib/env";
import { runWalletSync } from "../../lib/jobs/wallet-sync";
import {
	QA_BASE as BASE,
	QA_SECRET as SECRET_FILE,
	QA_STATE as STATE,
} from "./paths";
import { check, EXEC, failureCount, totp, withAuthenticator } from "./webauthn";

async function main() {
	if (!existsSync(STATE) || !existsSync(SECRET_FILE))
		throw new Error("Erst `tsx scripts/qa/crawl.ts --login` ausführen.");
	const browser = await chromium.launch({ executablePath: EXEC });
	try {
		await run(browser);
	} finally {
		await browser.close();
	}
	const failures = failureCount();
	console.log(failures ? `\n${failures} Fehler` : "\nAlles grün.");
	process.exitCode = failures ? 1 : 0;
}

async function run(browser: Browser) {
	const owner = await browser.newContext({ storageState: STATE });
	const o = await withAuthenticator(owner);
	const path = () => new URL(o.url()).pathname;

	// Gesperrt: ohne Passkey-Bestätigung führt /wallet zur Eingangstür
	await o.goto(`${BASE}/wallet`);
	// Nach einem abgebrochenen Lauf ist die Sitzung evtl. noch entsperrt
	if (path() !== "/wallet/entsperren") {
		await o.getByRole("button", { name: "Jetzt sperren" }).click();
		await o.waitForURL(/\/wallet\/entsperren/);
		await o.goto(`${BASE}/wallet`);
	}
	check("Gesperrt → Entsperren", path() === "/wallet/entsperren", o.url());

	// Passkey anlegen (Step-up per TOTP; der Authenticator hält den Schlüssel)
	await o.goto(`${BASE}/login/2fa?stepup=1&zurueck=/einstellungen`);
	// Der Dev-Server hydratisiert verzögert: tippen, bis „Bestätigen“ greift
	const submit = o.locator('form button[type="submit"]');
	for (let i = 0; i < 40 && !(await submit.isEnabled()); i += 1) {
		await o.fill("#code", totp(readFileSync(SECRET_FILE, "utf8").trim()));
		await o.waitForTimeout(500);
	}
	await submit.click();
	await o.waitForURL(/einstellungen/);
	await o.goto(`${BASE}/einstellungen?tab=security`);
	await o.getByRole("button", { name: "Passkey hinzufügen" }).click();
	await o.waitForTimeout(2500);
	check(
		"Passkey angelegt",
		(await o.getByRole("button", { name: "Entfernen", exact: true }).count()) >
			0,
	);

	// Entsperren per Passkey
	await o.goto(`${BASE}/wallet/entsperren?zurueck=%2Fwallet`);
	await o.getByRole("button", { name: "Mit Passkey öffnen" }).click();
	// Beim ersten Öffnen führt /wallet in die Einführung
	await o
		.waitForURL(
			(u) => u.pathname === "/wallet" || u.pathname.startsWith("/wallet/einf"),
			{ timeout: 30_000 },
		)
		.catch(() => {});
	check(
		"Entsperrt per Passkey",
		path() === "/wallet" || path().startsWith("/wallet/einfuehrung/"),
		o.url(),
	);
	await o.getByText(/Noch \d+ Min\. offen/).waitFor({ timeout: 10_000 });
	check("Restzeit sichtbar", true);
	await introFlow(o);

	// Umschalter: Compliance und zurück, Entsperrung bleibt (15 min fest)
	await o.getByRole("link", { name: "Compliance" }).first().click();
	await o.waitForURL(/\/heute/);
	await o.getByRole("link", { name: "Wallet" }).first().click();
	await o.waitForURL((u) => u.pathname === "/wallet");
	check("Umschalter Compliance ↔ Wallet", path() === "/wallet", o.url());

	// Jetzt sperren
	await o.getByRole("button", { name: "Jetzt sperren" }).click();
	await o.waitForURL(/\/wallet\/entsperren/);
	await o.goto(`${BASE}/wallet`);
	check("Gesperrt nach „Jetzt sperren“", path() === "/wallet/entsperren");

	// Rückweg nur auf Wallet-Seiten
	await o.goto(
		`${BASE}/wallet/entsperren?zurueck=${encodeURIComponent("//evil.example/x")}`,
	);
	await o.getByRole("button", { name: "Mit Passkey öffnen" }).click();
	await o
		.waitForURL((u) => u.pathname === "/wallet", { timeout: 30_000 })
		.catch(() => {});
	check(
		"Fremder Rückweg landet auf /wallet",
		o.url() === `${BASE}/wallet`,
		o.url(),
	);
	if (process.env.WALLET_RPC_BITCOIN_SIGNET?.includes("127.0.0.1:18443"))
		await receiveFlow(o);
	await o.getByRole("button", { name: "Jetzt sperren" }).click();
	await o.waitForURL(/\/wallet\/entsperren/);
}

// Einführung: alle sechs Schritte mit „Weiter“, Watchlist im Schritt
// „Kurse“ umschalten und speichern, „Fertig“ → Startseite; „Später“ führt
// ebenfalls zur Startseite
async function introFlow(o: Page) {
	const titles = [
		"Willkommen im Wallet-Bereich",
		"Drei Schlüssel, drei Aufgaben",
		"Testnetz zuerst",
		"Dein erstes Konto",
		"Deine Kurse",
		"Deine erste Einzahlung",
	];
	await o.goto(`${BASE}/wallet/einfuehrung/willkommen`);
	let ethUsd = false;
	for (const [i, title] of titles.entries()) {
		const ok = await o
			.getByRole("heading", { level: 1, name: title })
			.waitFor({ timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		check(`Einführung ${i + 1}/6: ${title}`, ok, o.url());
		if (!ok) return;
		if (title === "Deine Kurse") {
			const box = o.getByRole("checkbox", { name: /^ETH\/USD/ });
			const before = await box.isChecked();
			await o.locator("label", { hasText: "ETH/USD" }).click();
			ethUsd = !before;
			await o.getByRole("button", { name: "Speichern und weiter" }).click();
		} else if (i === titles.length - 1)
			await o.getByRole("button", { name: "Fertig – zur Übersicht" }).click();
		else await o.getByRole("button", { name: "Weiter" }).click();
	}
	await o
		.waitForURL((u) => u.pathname === "/wallet", { timeout: 15_000 })
		.catch(() => {});
	check("Einführung abgeschlossen → Startseite", o.url() === `${BASE}/wallet`);
	await o.goto(`${BASE}/wallet/kurse`);
	check(
		"Watchlist aus der Einführung gespeichert",
		(await o.getByRole("link", { name: /ETH\/USD/ }).count()) > 0 === ethUsd,
	);
	await o.goto(`${BASE}/wallet/einfuehrung/netz`);
	await o.getByRole("button", { name: "Später" }).click();
	await o
		.waitForURL((u) => u.pathname === "/wallet", { timeout: 15_000 })
		.catch(() => {});
	check("„Später“ → Startseite", o.url() === `${BASE}/wallet`);
}

// Empfangen gegen die lokale Testkette (entsperrter Bereich vorausgesetzt)
async function receiveFlow(o: Page) {
	const DEV = "http://127.0.0.1:18443";
	const tpub = HDKey.fromMasterSeed(
		mnemonicToSeedSync(generateMnemonic(wordlist, 256)),
		{ private: 0x04358394, public: 0x043587cf },
	).derive("m/84'/1'/0'").publicExtendedKey;
	const name = `QA Signet ${Date.now()}`;
	await o.goto(`${BASE}/wallet/konten?neu=1`);
	await o.getByLabel("Name").fill(name);
	await o.getByLabel("Öffentlicher Kontoschlüssel").fill(tpub);
	await o.getByRole("button", { name: "Konto anlegen" }).last().click();
	const first = o.locator("p.font-mono").first();
	await first.waitFor({ timeout: 15_000 });
	const firstAddress = (await first.textContent())?.trim() ?? "";
	check(
		"Konto angelegt, erste Adresse",
		firstAddress.startsWith("tb1q"),
		firstAddress,
	);
	await o.getByRole("button", { name: "Stimmt überein" }).click();

	const card = o.getByRole("link", { name: new RegExp(name) });
	const accountId = (await card.getAttribute("href"))?.split("/").pop() ?? "";
	await o.goto(`${BASE}/wallet/empfangen?konto=${accountId}`);
	await o.getByRole("img", { name: /QR-Code/ }).waitFor({ timeout: 10_000 });
	check("Empfangen: QR-Code", true);
	const shown = (await o.locator("p.break-all").first().textContent())?.trim();
	check(
		"Empfangen zeigt die erste Adresse",
		shown === firstAddress,
		shown ?? "",
	);
	await o.getByRole("button", { name: "Neue Adresse" }).click();
	await o.waitForFunction(
		(a) => document.querySelector("p.break-all")?.textContent?.trim() !== a,
		firstAddress,
		{ timeout: 15_000 },
	);
	const second =
		(await o.locator("p.break-all").first().textContent())?.trim() ?? "";
	check(
		"Neue Adresse je Zahlung",
		second.startsWith("tb1q") && second !== firstAddress,
		second,
	);

	// Zahlung aus dem Faucet, ein Block, Abgleich
	await fetch(`${DEV}/dev/faucet`, {
		method: "POST",
		body: JSON.stringify({ address: second, amount: "0.01" }),
	});
	await fetch(`${DEV}/dev/mine`, { method: "POST", body: '{"n":1}' });
	loadEnvFiles();
	await runWalletSync(); // Beobachtungs-Wallet + Rescan
	await runWalletSync();
	await o.goto(`${BASE}/wallet/konten/${accountId}`);
	check(
		"Bestand nach Eingang",
		(await o.getByText("0,01 BTC").count()) > 0,
		accountId,
	);
	await o.goto(`${BASE}/wallet/bewegungen?konto=${accountId}`);
	check("Bewegung bestätigt", (await o.getByText("Bestätigt").count()) > 0);

	// Kurse: Watchlist und Kursverlauf mit dem Eingang als Punkt (braucht
	// Kurse aus price-tick gegen die Testkette)
	await o.goto(`${BASE}/wallet/kurse`);
	check(
		"Kurse: Watchlist",
		(await o.getByRole("link", { name: /BTC\/EUR/ }).count()) > 0,
	);
	await o.goto(`${BASE}/wallet/kurs/btc-eur?zeitraum=1t`);
	const slider = o.getByRole("slider");
	await slider.waitFor({ timeout: 10_000 });
	await slider.focus();
	await o.keyboard.press("Home");
	check(
		"Kursverlauf mit Tastatur bedienbar",
		(await slider.getAttribute("aria-valuenow")) === "0",
	);
	check(
		"Eingang als Punkt im Kursverlauf",
		(await o.getByRole("button", { name: /^Eingang/ }).count()) > 0,
	);
	// WALLET_SHOTS=<ordner>: Bildschirmfotos der Wallet-Seiten (Desktop, 390 px)
	const shots = process.env.WALLET_SHOTS;
	if (shots)
		for (const [w, h, tag] of [
			[1280, 900, "d"],
			[390, 844, "m"],
		] as const) {
			await o.setViewportSize({ width: w, height: h });
			for (const path of [
				"/wallet",
				"/wallet/konten",
				`/wallet/konten/${accountId}`,
				`/wallet/empfangen?konto=${accountId}`,
				"/wallet/bewegungen",
				"/wallet/kurse",
				"/wallet/kurs/btc-eur",
				...[
					"willkommen",
					"sicherheit",
					"netz",
					"konto",
					"kurse",
					"einzahlung",
				].map((s) => `/wallet/einfuehrung/${s}`),
			]) {
				await o.goto(`${BASE}${path}`);
				await o.waitForTimeout(800);
				const file = path.replace(/[/?=]/g, "_").replace(/-/g, "");
				await o.screenshot({
					path: `${shots}/w${file.slice(0, 40)}-${tag}.png`,
					fullPage: true,
				});
				const overflow = await o.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				);
				check(`kein seitlicher Überlauf ${path} (${w} px)`, !overflow);
			}
		}
	const csv = await o.request.get(`${BASE}/api/export/wallet-bewegungen.csv`);
	const body = await csv.text();
	check(
		"CSV-Export",
		csv.status() === 200 && body.includes("0.01"),
		String(csv.status()),
	);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
