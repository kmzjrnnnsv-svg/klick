/**
 * Wallet-Bereich mit virtuellem Authenticator: Passkey anlegen → /wallet
 * ist gesperrt → Entsperren per Passkey → Leiste mit Restzeit → „Jetzt
 * sperren“ → Rückweg nur auf Wallet-Seiten → Umschalter Compliance/Wallet.
 *
 * Voraussetzung: QA-Konto aus `pnpm exec tsx scripts/qa/crawl.ts --login`.
 *
 *   pnpm exec tsx scripts/qa/wallet-smoke.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { type Browser, chromium } from "@playwright/test";
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
	await o
		.waitForURL((u) => u.pathname === "/wallet", { timeout: 30_000 })
		.catch(() => {});
	check("Entsperrt per Passkey", path() === "/wallet", o.url());
	await o.getByText(/Noch \d+ Min\. offen/).waitFor({ timeout: 10_000 });
	check("Restzeit sichtbar", true);

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
	await o.getByRole("button", { name: "Jetzt sperren" }).click();
	await o.waitForURL(/\/wallet\/entsperren/);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
