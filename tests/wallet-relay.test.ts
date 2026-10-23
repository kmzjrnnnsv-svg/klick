import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addressBookStatus, effectiveStatus } from "@/lib/wallet/address-book";
import { pickFields, relayRoute } from "@/lib/wallet/confirm-relay";
import { startSignerServer } from "@/signer/server";
import { Signer } from "@/signer/service";
import { SoftSecurityKey } from "./helpers/security-key";

// Relay Bestätigungsseite → Signer: nur CONFIRM_ORIGIN, nur bekannte Felder,
// Grenzen, Fehler des Signers als Code — und eine echte Freigabe mit einem
// Software-Schlüssel über das Relay.

const ORIGIN = "http://localhost:3201";
const ORG = randomUUID();
const ALICE = randomUUID();
const DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

let dir: string;
let signer: Signer;
let server: Awaited<ReturnType<typeof startSignerServer>>;
const confirm = relayRoute("bestaetigung");
const enrol = relayRoute("einrichtung");
const key = new SoftSecurityKey();

const req = (
	url: string,
	init: {
		method?: string;
		origin?: string | null;
		body?: string;
		type?: string;
	} = {},
) =>
	new Request(`http://localhost:3200${url}`, {
		method: init.method ?? "GET",
		headers: {
			...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
			...(init.body ? { "content-type": init.type ?? "application/json" } : {}),
			"x-real-ip": "203.0.113.7",
		},
		body: init.body,
	});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "klick-relay-"));
	signer = Signer.open({ dir, kek: randomBytes(32), dev: true });
	server = await startSignerServer(signer, {
		app: { path: join(dir, "app.sock"), mode: 0o660 },
		admin: { path: join(dir, "admin.sock"), mode: 0o600 },
		log: () => {},
	});
	const prep = signer.seedPrepare({ networks: ["bitcoin_signet"] });
	const w = (prep.words.bitcoin_signet as string).split(" ");
	signer.initCommit({
		token: prep.token,
		checks: { bitcoin_signet: { 1: w[0], 2: w[1], 3: w[2] } },
		orgId: ORG,
		rpId: "localhost",
		origin: ORIGIN,
	});
	process.env.SIGNER_SOCKET = join(dir, "app.sock");
	process.env.CONFIRM_ORIGIN = ORIGIN;
});

afterAll(async () => {
	delete process.env.SIGNER_SOCKET;
	delete process.env.CONFIRM_ORIGIN;
	await server.close();
	signer.close();
});

