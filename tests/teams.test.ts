import { execFileSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	channelFor,
	mailDecision,
	mailWanted,
	TEAMS_MAX_ATTEMPTS,
	teamsWanted,
} from "@/lib/notifications/channels";
import type { TeamsConfig } from "@/lib/teams/config";
import {
	adminConsentUrl,
	openConsentState,
	sealConsentState,
} from "@/lib/teams/consent";
import {
	activityBody,
	clientAssertion,
	createGraphClient,
	stageDeepLink,
} from "@/lib/teams/graph";
import type { TeamsHttpRequest, TeamsTransport } from "@/lib/teams/http";
import { teamsUrlAllowed } from "@/lib/teams/http";
import {
	buildTeamsManifest,
	colorIcon,
	outlineIcon,
} from "@/lib/teams/manifest";
import { teamsWebUrl } from "@/lib/teams/service";

// Microsoft Teams (T5) ohne echte Anbieter: Kanalregeln, Freigabe-Siegel,
// Graph-Client gegen einen nachgebauten Login- und Graph-Dienst, Manifest.

const ORG = "2f6c1c1e-4d39-4f0b-9a1e-3a6f0b9c1d22";
const TENANT_A = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const TENANT_B = "11111111-2222-4333-8444-555555555555";

describe("Kanal je Benachrichtigung", () => {
	const active = { teamsActive: true, teamsSentAt: null, teamsAttempts: 0 };
	it("ohne Einstellung Mail", () => {
		expect(channelFor(undefined, "task_assigned")).toBe("mail");
		expect(mailWanted("mail", active)).toBe(true);
		expect(teamsWanted("mail", active)).toBe(false);
	});
	it("nur Teams: keine Mail, solange Teams es versucht", () => {
		expect(teamsWanted("teams", active)).toBe(true);
		expect(
			mailDecision("teams", active, { digest: false, digestEnabled: true }),
		).toBe("wait");
		const sent = { ...active, teamsSentAt: new Date() };
		expect(
			mailDecision("teams", sent, { digest: true, digestEnabled: true }),
		).toBe("skip");
		expect(teamsWanted("teams", sent)).toBe(false);
	});
	it("nach drei Fehlversuchen oder ohne Teams: Mail", () => {
		const failed = { ...active, teamsAttempts: TEAMS_MAX_ATTEMPTS };
		expect(teamsWanted("teams", failed)).toBe(false);
		expect(
			mailDecision("teams", failed, { digest: false, digestEnabled: true }),
		).toBe("send");
		const off = { ...active, teamsActive: false };
		expect(mailWanted("teams", off)).toBe(true);
		expect(teamsWanted("teams", off)).toBe(false);
	});
	it("Mail und Teams: beides; Tages-Mail aus: Digest-Arten entfallen", () => {
		expect(teamsWanted("both", active)).toBe(true);
		expect(mailWanted("both", active)).toBe(true);
		expect(
			mailDecision("mail", active, { digest: true, digestEnabled: false }),
		).toBe("skip");
		expect(
			mailDecision("mail", active, { digest: false, digestEnabled: false }),
		).toBe("send");
	});
});

describe("Freigabe-Link", () => {
	const secret = "s".repeat(40);
	it("Siegel prüft Org, Ablauf und Unversehrtheit", () => {
		const state = sealConsentState(ORG, "nonce1", 2_000, secret);
		expect(openConsentState(state, secret, 1_000)).toEqual({
			orgId: ORG,
			nonce: "nonce1",
		});
		expect(openConsentState(state, secret, 3_000)).toBeNull();
		expect(openConsentState(state, "x".repeat(40), 1_000)).toBeNull();
		const [o, , e, s] = state.split(".");
		expect(openConsentState(`${o}.anders.${e}.${s}`, secret, 1_000)).toBeNull();
	});
	it("Link geht an den Tenant der Kundin, mit Rückruf und Zustand", () => {
		const u = new URL(
			adminConsentUrl(
				TENANT_A,
				"cid",
				"https://raza.work/api/teams/consent",
				"st",
			),
		);
		expect(u.host).toBe("login.microsoftonline.com");
		expect(u.pathname).toBe(`/${TENANT_A}/v2.0/adminconsent`);
		expect(u.searchParams.get("redirect_uri")).toBe(
			"https://raza.work/api/teams/consent",
		);
		expect(u.searchParams.get("state")).toBe("st");
	});
});

