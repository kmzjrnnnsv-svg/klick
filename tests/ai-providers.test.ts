import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type AiTransport,
	aiTargetAllowed,
	httpsTransport,
} from "@/lib/ai/http";
import {
	type AiCall,
	type AiConfig,
	buildRequest,
	complete,
	parseResponse,
} from "@/lib/ai/providers";

// KI-Anbieter ohne SDK (ADR-032): Anfrage je Anbieter, Antwort lesen,
// erlaubte Ziele und der echte HTTPS-Weg gegen einen nachgebauten Server
// (eigenes Zertifikat für api.anthropic.com, an 127.0.0.1 angeheftet).
// Gegen echte Anbieter läuft hier nichts.

const KEY = "sk-test-0123456789";
const call: AiCall = {
	system: "Du vergleichst Fassungen.",
	messages: [{ role: "user", content: "Was ist neu?" }],
	maxTokens: 500,
};
const cfg = (p: Partial<AiConfig>): AiConfig => ({
	provider: "anthropic",
	model: "claude-sonnet-5-5",
	endpoint: null,
	deployment: null,
	key: KEY,
	...p,
});

describe("Anfrage je Anbieter", () => {
	it("Anthropic: Messages API, Schlüssel nur in der Kopfzeile", () => {
		const r = buildRequest(cfg({}), {
			...call,
			files: [{ name: "a.pdf", mime: "application/pdf", base64: "QUJD" }],
		});
		expect(r?.url).toBe("https://api.anthropic.com/v1/messages");
		expect(r?.headers).toEqual({
			"x-api-key": KEY,
			"anthropic-version": "2023-06-01",
		});
		expect(JSON.stringify(r?.body)).not.toContain(KEY);
		expect(r?.body).toMatchObject({
			model: "claude-sonnet-5-5",
			max_tokens: 500,
			system: "Du vergleichst Fassungen.",
			messages: [
				{
					role: "user",
					content: [
						{ type: "document", source: { media_type: "application/pdf" } },
						{ type: "text", text: "Was ist neu?" },
					],
				},
			],
		});
	});

	it("Gemini: Schlüssel in der Kopfzeile, nie in der Adresse", () => {
		const r = buildRequest(
			cfg({ provider: "gemini", model: "gemini-2.5-pro" }),
			call,
		);
		expect(r?.url).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
		);
		expect(r?.url).not.toContain(KEY);
		expect(r?.headers).toEqual({ "x-goog-api-key": KEY });
	});

	it("OpenAI, Mistral, Azure, kompatibel", () => {
		expect(
			buildRequest(cfg({ provider: "openai", model: "gpt-5" }), call)?.url,
		).toBe("https://api.openai.com/v1/chat/completions");
		expect(
			buildRequest(cfg({ provider: "mistral", model: "mistral-large" }), call)
				?.headers,
		).toEqual({ authorization: `Bearer ${KEY}` });
		const az = buildRequest(
			cfg({
				provider: "azure_openai",
				model: "-",
				endpoint: "firma.openai.azure.com",
				deployment: "gpt-chat",
			}),
			call,
		);
		expect(az?.url).toBe(
			"https://firma.openai.azure.com/openai/deployments/gpt-chat/chat/completions?api-version=2024-10-21",
		);
		expect(az?.headers).toEqual({ "api-key": KEY });
		expect(
			buildRequest(
				cfg({
					provider: "openai_compatible",
					model: "llama-3.3",
					endpoint: "https://ai.example.eu/v1/",
				}),
				call,
			)?.url,
		).toBe("https://ai.example.eu/v1/chat/completions");
	});

	it("Modellname mit Pfadzeichen wird abgelehnt", () => {
		expect(buildRequest(cfg({ model: "../x" }), call)).toBeNull();
		expect(
			buildRequest(
				cfg({ provider: "gemini", model: "a/b:generateContent?x=" }),
				call,
			),
		).toBeNull();
	});
});

