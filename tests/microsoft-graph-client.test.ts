import { describe, expect, it } from "vitest";
import { entraCallbackValid } from "@/lib/identity/service";
import { nonceHash, openState, sealState } from "@/lib/microsoft/consent";
import {
	createMsGet,
	graphUrl,
	MAX_RETRY_WAIT_MS,
	retryAfterMs,
} from "@/lib/microsoft/graph-client";
import type { MsHttpRequest, MsTransport } from "@/lib/microsoft/http";
import { msUrlAllowed } from "@/lib/microsoft/http";

// Teil D: lesender Graph-Zugriff für die Identität. Nur graph.microsoft.com,
// Token je Tenant, bei 429 einmal warten (höchstens 60 s), Zweck im Siegel.

const config = {
	clientId: "11111111-1111-1111-1111-111111111111",
	credential: { kind: "secret" as const, secret: "geheim" },
};

function fakeTransport(
	answers: Record<
		string,
		{ status: number; body?: string; headers?: Record<string, string> }[]
	>,
) {
	const calls: MsHttpRequest[] = [];
	const transport: MsTransport = async (req) => {
		calls.push(req);
		const key = Object.keys(answers).find((k) => req.url.includes(k));
		const queue = key ? answers[key] : undefined;
		const next = queue?.shift();
		if (!next) return { ok: true, res: { status: 404, body: "{}" } };
		return {
			ok: true,
			res: {
				status: next.status,
				body: next.body ?? "{}",
				headers: next.headers,
			},
		};
	};
	return { transport, calls };
}

const tokenOk = {
	status: 200,
	body: JSON.stringify({ access_token: "tok", expires_in: 3600 }),
};

