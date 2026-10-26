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
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import postgres from "postgres";
import {
	QA_BASE as BASE,
	QA_SECRET as SECRET_FILE,
	QA_STATE as STATE,
} from "./paths";
import { check, EXEC, failureCount, totp, withAuthenticator } from "./webauthn";

// Wartezeit der Vier-Augen-Anträge vorspulen (nur QA, nie Produktion)
async function fastForwardFourEyes(summaryPrefix: string) {
	const url = process.env.QA_DB_URL ?? process.env.DATABASE_URL_MIGRATE;
	if (!url) throw new Error("QA_DB_URL fehlt (Wartezeit vorspulen)");
	const sql = postgres(url, { max: 1 });
	try {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`update security_changes
				set apply_after = now() - interval '1 minute'
				where status = 'waiting' and summary like ${`${summaryPrefix}%`}`;
		});
	} finally {
		await sql.end();
	}
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
	// Vier-Augen (Härtung A4): als einzige Inhaber:in startet das die 24-h-
	// Wartezeit. Der Smoke spult sie über die Datenbank vor (QA_DB_URL bzw.
	// DATABASE_URL_MIGRATE) und setzt danach zurück.
	await o
		.getByText(/24 Stunden|zweite Person/)
		.first()
		.waitFor({
			timeout: 15_000,
		});
	check("Vier-Augen-Hinweis beim Zurücksetzen", true);
	await fastForwardFourEyes("Zugang von");
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
	const failures = failureCount();
	console.log(failures ? `\n${failures} Fehler` : "\nAlles grün.");
	process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
