/**
 * Passkey-Durchlauf (ADR-019) mit virtuellem Authenticator (CDP WebAuthn):
 * Passkey anlegen → Anmeldung per Passkey → Bestätigen per Passkey →
 * Einladungslink ohne Mail → Zugang zurücksetzen → letzter Faktor gesperrt.
 *
 * Voraussetzung: QA-Konto aus `pnpm exec tsx scripts/qa/crawl.ts --login`
 * (Sitzung und TOTP-Schlüssel in QA_DIR, siehe paths.ts).
 *
 *   pnpm exec tsx scripts/qa/passkey-smoke.ts
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { type BrowserContext, chromium, type Page } from "@playwright/test";
import {
	QA_BASE as BASE,
	QA_SECRET as SECRET_FILE,
	QA_STATE as STATE,
} from "./paths";

const EXEC = existsSync("/opt/pw-browsers/chromium")
	? "/opt/pw-browsers/chromium"
	: undefined;

function totp(secret: string, now = Date.now()): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const ch of secret.toUpperCase().replace(/=+$/, "")) {
		const v = alphabet.indexOf(ch);
		if (v >= 0) bits += v.toString(2).padStart(5, "0");
	}
	const key: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8)
		key.push(Number.parseInt(bits.slice(i, i + 8), 2));
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
	const h = createHmac("sha1", Buffer.from(key)).update(msg).digest();
	const off = (h[h.length - 1] ?? 0) & 0xf;
	const code =
		(((h[off] ?? 0) & 0x7f) << 24) |
		((h[off + 1] ?? 0) << 16) |
		((h[off + 2] ?? 0) << 8) |
		(h[off + 3] ?? 0);
	return String(code % 1_000_000).padStart(6, "0");
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures += 1;
}

// Virtueller Plattform-Authenticator mit Nutzerverifikation (Biometrie/PIN)
async function withAuthenticator(ctx: BrowserContext): Promise<Page> {
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "internal",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});
	return page;
}

async function main() {
	if (!existsSync(STATE) || !existsSync(SECRET_FILE))
		throw new Error("Erst `tsx scripts/qa/crawl.ts --login` ausführen.");
	const browser = await chromium.launch({ executablePath: EXEC });
	const owner = await browser.newContext({ storageState: STATE });
	const o = await withAuthenticator(owner);

	// 1) Passkey anlegen (Step-up per TOTP, sonst sperrt endpoint-policy)
	await o.goto(`${BASE}/login/2fa?stepup=1&zurueck=/einstellungen`);
	await o.fill("#code", totp(readFileSync(SECRET_FILE, "utf8").trim()));
	await o.click('form button[type="submit"]');
	await o.waitForURL(/einstellungen/);
	await o.goto(`${BASE}/einstellungen?tab=security`);
	await o.getByRole("button", { name: "Passkey hinzufügen" }).click();
	await o.waitForTimeout(2500);
	check(
		"Passkey angelegt",
		(await o.getByRole("button", { name: "Entfernen", exact: true }).count()) >
			0,
	);

	// 2) Abmelden, Anmeldung per Passkey ohne Mail und ohne Code
	await owner.clearCookies();
	await o.goto(`${BASE}/login`);
	await o.getByRole("button", { name: /Mit Passkey anmelden/ }).click();
	await o.waitForURL(/\/heute/, { timeout: 30_000 }).catch(() => {});
	check("Anmeldung per Passkey", o.url().includes("/heute"), o.url());

	// 3) Bestätigen per Passkey (Step-up-Seite)
	await o.goto(`${BASE}/login/2fa?stepup=1&zurueck=/team`);
	await o.getByRole("button", { name: "Mit Passkey bestätigen" }).click();
	await o
		.waitForURL((u) => u.pathname === "/team", { timeout: 30_000 })
		.catch(() => {});
	check("Step-up per Passkey", new URL(o.url()).pathname === "/team", o.url());

	// 4) Einladungslink ohne Mail → neue Person legt Passkey an
	await o.getByRole("button", { name: "Einladen" }).click();
	await o.fill("#invite-email", `qa-passkey+${Date.now()}@example.com`);
	await o.getByLabel("Auch per Mail schicken").click();
	await o.locator("form").getByRole("button", { name: "Einladen" }).click();
	const box = o.getByRole("textbox", { name: "Einladungslink" });
	await box.waitFor({ timeout: 15_000 });
	const invite = await box.inputValue();
	check("Einladungslink angezeigt", invite.includes("/einladung#klk_invite_"));
	const guest = await browser.newContext();
	const g = await withAuthenticator(guest);
	await g.goto(invite);
	await g.fill("#reg-name", "QA Passkey");
	await g
		.getByRole("button", { name: /Passkey anlegen und beitreten/ })
		.click();
	await g.waitForURL(/\/heute/, { timeout: 30_000 }).catch(() => {});
	check("Beitritt per Einladungslink", g.url().includes("/heute"), g.url());
	const reuse = await (await browser.newContext()).newPage();
	await reuse.goto(invite);
	await reuse.waitForTimeout(2000);
	check(
		"Einladungslink nur einmal nutzbar",
		(await reuse.getByText(/ungültig, abgelaufen/).count()) > 0,
	);

	// 5) Zugang zurücksetzen (Owner) → Link → neuer Passkey
	await o.goto(`${BASE}/team`);
	await o
		.getByRole("row", { name: /QA Passkey/ })
		.getByRole("button")
		.last()
		.click();
	await o.getByRole("menuitem", { name: "Zugang zurücksetzen" }).click();
	await o.getByRole("button", { name: "Zurücksetzen" }).click();
	const resetBox = o.getByRole("textbox", {
		name: /Link für den neuen Passkey/,
	});
	await resetBox.waitFor({ timeout: 15_000 });
	const recover = await resetBox.inputValue();
	check("Zurücksetz-Link angezeigt", recover.includes("/zugang#klk_recover_"));
	await g.goto(`${BASE}/heute`);
	check("Alte Sitzung beendet", g.url().includes("/login"), g.url());
	const again = await withAuthenticator(await browser.newContext());
	await again.goto(recover);
	await again.getByRole("button", { name: /Neuen Passkey anlegen/ }).click();
	await again.waitForURL(/\/heute/, { timeout: 30_000 }).catch(() => {});
	check("Neuer Passkey über Zurücksetz-Link", again.url().includes("/heute"));

	// 6) Letzter Faktor nicht löschbar
	await again.goto(`${BASE}/einstellungen?tab=security`);
	const del = again
		.getByRole("button", { name: "Entfernen", exact: true })
		.first();
	check("Letzter Passkey nicht löschbar (UI)", await del.isDisabled());
	const res = await again.request.post(
		`${BASE}/api/auth/passkey/delete-passkey`,
		{
			data: { id: "00000000-0000-0000-0000-000000000000" },
			headers: { origin: BASE },
		},
	);
	check("Letzter Passkey nicht löschbar (API)", res.status() === 403);

	await browser.close();
	console.log(failures ? `\n${failures} Fehler` : "\nAlles grün.");
	process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
