/**
 * Senden aus einem Hot-Konto (Plan Wallet, Phase 2) im echten Browser:
 * Dev-Signer einrichten → zwei Sicherheitsschlüssel über den Link vom
 * Terminal (ein synchronisierbarer Passkey wird abgelehnt) → Wallet per
 * Klick-Passkey entsperren → Hot-Konto anlegen → Eingang aus der Testkette
 * → Zieladresse vorschlagen und auf der Bestätigungsseite freigeben →
 * Auszahlung anlegen, bestätigen, signieren, senden, bestätigt →
 * Beschleunigen → „Alles stoppen“ mit Banner → fremde Herkunft abgelehnt.
 * Die Jobs (wallet-sync, wallet-payouts) ruft das Skript selbst auf.
 *
 * Voraussetzung (je ein Terminal, Umgebung wie der Dev-Server):
 *   pnpm wallet:devchain
 *   pnpm signer:dev
 *   pnpm confirm:dev
 *   SIGNER_SOCKET=$QA_DIR/signer/app.sock CONFIRM_ORIGIN=http://localhost:3201 \
 *     WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443 pnpm dev -p 3200
 *   QA-Konto aus `pnpm exec tsx scripts/qa/crawl.ts --login`
 *
 *   SIGNER_SOCKET=… pnpm exec tsx scripts/qa/wallet-send-smoke.ts
 *   WALLET_SHOTS=<ordner> …   (Bildschirmfotos 1280 und 390 px)
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "@playwright/test";
import { p2wpkh, TEST_NETWORK } from "@scure/btc-signer";
import { loadEnvFiles } from "../../lib/env";
import { runWalletPayouts } from "../../lib/jobs/wallet-payouts";
import { runWalletSync } from "../../lib/jobs/wallet-sync";
import { resetSignerCache } from "../../lib/wallet/signer/status";
import { callSigner } from "../../signer/client";
import {
	QA_BASE as BASE,
	QA_DIR,
	QA_SECRET as SECRET_FILE,
	QA_STATE as STATE,
} from "./paths";
import { check, EXEC, failureCount, totp, withAuthenticator } from "./webauthn";

const CONFIRM = process.env.CONFIRM_ORIGIN ?? "http://localhost:3201";
const BTC_NODE = "http://127.0.0.1:18443";
const SHOTS = process.env.WALLET_SHOTS;
const ADMIN = join(QA_DIR, "signer", "admin.sock");
const APP = process.env.SIGNER_SOCKET ?? join(QA_DIR, "signer", "app.sock");

const admin = <T = Record<string, unknown>>(cmd: string, args: unknown = {}) =>
	callSigner<T>(ADMIN, cmd, args).then((r) => r.result);
const signer = <T = Record<string, unknown>>(cmd: string, args: unknown = {}) =>
	callSigner<T>(APP, cmd, args).then((r) => r.result);
const node = (path: string, body: unknown) =>
	fetch(`${BTC_NODE}/dev/${path}`, {
		method: "POST",
		body: JSON.stringify(body),
	});

// fremde Signet-Adresse je Lauf (Adressbuch lehnt Doppelte ab)
const randomDestination = () =>
	p2wpkh(
		secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true),
		TEST_NETWORK,
	).address as string;

// zuletzt benutzte Seite: Bildschirmfoto, wenn der Ablauf abbricht
let lastPage: Page | null = null;

async function shot(page: Page, name: string) {
	if (!SHOTS) return;
	mkdirSync(SHOTS, { recursive: true });
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(300);
		await page.screenshot({
			path: join(SHOTS, `${name}-${width}.png`),
			fullPage: true,
		});
	}
	await page.setViewportSize({ width: 1280, height: 900 });
}

// Sicherheitsschlüssel (USB, gerätegebunden) bzw. synchronisierbarer Passkey
async function keyPage(browser: Browser, opts: { synced?: boolean } = {}) {
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 900 },
	});
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "usb",
			hasResidentKey: false,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
			...(opts.synced
				? { defaultBackupEligibility: true, defaultBackupState: true }
				: {}),
		},
	});
	return { ctx, page };
}

async function enrol(page: Page, person: string) {
	const start = await admin<{ url: string }>("enrol.start", { person });
	await page.goto(start.url);
	await page
		.getByRole("button", { name: "Sicherheitsschlüssel einrichten" })
		.click();
	await page.waitForFunction(
		() => {
			const s = document.getElementById("status")?.textContent ?? "";
			return s.startsWith("Eingerichtet") || s.includes("abgelehnt");
		},
		undefined,
		{ timeout: 20_000 },
	);
	return (await page.locator("#status").innerText()).trim();
}

async function approveOnConfirmPage(page: Page, link: string) {
	await page.goto(link);
	await page
		.getByRole("button", { name: "Mit Sicherheitsschlüssel bestätigen" })
		.click();
	await page.waitForFunction(
		() =>
			(document.getElementById("status")?.textContent ?? "").startsWith(
				"Freigabe vollständig",
			),
		undefined,
		{ timeout: 20_000 },
	);
	return page.url();
}

async function jobs() {
	resetSignerCache();
	await runWalletSync();
	return runWalletPayouts();
}

async function main() {
	if (!existsSync(STATE) || !existsSync(SECRET_FILE))
		throw new Error("Erst `tsx scripts/qa/crawl.ts --login` ausführen.");
	loadEnvFiles();
	process.env.SIGNER_SOCKET = APP;
	process.env.CONFIRM_ORIGIN = CONFIRM;
	const browser = await chromium.launch({ executablePath: EXEC });
	try {
		await run(browser);
	} catch (e) {
		check("Ablauf ohne Ausnahme", false, String(e));
		if (SHOTS && lastPage) {
			mkdirSync(SHOTS, { recursive: true });
			await lastPage
				.screenshot({ path: join(SHOTS, "failure.png"), fullPage: true })
				.catch(() => {});
			console.log(
				`Abbruch auf ${lastPage.url()} — ${join(SHOTS, "failure.png")}`,
			);
		}
	} finally {
		await browser.close();
	}
	const failures = failureCount();
	console.log(failures ? `\n${failures} Fehler` : "\nAlles grün.");
	process.exit(failures ? 1 : 0);
}

async function run(browser: Browser) {
	const owner: BrowserContext = await browser.newContext({
		storageState: STATE,
		viewport: { width: 1280, height: 900 },
	});
	const o = await withAuthenticator(owner);
	lastPage = o;
	const path = () => new URL(o.url()).pathname;
	const session = (await (
		await owner.request.get(`${BASE}/api/auth/get-session`)
	).json()) as {
		user: { id: string };
		session: { activeOrganizationId: string };
	};
	const userId = session.user.id;
	const orgId = session.session.activeOrganizationId;

	// 1. Signer einrichten (wie `signer:admin --dev init`), falls noch nicht
	const hello = await signer<{ initialized: boolean; orgId: string | null }>(
		"hello",
	);
	if (!hello.initialized) {
		const prep = await admin<{ token: string; words: Record<string, string> }>(
			"seed.prepare",
			{ networks: ["bitcoin_signet", "ethereum_sepolia"] },
		);
		await admin("init.commit", {
			token: prep.token,
			checks: Object.fromEntries(
				Object.entries(prep.words).map(([n, w]) => {
					const words = w.split(" ");
					return [n, { 1: words[0], 2: words[1], 3: words[2] }];
				}),
			),
			orgId,
			rpId: "localhost",
			origin: CONFIRM,
		});
	} else if (hello.orgId !== orgId)
		throw new Error(`Dev-Signer gehört zu Org ${hello.orgId}, QA-Org ${orgId}`);
	check("Signer eingerichtet für die QA-Org", true, orgId);

	// 2. Sicherheitsschlüssel: synchronisierbar abgelehnt, zwei USB-Schlüssel
	{
		const synced = await keyPage(browser, { synced: true });
		const status = await enrol(synced.page, userId);
		check(
			"Synchronisierbarer Passkey abgelehnt",
			status.includes("abgelehnt"),
			status,
		);
		await synced.ctx.close();
	}
	const keyA = await keyPage(browser);
	const keyB = await keyPage(browser);
	const a = await enrol(keyA.page, userId);
	check("Schlüssel A eingerichtet", a.startsWith("Eingerichtet"), a);
	if (SHOTS)
		await keyA.page.screenshot({ path: join(SHOTS, "confirm-enrol-1280.png") });
	const b = await enrol(keyB.page, userId);
	check("Schlüssel B eingerichtet", b.startsWith("Eingerichtet"), b);

	// 3. Klick-Passkey anlegen (Step-up per TOTP) und Wallet entsperren
	await o.goto(`${BASE}/login/2fa?stepup=1&zurueck=/einstellungen`);
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
	// Wallet-Bereich ist bei neuen Orgs aus (Inhaber:in schaltet ihn ein)
	await o.goto(`${BASE}/einstellungen?tab=organisation`);
	const area = o.locator("#wallet-area");
	await area.waitFor({ timeout: 30_000 });
	if ((await area.getAttribute("aria-checked")) !== "true") {
		await area.click();
		await o
			.getByText("Wallet-Bereich eingeschaltet.")
			.waitFor({ timeout: 15_000 });
	}
	check("Wallet-Bereich eingeschaltet", true);
	await o.goto(`${BASE}/wallet/entsperren?zurueck=%2Fwallet`);
	// nach einem abgebrochenen Lauf ist die Sitzung evtl. noch entsperrt
	const unlock = o.getByRole("button", { name: "Mit Passkey öffnen" });
	if (await unlock.isVisible({ timeout: 10_000 }).catch(() => false)) {
		await unlock.click();
		await o.waitForURL((u) => !u.pathname.endsWith("/entsperren"), {
			timeout: 30_000,
		});
	}
	// Einführung beim ersten Öffnen: „Später“
	for (let i = 0; i < 3 && path().startsWith("/wallet/einfuehrung"); i += 1) {
		await o
			.getByRole("button", { name: "Später", exact: true })
			.first()
			.click();
		await o
			.waitForURL((u) => u.pathname === "/wallet", { timeout: 15_000 })
			.catch(() => {});
	}
	check("Wallet entsperrt", path() === "/wallet", o.url());
	check(
		"Navigation „Senden“ mit eigenem Signer",
		(await o.getByRole("link", { name: "Auszahlungen" }).count()) > 0,
	);

	// 4. Hot-Konto anlegen (Inhaber:in, Step-up per Passkey)
	const name = `Smoke Hot ${Date.now().toString(36)}`;
	await o.goto(`${BASE}/wallet/konten`);
	await o.getByRole("button", { name: "Hot-Konto anlegen" }).first().click();
	await o.fill("#hot-name", name);
	await o.locator("#hot-network").click();
	await o.getByRole("option", { name: /Bitcoin Signet/ }).click();
	await o
		.getByRole("dialog")
		.getByRole("button", { name: "Hot-Konto anlegen" })
		.click();
	const stepUp = o.getByRole("button", { name: "Mit Passkey bestätigen" });
	if (await stepUp.isVisible({ timeout: 4000 }).catch(() => false))
		await stepUp.click();
	const created = o.getByRole("dialog").locator("p.font-mono");
	await created.waitFor({ timeout: 20_000 });
	const address = (await created.innerText()).trim();
	check("Hot-Konto angelegt", address.startsWith("tb1q"), address);
	await o.keyboard.press("Escape");

	// 5. Eingang aus der Testkette
	await node("faucet", { address, amount: "0.01" });
	await node("mine", { n: 1 });
	await runWalletSync();
	await runWalletSync();

	// 6. Zieladresse vorschlagen und mit Schlüssel B freigeben
	const destination = randomDestination();
	const label = `Smoke Ziel ${Date.now().toString(36)}`;
	await o.goto(`${BASE}/wallet/adressbuch`);
	await o.getByRole("button", { name: "Adresse vorschlagen" }).click();
	await o.locator("#ab-network").click();
	await o.getByRole("option", { name: /Bitcoin Signet/ }).click();
	await o.fill("#ab-address", destination);
	await o.fill("#ab-label", label);
	await o.getByRole("button", { name: "Vorschlagen" }).click();
	const entry = o.locator("li", { hasText: label });
	await entry.waitFor({ timeout: 15_000 });
	const abLink = await entry
		.getByRole("link", { name: "Auf der Bestätigungsseite freigeben" })
		.getAttribute("href");
	check(
		"Freigabe-Link zur Bestätigungsseite",
		Boolean(abLink?.startsWith(CONFIRM)),
		abLink ?? "",
	);
	const afterApprove = await approveOnConfirmPage(keyB.page, abLink as string);
	check("Fragment danach entfernt", !afterApprove.includes("#"), afterApprove);
	await jobs();
	await o.reload();
	check(
		"Zieladresse aktiv (Wartezeit 0 im Dev-Signer)",
		(await o.locator("li", { hasText: label }).getByText("Aktiv").count()) > 0,
	);
	await shot(o, "wallet-adressbuch");

	// 7. Auszahlung anlegen
	await o.goto(`${BASE}/wallet/senden`);
	await o.locator("#send-account").click();
	await o.getByRole("option", { name: new RegExp(name) }).click();
	// über der Grenze je Auszahlung (Dev-Richtlinie 0,001 BTC): abgelehnt
	await o.fill("#send-amount", "0,0015");
	await o.locator("#send-dest").click();
	await o.getByRole("option", { name: new RegExp(label) }).click();
	await o.getByRole("button", { name: "Auszahlung anlegen" }).click();
	await o
		.getByText("Über der Grenze je Auszahlung laut Richtlinie.")
		.waitFor({ timeout: 15_000 });
	check("Grenze je Auszahlung greift", true);
	await o.fill("#send-amount", "0,0008");
	await shot(o, "wallet-senden");
	await o.getByRole("button", { name: "Auszahlung anlegen" }).click();
	await o.waitForURL(/\/wallet\/auszahlungen\/[0-9a-f-]{36}$/, {
		timeout: 30_000,
	});
	const payoutUrl = o.url();
	check("Auszahlung angelegt", true, payoutUrl);
	check(
		"Stand „Wartet auf Bestätigung“",
		(await o.getByText("Wartet auf Bestätigung").count()) > 0,
	);
	await shot(o, "wallet-auszahlung-wartet");

	// 8. Bestätigen mit Schlüssel A, Job signiert und sendet
	const link = await o
		.getByRole("link", { name: "Auf der Bestätigungsseite bestätigen" })
		.getAttribute("href");
	await keyA.page.goto(link as string);
	await keyA.page
		.getByRole("heading", { name: "Auszahlung bestätigen" })
		.waitFor();
	// Ziel in Viererblöcken: ohne Leerraum vergleichen
	const confirmText = await keyA.page.locator("body").innerText();
	check(
		"Bestätigungsseite zeigt Betrag und Ziel",
		confirmText.includes("0,0008 BTC") &&
			confirmText.replace(/\s+/g, "").includes(destination),
	);
	if (SHOTS)
		await keyA.page.screenshot({
			path: join(SHOTS, "confirm-payout-1280.png"),
			fullPage: true,
		});
	await approveOnConfirmPage(keyA.page, link as string);
	await jobs();
	await o.reload();
	check("Gesendet", (await o.getByText("Gesendet").count()) > 0);
	await node("mine", { n: 1 });
	await jobs();
	await o.reload();
	check(
		"Im Netz bestätigt",
		(await o.getByText("Bestätigt im Netz").count()) > 0,
	);
	await shot(o, "wallet-auszahlung-bestaetigt");

	// 9. Zweite Auszahlung langsam, dann Beschleunigen
	await o.goto(`${BASE}/wallet/senden`);
	await o.locator("#send-account").click();
	await o.getByRole("option", { name: new RegExp(name) }).click();
	await o.fill("#send-amount", "0,0005");
	await o.locator("#send-dest").click();
	await o.getByRole("option", { name: new RegExp(label) }).click();
	await o.getByText("Langsam").click();
	await o.getByRole("button", { name: "Auszahlung anlegen" }).click();
	await o.waitForURL(/\/wallet\/auszahlungen\/[0-9a-f-]{36}$/, {
		timeout: 30_000,
	});
	const link2 = await o
		.getByRole("link", { name: "Auf der Bestätigungsseite bestätigen" })
		.getAttribute("href");
	await approveOnConfirmPage(keyA.page, link2 as string);
	await jobs();
	await o.reload();
	await o.getByRole("button", { name: "Beschleunigen" }).click();
	await o.getByText("Beschleunigen läuft").waitFor({ timeout: 15_000 });
	await jobs();
	await o.reload();
	check(
		"Frühere Fassung nach dem Beschleunigen",
		(await o.getByText("Frühere Fassungen").count()) > 0,
	);
	await node("mine", { n: 1 });
	await jobs();
	await o.reload();
	check(
		"Beschleunigte Auszahlung bestätigt",
		(await o.getByText("Bestätigt im Netz").count()) > 0,
	);

	await o.goto(`${BASE}/wallet/auszahlungen`);
	await shot(o, "wallet-auszahlungen");

	// 10. Fremde Herkunft am Relay abgelehnt
	const intentId = new URL(link as string).hash.match(/i=([0-9a-f]{32})/)?.[1];
	const foreign = await fetch(`${BASE}/api/wallet/bestaetigung/${intentId}`, {
		headers: { origin: "https://evil.example" },
	});
	check(
		"Relay lehnt fremde Herkunft ab",
		foreign.status === 403,
		String(foreign.status),
	);

	// 11. Alles stoppen: Banner im ganzen Bereich, auftauen nur am Terminal
	await o.goto(`${BASE}/wallet/sicherheit`);
	await shot(o, "wallet-sicherheit");
	await o.getByRole("button", { name: "Alles stoppen" }).click();
	await o.fill("#freeze-reason", "Smoke: Notfallübung");
	await o.getByRole("button", { name: "Signer einfrieren" }).click();
	await o
		.getByText("Signer eingefroren: Auszahlungen gestoppt.")
		.waitFor({ timeout: 15_000 });
	await o.goto(`${BASE}/wallet`);
	check(
		"Banner „eingefroren“ auf der Startseite",
		(await o.getByText("Signer eingefroren: Auszahlungen gestoppt.").count()) >
			0,
	);
	await shot(o, "wallet-eingefroren");
	await admin("unfreeze");
	resetSignerCache();
	await o.waitForTimeout(16_000); // Signer-Stand ist 15 s im Server gemerkt
	await o.reload();
	check(
		"Nach dem Auftauen kein Banner",
		(await o.getByText("Signer eingefroren").count()) === 0,
	);
	await keyA.ctx.close();
	await keyB.ctx.close();
	await owner.close();
}

main();
