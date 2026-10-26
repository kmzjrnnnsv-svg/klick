// both.money · Bestätigungsseite: eine Absicht (Auszahlung oder Zieladresse)
// oder eine Vollmacht mit dem Sicherheitsschlüssel bestätigen.
// Links: /#i=<intentId> bzw. /#m=<mandateId>
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
	parseMandate,
	sha256Hex,
	takeFragment,
} from "./canonical.js";

const $ = (id) => document.getElementById(id);

const MESSAGES = {
	frozen: "Der Signer ist eingefroren. Er nimmt keine Freigaben an.",
	intent_expired: "Diese Absicht ist abgelaufen.",
	intent_closed: "Diese Absicht wurde abgebrochen oder per Veto gestoppt.",
	intent_unknown: "Diese Absicht kennt der Signer nicht.",
	mandate_expired: "Diese Vollmacht ist abgelaufen oder nicht mehr freigebbar.",
	mandate_revoked: "Diese Vollmacht wurde widerrufen.",
	mandate_unknown: "Diese Vollmacht kennt der Signer nicht.",
	mandate_self:
		"Die bevollmächtigte Person kann ihre eigene Vollmacht nicht freigeben.",
	already_approved: "Dieser Schlüssel hat bereits bestätigt.",
	key_unknown: "Dieser Schlüssel ist im Signer nicht (mehr) registriert.",
	webauthn: "Der Signer hat die Bestätigung abgelehnt.",
	not_initialized: "Der Signer ist noch nicht eingerichtet.",
	unreachable:
		"Der Signer ist gerade nicht erreichbar. Versuch es gleich noch einmal.",
	rate_limited: "Zu viele Versuche. Warte einen Moment.",
};
const message = (code) => MESSAGES[code] ?? "Das hat nicht geklappt.";

// je Art: Pfad des Relays, Format der Kennung, Leser des Textes
const KINDS = {
	i: {
		path: "/api/confirm/",
		id: /^[0-9a-f]{32}$/,
		parse: parseIntent,
		idOf: (x) => x.intentId,
		noun: "Absicht",
	},
	m: {
		path: "/api/mandate/",
		id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		parse: parseMandate,
		idOf: (x) => x.mandateId,
		noun: "Vollmacht",
	},
};

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

function addresses(list) {
	const ul = el("ul", null, "addresses");
	for (const d of list) {
		const li = el("li");
		li.append(address(d));
		ul.append(li);
	}
	return ul;
}

function renderIntent(dl, intent) {
	const net = NETWORKS[intent.network];
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
			"Nach der Wartezeit dürfen Auszahlungen an diese Adresse gehen. Bis dahin kann jede:r in both.money ein Veto einlegen.";
		fact(dl, "Netz", net.label, net.live ? "live" : "");
		fact(dl, "Adresse", address(intent.destination));
	}
	fact(dl, "Angelegt von (Kennung)", intent.initiator, "mono");
	fact(dl, "Gültig bis", fmtTime(intent.expiresAt));
}

function renderMandate(dl, m) {
	const net = NETWORKS[m.network];
	const asset = ASSETS[m.network][m.asset];
	const per = `${formatUnits(m.perPayout, asset.decimals)} ${m.asset}`;
	const total = `${formatUnits(m.total, asset.decimals)} ${m.asset}`;
	$("title").textContent = "Vollmacht freigeben";
	const where =
		m.destinations.length === 1 ? "die Adresse unten" : "die Adressen unten";
	$("lead").textContent =
		`Die Person unten darf bis ${fmtTime(m.validUntil)} insgesamt ${total} an ${where} auszahlen, ohne weitere Bestätigung mit dem Schlüssel. Pause und Grenzen des Signers gelten weiter.`;
	fact(dl, "Bevollmächtigt (Kennung)", m.grantee, "mono");
	fact(dl, "Je Auszahlung höchstens", per, "amount");
	fact(dl, "Insgesamt höchstens", total, "amount");
	fact(dl, "Netz", net.label, net.live ? "live" : "");
	fact(
		dl,
		m.destinations.length === 1 ? "Zieladresse" : "Zieladressen",
		addresses(m.destinations),
	);
	if (asset.contract) fact(dl, "Token-Vertrag", address(asset.contract));
	fact(dl, "Gültig ab", fmtTime(m.validFrom));
	fact(dl, "Gültig bis", fmtTime(m.validUntil));
	fact(dl, "Ausgestellt von (Kennung)", m.issuer, "mono");
}