describe("Relay", () => {
	it("nur von der Bestätigungsseite (CORS), Preflight ohne Cookies", async () => {
		const id = "ab".repeat(16);
		expect(
			(
				await confirm.GET(
					req(`/x/${id}`, { origin: "https://evil.example" }),
					params(id),
				)
			).status,
		).toBe(403);
		expect(
			(await confirm.GET(req(`/x/${id}`, { origin: null }), params(id))).status,
		).toBe(403);
		const pre = await confirm.OPTIONS(req(`/x/${id}`, { method: "OPTIONS" }));
		expect(pre.status).toBe(204);
		expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
		expect(pre.headers.get("access-control-allow-credentials")).toBeNull();
		expect(
			(
				await confirm.OPTIONS(
					req(`/x/${id}`, {
						method: "OPTIONS",
						origin: "https://evil.example",
					}),
				)
			).status,
		).toBe(403);
	});

	it("unbekannte ID und Fehler des Signers als Code", async () => {
		const bad = await confirm.GET(req("/x/zz"), params("zz"));
		expect(bad.status).toBe(404);
		const id = "cd".repeat(16);
		const r = await confirm.GET(req(`/x/${id}`), params(id));
		expect(r.status).toBe(422);
		expect(await r.json()).toEqual({
			ok: false,
			error: { code: "intent_unknown" },
		});
	});

	it("Einrichtung und Freigabe über das Relay", async () => {
		const e = signer.enrolStart({ person: ALICE });
		const info = await enrol.GET(req(`/x/${e.enrolId}`), params(e.enrolId));
		expect((await info.json()).result).toMatchObject({
			person: ALICE,
			done: false,
		});
		const secret = new URL(e.url).hash.match(/t=([0-9a-f]{64})/)?.[1] as string;
		const data = key.enrol({
			rpId: "localhost",
			origin: ORIGIN,
			enrolId: e.enrolId,
			secret,
		});
		const done = await enrol.POST(
			req(`/x/${e.enrolId}`, {
				method: "POST",
				// fremde Felder fallen weg
				body: JSON.stringify({ ...data, person: randomUUID(), extra: "x" }),
			}),
			params(e.enrolId),
		);
		expect(done.status).toBe(200);
		expect((await done.json()).result).toMatchObject({
			person: ALICE,
			activeKeys: 1,
		});

		const w = signer.intentCreate({
			kind: "whitelist",
			network: "bitcoin_signet",
			destination: DEST,
			initiator: ALICE,
		});
		const view = await confirm.GET(req(`/x/${w.intentId}`), params(w.intentId));
		const v = (await view.json()).result;
		expect(v.text).toBe(w.text);
		const ok = await confirm.POST(
			req(`/x/${w.intentId}`, {
				method: "POST",
				body: JSON.stringify(
					key.assert({
						rpId: "localhost",
						origin: ORIGIN,
						challenge: Buffer.from(v.challenge, "base64url"),
					}),
				),
			}),
			params(w.intentId),
		);
		expect(ok.status).toBe(200);
		expect((await ok.json()).result.approvedAt).not.toBeNull();
		// Wiederholung derselben Bestätigung: abgelehnt vom Signer
		const again = await confirm.POST(
			req(`/x/${w.intentId}`, {
				method: "POST",
				body: JSON.stringify(
					key.assert({
						rpId: "localhost",
						origin: ORIGIN,
						challenge: Buffer.from(v.challenge, "base64url"),
					}),
				),
			}),
			params(w.intentId),
		);
		expect(again.status).toBe(422);
		expect((await again.json()).error.code).toBe("already_approved");
	});

	it("Grenzen: Inhaltstyp, Größe, JSON, Felder", async () => {
		const id = "ef".repeat(16);
		expect(
			(
				await confirm.POST(
					req(`/x/${id}`, { method: "POST", body: "{}", type: "text/plain" }),
					params(id),
				)
			).status,
		).toBe(415);
		expect(
			(
				await confirm.POST(
					req(`/x/${id}`, { method: "POST", body: "x".repeat(17_000) }),
					params(id),
				)
			).status,
		).toBe(413);
		expect(
			(
				await confirm.POST(
					req(`/x/${id}`, { method: "POST", body: "{kaputt" }),
					params(id),
				)
			).status,
		).toBe(400);
		expect(pickFields("bestaetigung", { credId: "a" })).toBeNull();
		expect(
			pickFields("bestaetigung", {
				credId: "a",
				authenticatorData: "b",
				clientDataJSON: "c",
				signature: "d e",
			}),
		).toBeNull();
	});

	it("Signer nicht erreichbar: 503", async () => {
		process.env.SIGNER_SOCKET = join(dir, "fehlt.sock");
		const id = "12".repeat(16);
		expect((await confirm.GET(req(`/x/${id}`), params(id))).status).toBe(503);
		process.env.SIGNER_SOCKET = join(dir, "app.sock");
	});
});

describe("Adressbuch-Stand aus dem Signer", () => {
	const base = {
		vetoed: false,
		cancelled: false,
		approvedAt: null,
		activeFrom: null,
		expiresAt: 2000,
	};
	it("vorgeschlagen, Wartezeit, aktiv, Veto, abgelaufen", () => {
		expect(addressBookStatus(base, 1000)).toBe("proposed");
		expect(addressBookStatus(base, 2001)).toBe("expired");
		expect(
			addressBookStatus({ ...base, approvedAt: 1500, activeFrom: 3000 }, 2500),
		).toBe("cooling");
		expect(
			addressBookStatus({ ...base, approvedAt: 1500, activeFrom: 3000 }, 3000),
		).toBe("active");
		expect(
			addressBookStatus(
				{ ...base, approvedAt: 1500, activeFrom: 3000, vetoed: true },
				4000,
			),
		).toBe("vetoed");
		const past = new Date(Date.now() - 1000);
		expect(
			effectiveStatus({ status: "cooling", activeFrom: past }, new Date()),
		).toBe("active");
	});
});
