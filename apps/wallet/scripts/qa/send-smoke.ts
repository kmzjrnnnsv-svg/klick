/**
 * both.money: Senden aus einem Hot-Konto im echten Browser (wie Klicks
 * scripts/qa/wallet-send-smoke.ts): Konto per Aktivierungslink und Passkey →
 * Signer prüfen → zwei Sicherheitsschlüssel über den Link vom Terminal (ein
 * synchronisierbarer Passkey wird abgelehnt) → Einführung „Später“ →
 * Hot-Konto → Eingang aus der Testkette → Zieladresse vorschlagen und auf
 * der Bestätigungsseite freigeben → Auszahlung anlegen, bestätigen,
 * signieren, senden, bestätigt → Beschleunigen → fremde Herkunft am Relay
 * abgelehnt → „Alles stoppen“ mit Banner. Die Jobs ruft das Skript selbst.
 *
 * Voraussetzung (je ein Terminal):
 *   pnpm wallet:devchain
 *   pnpm signer:dev && pnpm signer:admin --dev init --org <orgId> --rp localhost \
 *     --origin http://localhost:3201 --networks bitcoin_signet,ethereum_sepolia
 *   CONFIRM_API=http://localhost:3400 pnpm confirm:dev
 *   WALLET_DISABLE_JOBS=true WALLET_SIGNER_SOCKET=$QA_DIR/signer/app.sock \
 *     WALLET_CONFIRM_ORIGIN=http://localhost:3201 \
 *     WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443 pnpm dev:wallet
 *
 *   <gleiche WALLET_*-Umgebung> pnpm wallet:smoke:send --org <slug>
 *   WALLET_SHOTS=<ordner> …   (Bildschirmfotos 1280 und 390 px)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "@playwright/test";
import { p2wpkh, TEST_NETWORK } from "@scure/btc-signer";
import { runWalletPayouts } from "@wallet/lib/jobs/wallet-payouts";
import { runWalletSync } from "@wallet/lib/jobs/wallet-sync";
import { resetSignerCache } from "@wallet/lib/wallet/signer/status";
import { QA_DIR } from "@/scripts/qa/paths";
import {
	check,
	EXEC,
	failureCount,
	withAuthenticator,
} from "@/scripts/qa/webauthn";
import { callSigner } from "@/signer/client";

const BASE = process.env.WALLET_AUTH_URL ?? "http://localhost:3400";
const CONFIRM = process.env.WALLET_CONFIRM_ORIGIN ?? "http://localhost:3201";
const BTC_NODE = "http://127.0.0.1:18443";
const SHOTS = process.env.WALLET_SHOTS;
const ADMIN = join(QA_DIR, "signer", "admin.sock");
const APP =
	process.env.WALLET_SIGNER_SOCKET ?? join(QA_DIR, "signer", "app.sock");
const ORG = process.argv[process.argv.indexOf("--org") + 1] ?? "";

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

// Inhaber:in per CLI anlegen (wie im Betrieb), Link aus der Ausgabe
function activationLink(email: string): string {
	const out = execFileSync(
		"pnpm",
		[
			"-s",
			"wallet:admin",
			"account",
			"create",
			"--email",
			email,
			"--name",
			"Smoke Inhaberin",
			"--org",
			ORG,
			"--role",
			"owner",
		],
		{ env: { ...process.env, WALLET_AUTH_URL: BASE } },
	).toString();
	const url = out.match(/https?:\/\/\S+#kwl_activate_\S+/)?.[0];
	if (!url) throw new Error(`Kein Aktivierungslink: ${out}`);
	return url;
}

async function main() {
	if (!ORG) throw new Error("--org <slug> fehlt");
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
		viewport: { width: 1280, height: 900 },
	});
	const o = await withAuthenticator(owner);
	lastPage = o;
	const path = () => new URL(o.url()).pathname;

	// 1. Konto aktivieren (Passkey) — die Sitzung ist danach entsperrt
	await o.goto(activationLink(`smoke-${Date.now()}@example.org`));
	await o.getByRole("button", { name: "Passkey anlegen" }).click();
	await o.waitForURL((u) => u.pathname !== "/activate", { timeout: 30_000 });
	const session = (await (
		await owner.request.get(`${BASE}/api/auth/get-session`)
	).json()) as { user: { id: string }; session: { activeOrgId: string } };
	const userId = session.user.id;
	const orgId = session.session.activeOrgId;
	check("Konto aktiviert", Boolean(userId && orgId), orgId);

	// 2. Signer gehört dieser Org
	const hello = await signer<{ initialized: boolean; orgId: string | null }>(
		"hello",
	);
	check(
		"Signer eingerichtet für diese Org",
		hello.initialized && hello.orgId === orgId,
		`${hello.orgId} / ${orgId}`,
	);

	// 3. Sicherheitsschlüssel: synchronisierbar abgelehnt, zwei USB-Schlüssel
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

	// 4. Einführung beim ersten Öffnen: „Später“
	await o.goto(`${BASE}/`);
	if (path().startsWith("/welcome")) await shot(o, "welcome");
	for (let i = 0; i < 3 && path().startsWith("/welcome"); i += 1) {
		await o
			.getByRole("button", { name: "Später", exact: true })
			.first()
			.click();
		await o
			.waitForURL((u) => u.pathname === "/", { timeout: 15_000 })
			.catch(() => {});
	}
	check("Übersicht nach der Einführung", path() === "/", o.url());
	check(
		"Navigation „Senden“ mit eigenem Signer",
		(await o.getByRole("link", { name: "Auszahlungen" }).count()) > 0,
	);

	// 5. Hot-Konto anlegen (Inhaber:in, Step-up per Passkey)
	const name = `Smoke Hot ${Date.now().toString(36)}`;
	await o.goto(`${BASE}/accounts`);
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

	// 6. Eingang aus der Testkette
	await node("faucet", { address, amount: "0.01" });
	await node("mine", { n: 1 });
	await runWalletSync();
	await runWalletSync();
	await o.goto(`${BASE}/activity`);
	check("Eingang unter Bewegungen", (await o.getByText("0,01").count()) > 0);
	await shot(o, "activity");

	// 7. Zieladresse vorschlagen und mit Schlüssel B freigeben
	const destination = randomDestination();
	const label = `Smoke Ziel ${Date.now().toString(36)}`;
	await o.goto(`${BASE}/address-book`);
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
	await shot(o, "address-book");

	// 8. Auszahlung anlegen
	await o.goto(`${BASE}/send`);
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
	await shot(o, "send");
	await o.getByRole("button", { name: "Auszahlung anlegen" }).click();
	await o.waitForURL(/\/payouts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
	check("Auszahlung angelegt", true, o.url());
	check(
		"Stand „Wartet auf Bestätigung“",
		(await o.getByText("Wartet auf Bestätigung").count()) > 0,
	);
	await shot(o, "payout-waiting");

	// 9. Bestätigen mit Schlüssel A, Job signiert und sendet
	const link = await o
		.getByRole("link", { name: "Auf der Bestätigungsseite bestätigen" })
		.getAttribute("href");
	await keyA.page.goto(link as string);
	await keyA.page
		.getByRole("heading", { name: "Auszahlung bestätigen" })
		.waitFor();
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
	await shot(o, "payout-confirmed");

	// 10. Zweite Auszahlung langsam, dann Beschleunigen
	await o.goto(`${BASE}/send`);
	await o.locator("#send-account").click();
	await o.getByRole("option", { name: new RegExp(name) }).click();
	await o.fill("#send-amount", "0,0005");
	await o.locator("#send-dest").click();
	await o.getByRole("option", { name: new RegExp(label) }).click();
	await o.getByText("Langsam").click();
	await o.getByRole("button", { name: "Auszahlung anlegen" }).click();
	await o.waitForURL(/\/payouts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
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
	await o.goto(`${BASE}/payouts`);
	await shot(o, "payouts");

	// 11. Fremde Herkunft am Relay abgelehnt
	const intentId = new URL(link as string).hash.match(/i=([0-9a-f]{32})/)?.[1];
	const foreign = await fetch(`${BASE}/api/confirm/${intentId}`, {
		headers: { origin: "https://evil.example" },
	});
	check(
		"Relay lehnt fremde Herkunft ab",
		foreign.status === 403,
		String(foreign.status),
	);

	// 12. Alles stoppen: Banner auf jeder Seite, auftauen nur am Terminal
	await o.goto(`${BASE}/security`);
	await shot(o, "security");
	await o.getByRole("button", { name: "Alles stoppen" }).click();
	await o.fill("#freeze-reason", "Smoke: Notfallübung");
	await o.getByRole("button", { name: "Signer einfrieren" }).click();
	await o
		.getByText("Signer eingefroren: Auszahlungen gestoppt.")
		.waitFor({ timeout: 15_000 });
	await o.goto(`${BASE}/`);
	check(
		"Banner „eingefroren“ auf der Übersicht",
		(await o.getByText("Signer eingefroren: Auszahlungen gestoppt.").count()) >
			0,
	);
	await shot(o, "frozen");
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