async function render(kind, parsed, data) {
	const dl = $("facts");
	dl.replaceChildren();
	if (kind === "m") renderMandate(dl, parsed);
	else renderIntent(dl, parsed);
	const sum = await sha256Hex(new TextEncoder().encode(data.text));
	fact(dl, "Prüfsumme", sum.slice(0, 16).match(/.{4}/g).join(" "), "mono");
	fact(dl, "Bisher bestätigt", String(data.approvals?.length ?? 0));
	$("rawtext").textContent = data.text;
	$("raw").hidden = false;
}

function state(kind, parsed, data) {
	const now = Date.now() / 1000;
	if (data.frozen) return message("frozen");
	if (kind === "m") {
		if (data.revoked) return message("mandate_revoked");
		if (data.active)
			return `Freigabe vollständig. Die Vollmacht gilt bis ${fmtTime(parsed.validUntil)}.`;
		if (now > data.expiresAt) return message("mandate_expired");
		return null;
	}
	if (data.cancelled || data.vetoed) return message("intent_closed");
	if (data.signed) return "Diese Auszahlung ist bereits signiert.";
	if (data.approvedAt)
		return parsed.kind === "payout"
			? `Freigabe vollständig. Signiert wird frühestens ${fmtTime(data.signableAt)}.`
			: `Freigabe vollständig. Aktiv ab ${fmtTime(data.activeFrom)}.`;
	if (now > parsed.expiresAt) return message("intent_expired");
	return null;
}

async function confirm(kind, id, parsed, data, button) {
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
		const res = await fetch(`${apiBase()}${KINDS[kind].path}${id}`, {
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
		const view = { ...data, ...(out.result ?? {}) };
		const done = kind === "m" ? view.active : view.approvedAt;
		$("status").textContent = done
			? (state(kind, parsed, view) ?? "Bestätigt.")
			: "Bestätigt. Es fehlt noch eine Freigabe einer zweiten Person.";
		button.remove();
	} catch {
		$("status").textContent =
			"Keine Bestätigung. Der Schlüssel wurde nicht benutzt oder abgebrochen.";
		button.disabled = false;
	}
}

async function main() {
	const params = takeFragment();
	const kind = params.has("m") ? "m" : "i";
	const k = KINDS[kind];
	const id = params.get(kind) ?? "";
	if (!k.id.test(id)) return fail("Der Link ist unvollständig.");
	let data;
	try {
		const res = await fetch(`${apiBase()}${k.path}${id}`, {
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
	let parsed;
	try {
		parsed = k.parse(data.text);
	} catch {
		return fail(`Der Text der ${k.noun} ist ungültig. Nicht bestätigen.`);
	}
	if (k.idOf(parsed) !== id)
		return fail(`Die ${k.noun} passt nicht zum Link. Nicht bestätigen.`);
	await render(kind, parsed, data);
	const blocked = state(kind, parsed, data);
	if (blocked) {
		$("banner").textContent = blocked;
		$("banner").hidden = false;
		return;
	}
	const button = el("button", "Mit Sicherheitsschlüssel bestätigen", "primary");
	button.type = "button";
	button.addEventListener("click", () =>
		confirm(kind, id, parsed, data, button),
	);
	$("actions").append(button);
}

// anderer Link im selben Tab (nur das Fragment ändert sich): neu laden,
// statt den alten Stand weiter zu zeigen
window.addEventListener("hashchange", () => location.reload());

main();