describe("Adressen", () => {
	it("nur graph.microsoft.com, auch für nextLink", () => {
		expect(graphUrl("/users")).toBe("https://graph.microsoft.com/v1.0/users");
		expect(
			graphUrl("https://graph.microsoft.com/v1.0/users?$skiptoken=x"),
		).toBe("https://graph.microsoft.com/v1.0/users?$skiptoken=x");
		expect(
			graphUrl("https://graph.microsoft.com.evil.example/v1.0"),
		).toBeNull();
		expect(graphUrl("https://login.microsoftonline.com/x")).toBeNull();
		expect(graphUrl("http://graph.microsoft.com/v1.0/users")).toBeNull();
		expect(graphUrl("https://u:p@graph.microsoft.com/v1.0")).toBeNull();
		expect(msUrlAllowed("https://graph.microsoft.com:444/")).toBeNull();
	});

	it("Retry-After in Sekunden, sonst 10 s", () => {
		expect(retryAfterMs("5")).toBe(5000);
		expect(retryAfterMs(undefined)).toBe(10_000);
		expect(retryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT")).toBe(10_000);
	});
});

describe("createMsGet", () => {
	it("holt das Token einmal und liest mit Bearer", async () => {
		const { transport, calls } = fakeTransport({
			"/oauth2/v2.0/token": [tokenOk],
			"/v1.0/users": [
				{ status: 200, body: '{"value":[]}' },
				{ status: 200, body: '{"value":[]}' },
			],
		});
		const get = createMsGet(config, transport);
		const a = await get("t1", "/users");
		const b = await get("t1", "/users");
		expect(a).toEqual({
			ok: true,
			value: { status: 200, body: '{"value":[]}' },
		});
		expect(b.ok).toBe(true);
		expect(calls.filter((c) => c.url.includes("/token"))).toHaveLength(1);
		expect(calls[1]?.headers.authorization).toBe("Bearer tok");
		expect(calls[1]?.method).toBe("GET");
	});

	it("wartet bei 429 einmal und versucht es erneut", async () => {
		const waits: number[] = [];
		const { transport } = fakeTransport({
			"/oauth2/v2.0/token": [tokenOk],
			"/v1.0/users": [
				{ status: 429, headers: { "retry-after": "3" } },
				{ status: 200, body: "{}" },
			],
		});
		const get = createMsGet(config, transport, {
			sleep: async (ms) => {
				waits.push(ms);
			},
		});
		expect((await get("t1", "/users")).ok).toBe(true);
		expect(waits).toEqual([3000]);
	});

	it("zweites 429 oder zu lange Wartezeit: throttled", async () => {
		const waits: number[] = [];
		const sleep = async (ms: number) => {
			waits.push(ms);
		};
		const twice = fakeTransport({
			"/oauth2/v2.0/token": [tokenOk],
			"/v1.0/users": [{ status: 429 }, { status: 429 }],
		});
		expect(
			await createMsGet(config, twice.transport, { sleep })("t1", "/users"),
		).toEqual({
			ok: false,
			error: "throttled",
		});
		const long = fakeTransport({
			"/oauth2/v2.0/token": [tokenOk],
			"/v1.0/users": [
				{
					status: 429,
					headers: { "retry-after": String(MAX_RETRY_WAIT_MS / 1000 + 1) },
				},
			],
		});
		expect(
			await createMsGet(config, long.transport, { sleep })("t1", "/users"),
		).toEqual({ ok: false, error: "throttled" });
		expect(waits).toEqual([10_000]);
	});

	it("fehlende Freigabe im Tenant: consent_missing; fremde Adresse: kein Aufruf", async () => {
		const { transport, calls } = fakeTransport({
			"/oauth2/v2.0/token": [{ status: 400, body: "AADSTS7000229: …" }],
		});
		const get = createMsGet(config, transport);
		expect(await get("t1", "/users")).toEqual({
			ok: false,
			error: "consent_missing",
		});
		expect(await get("t1", "https://evil.example/v1.0/users")).toEqual({
			ok: false,
			error: "host_not_allowed",
		});
		expect(calls).toHaveLength(1);
	});

	it("403 und andere Codes gehen an den Aufrufer", async () => {
		const { transport } = fakeTransport({
			"/oauth2/v2.0/token": [tokenOk],
			"/v1.0/reports": [{ status: 403, body: '{"error":{}}' }],
		});
		const r = await createMsGet(config, transport)("t1", "/reports/x");
		expect(r).toEqual({
			ok: true,
			value: { status: 403, body: '{"error":{}}' },
		});
	});
});

describe("Freigabe der Identität", () => {
	const secret = "s".repeat(40);
	const org = "22222222-2222-2222-2222-222222222222";

	it("Siegel gilt nur für seinen Zweck", () => {
		const state = sealState("identity-consent", org, "n1", 2_000, secret);
		expect(openState("identity-consent", state, secret, 1_000)).toEqual({
			orgId: org,
			nonce: "n1",
		});
		expect(openState("teams-consent", state, secret, 1_000)).toBeNull();
		expect(openState("identity-consent", state, secret, 3_000)).toBeNull();
	});

	it("Rückruf: Einmalwert, Ablauf und Tenant", () => {
		const now = new Date("2026-11-04T10:00:00Z");
		const later = new Date("2026-11-04T11:00:00Z");
		const tid = "33333333-3333-3333-3333-333333333333";
		const byDomain = {
			consentNonceHash: nonceHash("n1"),
			consentExpiresAt: later,
			tenantKey: "contoso.com",
		};
		expect(
			entraCallbackValid(byDomain, { nonce: "n1", tenantId: tid, now }),
		).toBe(true);
		expect(
			entraCallbackValid(byDomain, { nonce: "n2", tenantId: tid, now }),
		).toBe(false);
		expect(
			entraCallbackValid(byDomain, { nonce: "n1", tenantId: "kein-guid", now }),
		).toBe(false);
		expect(
			entraCallbackValid(byDomain, {
				nonce: "n1",
				tenantId: tid,
				now: new Date("2026-11-04T12:00:00Z"),
			}),
		).toBe(false);
		const byId = { ...byDomain, tenantKey: tid };
		expect(
			entraCallbackValid(byId, {
				nonce: "n1",
				tenantId: tid.toUpperCase(),
				now,
			}),
		).toBe(true);
		expect(
			entraCallbackValid(byId, {
				nonce: "n1",
				tenantId: "44444444-4444-4444-4444-444444444444",
				now,
			}),
		).toBe(false);
		expect(entraCallbackValid(null, { nonce: "n1", tenantId: tid, now })).toBe(
			false,
		);
	});
});
