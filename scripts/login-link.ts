import { eq } from "drizzle-orm";
import { globalDb, sqlClient } from "../db";
import { user } from "../db/auth-schema";
import { auditPlatform } from "../lib/audit";
import { loadEnvFiles } from "../lib/env";

// Notfall-Login: `pnpm auth:link <email>`
//
// Gibt einen einmaligen Anmelde-Link (15 Minuten) im Terminal aus — für den
// Fall, dass keine Mail ankommt (Mailversand fehlt oder scheitert; Ursache mit
// `pnpm mail:check` klären). Läuft auf dem Server mit denselben Secrets wie
// `pnpm release` (deploy/README.md). Der Link geht weder per Mail raus noch
// ins Journal; jede Ausgabe steht als auth.login_link_cli im Plattform-Audit.
// Wie im Login-Formular: nur bestehende Konten und offene Einladungen (mit
// AUTH_ALLOW_SIGNUP=true jede Adresse). Danach gelten 2FA und alle
// Sitzungsregeln unverändert.
async function main() {
	loadEnvFiles();
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email?.includes("@")) {
		console.error("Aufruf: pnpm auth:link <email>");
		process.exit(2);
	}
	// Erst nach loadEnvFiles laden: server.ts liest BETTER_AUTH_URL beim Import.
	const { auth, captureMagicLink } = await import("../lib/auth/server");

	let link: string | null = null;
	captureMagicLink((url) => {
		link = url;
	});
	await auth.api.signInMagicLink({
		body: {
			email,
			callbackURL: "/heute",
			newUserCallbackURL: "/onboarding",
			errorCallbackURL: "/login/notweg?grund=link-ungueltig",
		},
		headers: new Headers(),
	});
	captureMagicLink(null);

	if (!link) {
		console.error(
			"✗ Kein Link: zu dieser Adresse gibt es kein Konto und keine offene Einladung (AUTH_ALLOW_SIGNUP ist aus).",
		);
		process.exitCode = 1;
		return;
	}

	const [u] = await globalDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	await auditPlatform(
		{ userId: null },
		{
			action: "auth.login_link_cli",
			target: u ? `user:${u.id}` : null,
			after: { newAccount: !u },
		},
	);

	console.log(
		`\nAnmelde-Link (einmalig, 15 Minuten gültig, nicht weitergeben):\n\n${link}\n`,
	);
}

main()
	.catch((err) => {
		console.error("\n✗ Anmelde-Link fehlgeschlagen:");
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sqlClient.end({ timeout: 5 });
		// Better Auth/Treiber halten ggf. Timer offen.
		process.exit();
	});
