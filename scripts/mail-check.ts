import { loadEnvFiles } from "../lib/env";
import {
	diagnoseMailConfig,
	mailErrorHint,
	sendTransactionalMail,
} from "../lib/mail/send";
import { transactionalEmail } from "../lib/mail/templates";

// Mail-Diagnose: `pnpm mail:check [empfänger]`
//
// Zeigt den konfigurierten Zustellweg (Resend → Brevo → SMTP → keiner). Mit Empfänger
// geht eine Testmail raus; Ergebnis und Fehlertext des Providers stehen im
// Terminal, dazu ein Hinweis zur üblichen Ursache. Läuft auf dem Server mit
// derselben Umgebung wie der Dienst (deploy/README.md). Ohne funktionierenden
// Zustellweg kommt in Produktion kein Anmelde-Link an — Notfall: `pnpm auth:link`.
async function main() {
	loadEnvFiles();
	const to = process.argv[2]?.trim();
	const cfg = await diagnoseMailConfig();

	console.log("Mailversand");
	console.log(
		`  Absender: ${cfg.mailFrom}${process.env.MAIL_FROM ? " (MAIL_FROM)" : " (Standard)"}`,
	);
	console.log(
		`  Resend (RESEND_API_KEY): ${cfg.hasResendKey ? "gesetzt" : "—"}`,
	);
	console.log(`  Brevo (BREVO_API_KEY): ${cfg.hasBrevoKey ? "gesetzt" : "—"}`);
	console.log(
		`  SMTP: ${cfg.hasSmtpHost ? `${cfg.smtpHost}:${cfg.smtpPort ?? 587} · Benutzer ${process.env.SMTP_USER ? "gesetzt" : "—"} · Passwort ${process.env.SMTP_PASS ? "gesetzt" : "—"}` : "—"}`,
	);
	console.log(
		`  Zustellweg: ${cfg.likelyPath === "console" ? "keiner ✗" : cfg.likelyPath}`,
	);

	if (cfg.likelyPath === "console") {
		console.log(`\n✗ ${mailErrorHint("no_provider", cfg)}`);
		process.exitCode = 1;
		return;
	}
	if (!to) {
		console.log("\nTestmail senden: pnpm mail:check <empfänger>");
		return;
	}

	// Gleiche HTML-Gestaltung wie alle App-Mails (mit Klartext-Teil), damit
	// der Test zeigt, wie Anmelde-Links und Benachrichtigungen ankommen.
	const base = process.env.BETTER_AUTH_URL;
	const mail = transactionalEmail({
		subject: "Klick: Testmail",
		eyebrow: "Mailversand",
		title: "Die Testmail ist angekommen.",
		body: "Diese Mail kommt von `pnpm mail:check`. Wenn sie in deinem Posteingang liegt, erreichen dich auch Anmelde-Links, Einladungen und Benachrichtigungen.",
		cta: base ? { label: "Klick öffnen", url: `${base}/heute` } : undefined,
	});
	const out = await sendTransactionalMail({ to, ...mail });
	if (out.ok && out.path !== "console") {
		console.log(
			`\n✔ Zugestellt über ${out.path} an ${to} — Spam-Ordner prüfen, falls sie nicht im Posteingang liegt.`,
		);
		return;
	}
	// ok ohne echten Zustellweg = Konsole (nur ohne NODE_ENV=production).
	const error = out.ok ? "no_provider" : out.error;
	console.log(`\n✗ Nicht zugestellt: ${error}`);
	const hint = mailErrorHint(error, cfg);
	if (hint) console.log(`  → ${hint}`);
	process.exitCode = 1;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
