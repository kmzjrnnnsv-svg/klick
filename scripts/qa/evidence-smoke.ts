/**
 * Nachweis-Werkstatt-Durchlauf mit virtuellem Authenticator (CDP WebAuthn):
 * Passkey anlegen → ISO 27001 → Reiter „Nachweise“ → fällige Nachweise
 * erzeugen → einen Nachweis unterschreiben → Sammelunterschrift → Prüfseite
 * → signaturen.json offline prüfen (ohne Klick, nur node:crypto).
 *
 * Voraussetzung: QA-Konto aus `pnpm exec tsx scripts/qa/crawl.ts --login`
 * mit Funktion Geschäftsleitung (Einrichtung) und laufender Ablage (S3).
 *
 *   pnpm exec tsx scripts/qa/evidence-smoke.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { verifyAssertion } from "../../lib/signatures/verify";
import {
	QA_BASE as BASE,
	QA_SECRET as SECRET_FILE,
	QA_STATE as STATE,
} from "./paths";
import { check, EXEC, failureCount, totp, withAuthenticator } from "./webauthn";

type SignaturesJson = {
	evidence: { sha256: string };
	verification: { rpId: string; origin: string };
	signatures: {
		challenge: string;
		publicKeyCose: string;
		authenticatorData: string;
		clientDataJSON: string;
		signature: string;
		check: { valid: boolean };
	}[];
};

const b = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function main() {
	if (!existsSync(STATE) || !existsSync(SECRET_FILE))
		throw new Error("Erst `tsx scripts/qa/crawl.ts --login` ausführen.");
	const browser = await chromium.launch({ executablePath: EXEC });
	const ctx = await browser.newContext({ storageState: STATE });
	const page = await withAuthenticator(ctx);
	const toast = async () => {
		await page.waitForSelector("[data-sonner-toast]", { timeout: 120_000 });
		const text = (
			await page.locator("[data-sonner-toast]").allInnerTexts()
		).join(" | ");
		await page.waitForTimeout(500);
		return text;
	};

	const step = (s: string) => console.log(`→ ${s}`);
	page.setDefaultTimeout(60_000);
	// 1) Passkey anlegen (Step-up per TOTP)
	step("Passkey anlegen");
	await page.goto(`${BASE}/login/2fa?stepup=1&zurueck=/einstellungen`);
	await page.fill("#code", totp(readFileSync(SECRET_FILE, "utf8").trim()));
	await page.click('form button[type="submit"]');
	await page.waitForURL(/einstellungen/);
	await page.goto(`${BASE}/einstellungen?tab=security`);
	await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
	await page.waitForTimeout(2500);

	step("Nachweise erzeugen");
	// 2) Fällige Nachweise erzeugen
	await page.goto(`${BASE}/rahmenwerke/iso27001?tab=nachweise`, {
		waitUntil: "load",
	});
	await page.waitForTimeout(2500);
	const bulk = page.getByRole("button", {
		name: /fällige? Nachweise? erzeugen/,
	});
	if (await bulk.isEnabled().catch(() => false)) {
		await bulk.click();
		check("Nachweise erzeugt", /erzeugt|Nichts Neues/.test(await toast()));
		await page.reload({ waitUntil: "load" });
		await page.waitForTimeout(2500);
	}

	step("Einzelunterschrift");
	// 3) Einen Nachweis unterschreiben (Kontextanalyse)
	const row = page
		.locator("section[aria-labelledby='ev-kinds'] li")
		.filter({ hasText: "Kontextanalyse" });
	const one = row.getByRole("button", { name: "Unterschreiben" });
	if ((await one.count()) > 0) {
		await one.click();
		check("Einzelunterschrift", /Unterschrieben/.test(await toast()));
		await page.reload({ waitUntil: "load" });
		await page.waitForTimeout(2500);
	}
	check(
		"Unterschrift sichtbar",
		/Unterschrieben von/.test(await row.innerText()),
	);

	step("Sammelunterschrift");
	// 4) Sammelunterschrift
	const batch = page.getByRole("button", { name: /gesammelt unterschreiben/ });
	if ((await batch.count()) > 0) {
		const label = await batch.innerText();
		await batch.click();
		check(
			`Sammelunterschrift (${label.trim()})`,
			/unterschrieben/i.test(await toast()),
		);
		await page.reload({ waitUntil: "load" });
		await page.waitForTimeout(2500);
	}

	step("Prüfseite");
	// 5) Prüfseite und signaturen.json
	await row.getByRole("link", { name: "Unterschriften prüfen" }).click();
	await page.waitForURL(/unterschriften/);
	await page.waitForTimeout(1500);
	check(
		"Prüfseite: gültig",
		(await page.getByText("gültig", { exact: true }).count()) > 0 &&
			(await page.getByText("ungültig", { exact: true }).count()) === 0,
	);
	const id = page.url().match(/nachweise\/([0-9a-f-]{36})/)?.[1] ?? "";
	const res = await ctx.request.get(
		`${BASE}/api/nachweise/${id}/unterschriften`,
	);
	const json = (await res.json()) as SignaturesJson;
	check("signaturen.json", res.status() === 200 && json.signatures.length > 0);
	for (const s of json.signatures) {
		const r = verifyAssertion({
			publicKeyCose: b(s.publicKeyCose),
			authenticatorData: b(s.authenticatorData),
			clientDataJSON: b(s.clientDataJSON),
			signature: b(s.signature),
			expectedChallenge: s.challenge,
			expectedOrigin: json.verification.origin,
			rpId: json.verification.rpId,
		});
		check("offline geprüft", r.ok && s.check.valid, JSON.stringify(r));
	}

	await browser.close();
	const failures = failureCount();
	console.log(failures ? `\n${failures} Fehler` : "\nAlles grün.");
	process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