describe("Antwort lesen", () => {
	it("Text und Tokens je Anbieter", () => {
		expect(
			parseResponse("anthropic", {
				status: 200,
				body: JSON.stringify({
					content: [{ type: "text", text: " Neu ist Abschnitt 2. " }],
					usage: { input_tokens: 10, output_tokens: 5 },
				}),
			}),
		).toEqual({
			ok: true,
			text: "Neu ist Abschnitt 2.",
			usage: { input: 10, output: 5 },
		});
		expect(
			parseResponse("gemini", {
				status: 200,
				body: JSON.stringify({
					candidates: [{ content: { parts: [{ text: "Ja" }] } }],
					usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
				}),
			}),
		).toMatchObject({ ok: true, text: "Ja", usage: { input: 3, output: 1 } });
		expect(
			parseResponse("openai", {
				status: 200,
				body: JSON.stringify({
					choices: [{ message: { content: "Gut" } }],
					usage: { prompt_tokens: 2, completion_tokens: 1 },
				}),
			}),
		).toMatchObject({ ok: true, text: "Gut" });
	});

	it("Fehler als Code, ohne Inhalt der Antwort", () => {
		const e = (status: number) =>
			parseResponse("openai", { status, body: `{"error":"${KEY}"}` });
		expect(e(401)).toEqual({ ok: false, error: "auth", status: 401 });
		expect(e(429)).toEqual({ ok: false, error: "rate_limited", status: 429 });
		expect(e(400)).toEqual({ ok: false, error: "bad_request", status: 400 });
		expect(e(503)).toEqual({ ok: false, error: "provider_error", status: 503 });
		expect(parseResponse("openai", { status: 200, body: "kein json" })).toEqual(
			{ ok: false, error: "invalid_response" },
		);
		expect(
			parseResponse("openai", {
				status: 200,
				body: JSON.stringify({ choices: [{ message: { content: " " } }] }),
			}),
		).toEqual({ ok: false, error: "empty" });
	});
});

describe("Erlaubte Ziele", () => {
	it("feste Hosts, Azure-Domains, eigene Adresse nur https/443 öffentlich", () => {
		const ok = (p: Parameters<typeof aiTargetAllowed>[0], u: string) =>
			aiTargetAllowed(p, u).ok;
		expect(ok("anthropic", "https://api.anthropic.com/v1/messages")).toBe(true);
		expect(ok("anthropic", "https://api.anthropic.com.evil.io/v1")).toBe(false);
		expect(ok("openai", "http://api.openai.com/v1/chat/completions")).toBe(
			false,
		);
		expect(ok("azure_openai", "https://firma.openai.azure.com/x")).toBe(true);
		expect(ok("azure_openai", "https://firma.openai.azure.com.evil.io/x")).toBe(
			false,
		);
		expect(ok("openai_compatible", "https://ai.example.eu/v1/chat")).toBe(true);
		expect(ok("openai_compatible", "https://ai.example.eu:8443/v1")).toBe(
			false,
		);
		expect(ok("openai_compatible", "https://user:pw@ai.example.eu/v1")).toBe(
			false,
		);
		expect(ok("openai_compatible", "https://10.0.0.5/v1")).toBe(false);
		expect(ok("openai_compatible", "https://localhost/v1")).toBe(false);
	});

	it("eigene Adresse, die auf ein internes Netz zeigt, wird nicht angefragt", async () => {
		const t = httpsTransport({
			resolve: async () => [{ address: "192.168.1.10", family: 4 }],
		});
		const r = await t("openai_compatible", {
			url: "https://ai.example.eu/v1/chat/completions",
			headers: {},
			body: {},
		});
		expect(r).toEqual({ ok: false, error: "blocked_address" });
	});
});