describe("Ziele und Links", () => {
	it("nur die zwei Microsoft-Hosts über https", () => {
		expect(
			teamsUrlAllowed("https://graph.microsoft.com/v1.0/users"),
		).not.toBeNull();
		expect(
			teamsUrlAllowed("https://login.microsoftonline.com/x/oauth2/v2.0/token"),
		).not.toBeNull();
		expect(teamsUrlAllowed("http://graph.microsoft.com/")).toBeNull();
		expect(
			teamsUrlAllowed("https://graph.microsoft.com.evil.example/"),
		).toBeNull();
		expect(teamsUrlAllowed("https://graph.microsoft.com:8443/")).toBeNull();
		expect(teamsUrlAllowed("https://u:p@graph.microsoft.com/")).toBeNull();
	});
	it("Link öffnet nur die eigene Instanz, Titel gekürzt", () => {
		expect(teamsWebUrl("https://raza.work", "/risiken/1")).toBe(
			"https://raza.work/risiken/1",
		);
		expect(teamsWebUrl("https://raza.work", "https://evil.example/x")).toBe(
			"https://raza.work/heute",
		);
		expect(teamsWebUrl("https://raza.work", "//evil.example")).toBe(
			"https://raza.work/heute",
		);
		const body = activityBody(
			{ title: "x".repeat(300), webUrl: "https://raza.work/a" },
			"app",
		);
		expect(
			(body.previewText as { content: string }).content.length,
		).toBeLessThanOrEqual(150);
		expect(stageDeepLink("app", "https://raza.work/a")).toMatch(
			/^https:\/\/teams\.microsoft\.com\/l\/stage\/app\/0\?context=/,
		);
	});
});

// Nachgebauter Login- und Graph-Dienst
function fakeMicrosoft(
	opts: { consentMissing?: string[]; throttle?: boolean } = {},
) {
	const calls: TeamsHttpRequest[] = [];
	const transport: TeamsTransport = async (req) => {
		calls.push(req);
		const u = new URL(req.url);
		const ok = (status: number, body: unknown = "") => ({
			ok: true as const,
			res: {
				status,
				body: typeof body === "string" ? body : JSON.stringify(body),
			},
		});
		if (u.host === "login.microsoftonline.com") {
			const tenant = u.pathname.split("/")[1] ?? "";
			if (opts.consentMissing?.includes(tenant))
				return ok(400, {
					error: "invalid_grant",
					error_description: "AADSTS7000229: missing",
				});
			return ok(200, { access_token: `tok-${tenant}`, expires_in: 3600 });
		}
		if (opts.throttle) return ok(429, {});
		const auth = req.headers.authorization ?? "";
		if (!auth.startsWith("Bearer tok-")) return ok(401, {});
		if (
			u.pathname === "/v1.0/users/ana%40firma.de" ||
			u.pathname === "/v1.0/users/ana@firma.de"
		)
			return ok(200, { id: "aad-ana" });
		if (
			u.pathname.startsWith("/v1.0/users/") &&
			req.method === "GET" &&
			!u.pathname.endsWith("installedApps")
		)
			return ok(404, {});
		if (
			u.pathname === "/v1.0/users" &&
			u.searchParams.get("$filter") === "mail eq 'bo@firma.de'"
		)
			return ok(200, { value: [{ id: "aad-bo" }] });
		if (u.pathname === "/v1.0/users") return ok(200, { value: [] });
		if (u.pathname === "/v1.0/appCatalogs/teamsApps")
			return ok(200, { value: [{ id: "cat-1" }] });
		if (u.pathname.endsWith("/teamwork/installedApps"))
			return ok(u.pathname.includes("aad-bo") ? 409 : 201, {});
		if (u.pathname.endsWith("/teamwork/sendActivityNotification"))
			return ok(204);
		return ok(404, {});
	};
	return { transport, calls };
}

const SECRET_CONFIG: TeamsConfig = {
	clientId: "cid",
	appId: "6c7d8f4e-2b1a-4c3d-9e8f-7a6b5c4d3e2f",
	credential: { kind: "secret", secret: "geheim" },
};

