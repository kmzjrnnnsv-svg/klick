// Klick · Bestätigungsseite: eine Absicht (Auszahlung oder Zieladresse) mit
// dem Sicherheitsschlüssel bestätigen. Link: /#i=<intentId>
import {
	ASSETS,
	apiBase,
	b64u,
	challengeOf,
	chunks,
	el,
	fmtTime,
	formatUnits,
	NETWORKS,
	parseIntent,
	sha256Hex,
	takeFragment,
} from "./canonical.js";

const $ = (id) => document.getElementById(id);

const MESSAGES = {
	frozen: "Der Signer ist eingefroren. Er nimmt keine Freigaben an.",
	intent_expired: "Diese Absicht ist abgelaufen.",
	intent_closed: "Diese Absicht wurde abgebrochen oder per Veto gestoppt.",
	intent_unknown: "Diese Absicht kennt der Signer nicht.",
	already_approved: "Dieser Schlüssel hat bereits bestätigt.",
	key_unknown: "Dieser Schlüssel ist im Signer nicht (mehr) registriert.",
	webauthn: "Der Signer hat die Bestätigung abgelehnt.",
	not_initialized: "Der Signer ist noch nicht eingerichtet.",
	unreachable:
		"Der Signer ist gerade nicht erreichbar. Versuch es gleich noch einmal.",
	rate_limited: "Zu viele Versuche. Warte einen Moment.",
};
const message = (code) => MESSAGES[code] ?? "Das hat nicht geklappt.";

function fail(text) {
	$("title").textContent = "Nicht bestätigen";
	$("lead").textContent = text;
	$("facts").replaceChildren();
	$("actions").replaceChildren();
}

function fact(dl, term, value, cls) {
	dl.append(el("dt", term));
	const dd = el("dd", null, cls);
	if (value instanceof Node) dd.append(value);
	else dd.textContent = value;
	dl.append(dd);
}

function address(dest) {
	const code = el("code", null, "address");
	code.setAttribute("translate", "no");
	for (const part of chunks(dest)) code.append(el("span", part));
	return code;
}

async function render(intent, data) {
	const net = NETWORKS[intent.network];
	const dl = $("facts");
	dl.replaceChildren();
	const sum = await sha256Hex(new TextEncoder().encode(data.text));
	if (intent.kind === "payout") {
		const asset = ASSETS[intent.network][intent.asset];
		const amount = `${formatUnits(intent.amount, asset.decimals)} ${intent.asset}`;
		$("title").textContent = "Auszahlung bestätigen";
		$("lead").textContent = `${amount} an die Zieladresse unten.`;
		fact(dl, "Betrag", amount, "amount");
		fact(dl, "Netz", net.label, net.live ? "live" : "");
		fact(dl, "Zieladresse", address(intent.destination));
		fact(dl, "Ziel aktiv seit", fmtTime(intent.destinationActiveSince));
		fact(
			dl,
			"Gebühr höchstens",
			`${formatUnits(intent.feeCap, net.feeDecimals)} ${net.fee}`,
		);
		if (asset.contract) fact(dl, "Token-Vertrag", address(asset.contract));
		fact(dl, "Konto (Kennung)", intent.accountId, "mono");
	} else {
		$("title").textContent = "Zieladresse freigeben";
		$("lead").textContent =
			"Nach der Wartezeit dürfen Auszahlungen an diese Adresse gehen. Bis dahin kann jede:r in Klick ein Veto einlegen.";
		fact(dl, "Netz", net.label, net.live ? "live" : "");
		fact(dl, "Adresse", address(intent.destination));
	}
	fact(dl, "Angelegt von (Kennung)", intent.initiator, "mono");
	fact(dl, "Gültig bis", fmtTime(intent.expiresAt));
	fact(dl, "Prüfsumme", sum.slice(0, 16).match(/.{4}/g).join(" "), "mono");
	fact(dl, "Bisher bestätigt", String(data.approvals?.length ?? 0));
	$("rawtext").textContent = data.text;
	$("raw").hidden = false;
}