describe("HTTPS gegen einen nachgebauten Anbieter", () => {
	let dir = "";
	let cert = "";
	let other = "";
	let server: Server;
	let wrong: Server;
	let port = 0;
	let wrongPort = 0;
	let mode: "ok" | "big" | "slow" | "redirect" = "ok";
	let seen: { path?: string; key?: string; body?: string } = {};

	const makeCert = (name: string, file: string) => {
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-subj",
				`/CN=${name}`,
				"-addext",
				`subjectAltName=DNS:${name}`,
				"-days",
				"2",
				"-keyout",
				join(dir, `${file}.key`),
				"-out",
				join(dir, `${file}.pem`),
			],
			{ stdio: "ignore" },
		);
		return {
			key: readFileSync(join(dir, `${file}.key`), "utf8"),
			cert: readFileSync(join(dir, `${file}.pem`), "utf8"),
		};
	};

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), "klick-ai-"));
		const good = makeCert("api.anthropic.com", "good");
		const bad = makeCert("falsch.example", "bad");
		cert = good.cert;
		other = bad.cert;
		server = createServer({ key: good.key, cert: good.cert }, (req, res) => {
			let body = "";
			req.on("data", (c) => {
				body += c;
			});
			req.on("end", () => {
				seen = { path: req.url, key: String(req.headers["x-api-key"]), body };
				if (mode === "big") {
					res.writeHead(200, { "content-type": "application/json" });
					res.end(`{"x":"${"a".repeat(3 * 1024 * 1024)}"}`);
				} else if (mode === "slow") {
					setTimeout(() => res.end("{}"), 2_000);
				} else if (mode === "redirect") {
					res.writeHead(302, { location: "https://evil.example/" });
					res.end();
				} else {
					res.writeHead(200, { "content-type": "application/json" });
					res.end(
						JSON.stringify({
							content: [{ type: "text", text: "Antwort" }],
							usage: { input_tokens: 1, output_tokens: 1 },
						}),
					);
				}
			});
		});
		wrong = createServer({ key: bad.key, cert: bad.cert }, (_q, r) =>
			r.end("{}"),
		);
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		await new Promise<void>((r) => wrong.listen(0, "127.0.0.1", r));
		port = (server.address() as AddressInfo).port;
		wrongPort = (wrong.address() as AddressInfo).port;
	});

	afterAll(() => {
		server?.close();
		wrong?.close();
		rmSync(dir, { recursive: true, force: true });
	});

	const transport = (o: { timeoutMs?: number; maxBytes?: number } = {}) =>
		httpsTransport({
			ca: cert,
			pinForTests: { address: "127.0.0.1", family: 4, port },
			...o,
		});

	it("sendet, liest, Schlüssel nur in der Kopfzeile", async () => {
		mode = "ok";
		const r = await complete(cfg({}), call, transport());
		expect(r).toEqual({
			ok: true,
			text: "Antwort",
			usage: { input: 1, output: 1 },
		});
		expect(seen.path).toBe("/v1/messages");
		expect(seen.key).toBe(KEY);
		expect(seen.body).not.toContain(KEY);
	});

	it("Weiterleitung wird nicht verfolgt", async () => {
		mode = "redirect";
		const r = await complete(cfg({}), call, transport());
		expect(r).toEqual({ ok: false, error: "provider_error", status: 302 });
	});

	it("zu große Antwort und Zeitüberschreitung", async () => {
		mode = "big";
		expect(await complete(cfg({}), call, transport())).toEqual({
			ok: false,
			error: "too_large",
		});
		mode = "slow";
		expect(
			await complete(cfg({}), call, transport({ timeoutMs: 300 })),
		).toEqual({
			ok: false,
			error: "timeout",
		});
	});

	it("falsches Zertifikat: kein Kontakt", async () => {
		const t: AiTransport = httpsTransport({
			ca: other,
			pinForTests: { address: "127.0.0.1", family: 4, port: wrongPort },
		});
		expect(await complete(cfg({}), call, t)).toEqual({
			ok: false,
			error: "network",
		});
	});
});
