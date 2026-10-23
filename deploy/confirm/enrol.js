// Klick · Sicherheitsschlüssel einrichten. Link vom Terminal
// (`pnpm signer:admin enrol`): /enrol.html#e=<id>&t=<geheim>&p=<person>
import {
	apiBase,
	b64u,
	el,
	enrolChallenge,
	enrolMac,
	fmtTime,
	takeFragment,
} from "./canonical.js";

const $ = (id) => document.getElementById(id);

const MESSAGES = {
	enrol_unknown: "Diesen Link kennt der Signer nicht.",
	enrol_done: "Mit diesem Link wurde bereits ein Schlüssel eingerichtet.",
	enrol_expired:
		"Der Link ist abgelaufen. Lass am Terminal einen neuen erzeugen.",
	key_exists: "Dieser Schlüssel ist bereits registriert.",
	webauthn:
		"Der Signer hat den Schlüssel abgelehnt (nur gerätegebundene Sicherheitsschlüssel mit PIN).",
	unreachable: "Der Signer ist gerade nicht erreichbar.",
	rate_limited: "Zu viele Versuche. Warte einen Moment.",
};
const message = (code) => MESSAGES[code] ?? "Das hat nicht geklappt.";

function fail(text) {
	$("lead").textContent = text;
	$("actions").replaceChildren();
}

async function enrol(p, info, button) {
	button.disabled = true;
	$("status").textContent =
		"Stecke den neuen Sicherheitsschlüssel ein und lege bzw. gib die PIN ein …";
	try {
		const cred = await navigator.credentials.create({
			publicKey: {
				rp: { id: location.hostname, name: "Klick Freigabe" },
				user: {
					id: new TextEncoder().encode(p.person),
					name: `klick-${p.person.slice(0, 8)}`,
					displayName: "Klick Freigabe",
				},
				challenge: await enrolChallenge(p.secret, p.enrolId),
				pubKeyCredParams: [{ type: "public-key", alg: -7 }],
				authenticatorSelection: {
					authenticatorAttachment: "cross-platform",
					residentKey: "discouraged",
					requireResidentKey: false,
					userVerification: "required",
				},
				attestation: "none",
				excludeCredentials: (info.exclude ?? []).map((c) => ({
					type: "public-key",
					id: b64u.decode(c),
				})),
				timeout: 180000,
				hints: ["security-key"],
			},
		});
		if (!cred) throw new Error("abgebrochen");
		const spki = cred.response.getPublicKey?.();
		const authData = cred.response.getAuthenticatorData?.();
		if (!spki || !authData) {
			$("status").textContent =
				"Dieser Browser oder Schlüssel liefert keinen P-256-Schlüssel (ES256).";
			button.disabled = false;
			return;
		}
		const credId = b64u.encode(cred.rawId);
		const clientDataJSON = new Uint8Array(cred.response.clientDataJSON);
		const mac = await enrolMac(p.secret, {
			enrolId: p.enrolId,
			credId,
			clientDataJSON,
			authenticatorData: new Uint8Array(authData),
			spki: new Uint8Array(spki),
		});
		const res = await fetch(
			`${apiBase()}/api/wallet/einrichtung/${p.enrolId}`,
			{
				method: "POST",
				credentials: "omit",
				cache: "no-store",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					credId,
					spki: b64u.encode(spki),
					authenticatorData: b64u.encode(authData),
					clientDataJSON: b64u.encode(clientDataJSON),
					mac: b64u.encode(mac),
				}),
			},
		);
		const out = await res.json().catch(() => ({}));
		if (!res.ok || !out.ok) {
			$("status").textContent = message(
				out.error?.code ??
					(res.status === 429 ? "rate_limited" : "unreachable"),
			);
			button.disabled = false;
			return;
		}
		const n = out.result?.activeKeys ?? 1;
		$("status").textContent =
			n >= 2
				? `Eingerichtet. Diese Person hat jetzt ${n} aktive Schlüssel.`
				: "Eingerichtet. Für Auszahlungen allein fehlt noch ein zweiter Schlüssel (eigener Link).";
		button.remove();
	} catch {
		$("status").textContent =
			"Nicht eingerichtet. Der Schlüssel wurde nicht benutzt oder abgebrochen.";
		button.disabled = false;
	}
}

async function main() {
	const f = takeFragment();
	const p = {
		enrolId: f.get("e") ?? "",
		secret: f.get("t") ?? "",
		person: f.get("p") ?? "",
	};
	if (
		!/^[0-9a-f]{32}$/.test(p.enrolId) ||
		!/^[0-9a-f]{64}$/.test(p.secret) ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
			p.person,
		)
	)
		return fail("Der Link ist unvollständig.");
	let info;
	try {
		const res = await fetch(
			`${apiBase()}/api/wallet/einrichtung/${p.enrolId}`,
			{
				credentials: "omit",
				cache: "no-store",
			},
		);
		const out = await res.json();
		if (!res.ok || !out.ok)
			return fail(message(out.error?.code ?? "unreachable"));
		info = out.result;
	} catch {
		return fail(message("unreachable"));
	}
	if (info.person !== p.person)
		return fail("Der Link passt nicht zur Person. Nicht verwenden.");
	if (info.done) return fail(message("enrol_done"));
	if (Date.now() / 1000 > info.expiresAt) return fail(message("enrol_expired"));
	$("lead").textContent = "Für die Person mit dieser Kennung:";
	const dl = $("facts");
	dl.append(el("dt", "Kennung"), el("dd", p.person, "mono"));
	dl.append(el("dt", "Link gültig bis"), el("dd", fmtTime(info.expiresAt)));
	const button = el("button", "Sicherheitsschlüssel einrichten", "primary");
	button.type = "button";
	button.addEventListener("click", () => enrol(p, info, button));
	$("actions").append(button);
}

// anderer Link im selben Tab (nur das Fragment ändert sich): neu laden,
// statt den alten Stand weiter zu zeigen
window.addEventListener("hashchange", () => location.reload());

main();