function state(intent, data) {
	const now = Date.now() / 1000;
	if (data.frozen) return message("frozen");
	if (data.cancelled || data.vetoed) return message("intent_closed");
	if (data.signed) return "Diese Auszahlung ist bereits signiert.";
	if (data.approvedAt)
		return intent.kind === "payout"
			? `Freigabe vollständig. Signiert wird frühestens ${fmtTime(data.signableAt)}.`
			: `Freigabe vollständig. Aktiv ab ${fmtTime(data.activeFrom)}.`;
	if (now > intent.expiresAt) return message("intent_expired");
	return null;
}

async function confirm(id, intent, data, button) {
	button.disabled = true;
	$("status").textContent =
		"Stecke deinen Sicherheitsschlüssel ein und gib die PIN ein …";
	try {
		const cred = await navigator.credentials.get({
			publicKey: {
				challenge: await challengeOf(data.text),
				rpId: location.hostname,
				allowCredentials: (data.allowCredentials ?? []).map((c) => ({
					type: "public-key",
					id: b64u.decode(c),
					transports: ["usb", "nfc", "ble"],
				})),
				userVerification: "required",
				timeout: 120000,
				hints: ["security-key"],
			},
		});
		if (!cred) throw new Error("abgebrochen");
		const res = await fetch(`${apiBase()}/api/wallet/bestaetigung/${id}`, {
			method: "POST",
			credentials: "omit",
			cache: "no-store",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				credId: b64u.encode(cred.rawId),
				authenticatorData: b64u.encode(cred.response.authenticatorData),
				clientDataJSON: b64u.encode(cred.response.clientDataJSON),
				signature: b64u.encode(cred.response.signature),
			}),
		});
		const out = await res.json().catch(() => ({}));
		if (!res.ok || !out.ok) {
			$("status").textContent = message(
				out.error?.code ??
					(res.status === 429 ? "rate_limited" : "unreachable"),
			);
			button.disabled = false;
			return;
		}
		const view = out.result ?? {};
		$("status").textContent = view.approvedAt
			? (state(intent, { ...data, ...view }) ?? "Bestätigt.")
			: "Bestätigt. Es fehlt noch eine Freigabe einer zweiten Person.";
		button.remove();
	} catch {
		$("status").textContent =
			"Keine Bestätigung. Der Schlüssel wurde nicht benutzt oder abgebrochen.";
		button.disabled = false;
	}
}

async function main() {
	const id = takeFragment().get("i") ?? "";
	if (!/^[0-9a-f]{32}$/.test(id)) return fail("Der Link ist unvollständig.");
	let data;
	try {
		const res = await fetch(`${apiBase()}/api/wallet/bestaetigung/${id}`, {
			credentials: "omit",
			cache: "no-store",
		});
		data = await res.json();
		if (!res.ok || !data.ok)
			return fail(message(data.error?.code ?? "unreachable"));
		data = data.result;
	} catch {
		return fail(message("unreachable"));
	}
	let intent;
	try {
		intent = parseIntent(data.text);
	} catch {
		return fail("Der Text der Absicht ist ungültig. Nicht bestätigen.");
	}
	if (intent.intentId !== id)
		return fail("Die Absicht passt nicht zum Link. Nicht bestätigen.");
	await render(intent, data);
	const blocked = state(intent, data);
	if (blocked) {
		$("banner").textContent = blocked;
		$("banner").hidden = false;
		return;
	}
	const button = el("button", "Mit Sicherheitsschlüssel bestätigen", "primary");
	button.type = "button";
	button.addEventListener("click", () => confirm(id, intent, data, button));
	$("actions").append(button);
}

// anderer Link im selben Tab (nur das Fragment ändert sich): neu laden,
// statt den alten Stand weiter zu zeigen
window.addEventListener("hashchange", () => location.reload());

main();