describe("Graph-Client", () => {
	it("Token je Tenant, zwischengespeichert bis zum Ablauf", async () => {
		const m = fakeMicrosoft();
		const c = createGraphClient(SECRET_CONFIG, m.transport, () => 1_000);
		expect((await c.token(TENANT_A)).ok).toBe(true);
		expect((await c.token(TENANT_A)).ok).toBe(true);
		expect((await c.token(TENANT_B)).ok).toBe(true);
		const logins = m.calls.filter((x) =>
			x.url.includes("login.microsoftonline.com"),
		);
		expect(logins).toHaveLength(2);
		expect(logins[0]?.body).toContain("client_secret=geheim");
		expect(logins[0]?.body).toContain("grant_type=client_credentials");
	});

	it("Person finden (direkt oder über die Mail), App installieren, Hinweis senden", async () => {
		const c = createGraphClient(SECRET_CONFIG, fakeMicrosoft().transport);
		expect(await c.findUser(TENANT_A, "ana@firma.de")).toEqual({
			ok: true,
			value: "aad-ana",
		});
		expect(await c.findUser(TENANT_A, "bo@firma.de")).toEqual({
			ok: true,
			value: "aad-bo",
		});
		expect(await c.findUser(TENANT_A, "nie@firma.de")).toEqual({
			ok: false,
			error: "user_not_found",
		});
		expect(await c.findCatalogApp(TENANT_A)).toEqual({
			ok: true,
			value: "cat-1",
		});
		expect((await c.installApp(TENANT_A, "aad-ana", "cat-1")).ok).toBe(true);
		// schon installiert (409) gilt als erledigt
		expect((await c.installApp(TENANT_A, "aad-bo", "cat-1")).ok).toBe(true);
		expect(
			(
				await c.sendActivity(TENANT_A, "aad-ana", {
					title: "Freigabe",
					webUrl: "https://raza.work/x",
				})
			).ok,
		).toBe(true);
	});

	it("fehlende Freigabe und Drosselung als eigene Codes, Token nie in Fehlern", async () => {
		const c = createGraphClient(
			SECRET_CONFIG,
			fakeMicrosoft({ consentMissing: [TENANT_B] }).transport,
		);
		expect(await c.findUser(TENANT_B, "ana@firma.de")).toEqual({
			ok: false,
			error: "consent_missing",
		});
		const t = createGraphClient(
			SECRET_CONFIG,
			fakeMicrosoft({ throttle: true }).transport,
		);
		const r = await t.sendActivity(TENANT_A, "aad-ana", {
			title: "x",
			webUrl: "https://raza.work",
		});
		expect(r).toEqual({ ok: false, error: "throttled" });
	});

	it("Anmeldung mit Zertifikat: signierte Assertion mit Fingerabdruck", () => {
		const dir = mkdtempSync(join(tmpdir(), "teams-cert-"));
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-subj",
				"/CN=klick-test",
				"-keyout",
				join(dir, "key.pem"),
				"-out",
				join(dir, "cert.pem"),
				"-days",
				"1",
			],
			{ stdio: "ignore" },
		);
		const pem = `${readFileSync(join(dir, "key.pem"), "utf8")}\n${readFileSync(join(dir, "cert.pem"), "utf8")}`;
		const jwt = clientAssertion(
			"cid",
			TENANT_A,
			pem,
			1_700_000_000_000,
			"jti-1",
		);
		const [h, p, sig] = jwt.split(".") as [string, string, string];
		const header = JSON.parse(Buffer.from(h, "base64url").toString());
		const payload = JSON.parse(Buffer.from(p, "base64url").toString());
		expect(header).toMatchObject({ alg: "RS256", typ: "JWT" });
		expect(header.x5t).toMatch(/^[A-Za-z0-9_-]{27}$/);
		expect(payload).toMatchObject({
			iss: "cid",
			sub: "cid",
			jti: "jti-1",
			aud: `https://login.microsoftonline.com/${TENANT_A}/oauth2/v2.0/token`,
		});
		expect(payload.exp - payload.nbf).toBeLessThanOrEqual(700);
		const pub = createPublicKey(readFileSync(join(dir, "cert.pem"), "utf8"));
		expect(
			verify(
				"sha256",
				Buffer.from(`${h}.${p}`),
				pub,
				Buffer.from(sig, "base64url"),
			),
		).toBe(true);
	});
});

describe("App-Paket", () => {
	it("Manifest verbindet App und Registrierung, Aktivitätsart, eigene Domain", () => {
		const m = buildTeamsManifest({
			appId: SECRET_CONFIG.appId,
			clientId: "cid",
			baseUrl: "https://raza.work",
		});
		expect(m.id).toBe(SECRET_CONFIG.appId);
		expect(m.validDomains).toEqual(["raza.work"]);
		expect((m.webApplicationInfo as { id: string }).id).toBe("cid");
		const types = (
			m.activities as {
				activityTypes: { type: string; templateText: string }[];
			}
		).activityTypes;
		expect(types[0]).toMatchObject({
			type: "klickHinweis",
			templateText: "{title}",
		});
	});
	it("Symbole sind PNG in 192 und 32 Pixel", () => {
		for (const [png, size] of [
			[colorIcon(), 192],
			[outlineIcon(), 32],
		] as const) {
			const b = Buffer.from(png);
			expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
			expect(b.readUInt32BE(16)).toBe(size);
			expect(b.readUInt32BE(20)).toBe(size);
			const idat = b.indexOf("IDAT");
			const len = b.readUInt32BE(idat - 4);
			expect(inflateSync(b.subarray(idat + 4, idat + 4 + len)).length).toBe(
				(size * 4 + 1) * size,
			);
		}
	});
});
