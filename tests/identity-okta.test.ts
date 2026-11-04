import { describe, expect, it } from "vitest";
import {
	fetchOktaSnapshot,
	OKTA_MFA_LOOKUP_MAX,
	oktaAccount,
	oktaBound,
	strongFactor,
} from "@/lib/identity/providers/okta";
import {
	createOktaGet,
	nextLinkOf,
	type OktaGet,
	oktaWaitMs,
} from "@/lib/okta/client";
import {
	type OktaHttpRequest,
	type OktaTransport,
	oktaDomainOf,
	oktaUrlAllowed,
} from "@/lib/okta/http";
import { oktaConnectSchema } from "@/lib/validation/identity";

// Teil D I4: Okta nur lesend mit dem API-Token der Kundin. Nur an die
// eingetragene Okta-Domain (nie eigene Domains), nur GET, Blättern nur auf
// demselben Host, 429 mit X-Rate-Limit-Reset, Faktoren je Konto bis zur
// Obergrenze, Admin-Rollen nur mit Recht.

const D = "firma.okta.com";
const TOKEN = "00abcdefghijklmnopqrstuvwxyz0123456789AB";

describe("Okta-Adresse", () => {
	it("nur Okta-Hosts, auch aus Link oder OIDC-Issuer", () => {
		expect(oktaDomainOf("firma.okta.com")).toBe(D);
		expect(oktaDomainOf("https://Firma.okta.com/")).toBe(D);
		expect(oktaDomainOf("https://firma.okta.com/oauth2/default")).toBe(D);
		expect(oktaDomainOf("dev-123.oktapreview.com")).toBe(
			"dev-123.oktapreview.com",
		);
		expect(oktaDomainOf("firma.okta-emea.com")).toBe("firma.okta-emea.com");
		for (const bad of [
			"login.firma.de",
			"okta.com",
			"evil.com/firma.okta.com",
			"firma.okta.com.evil.example",
			"http://firma.okta.com",
			"https://firma.okta.com:8443",
			"https://u:p@firma.okta.com",
			"a.b.okta.com",
			"",
		])
			expect(oktaDomainOf(bad), bad).toBeNull();
	});

	it("Abfragen nur an genau diese Domain", () => {
		expect(oktaUrlAllowed(`https://${D}/api/v1/users`, D)).not.toBeNull();
		expect(
			oktaUrlAllowed("https://andere.okta.com/api/v1/users", D),
		).toBeNull();
		expect(oktaUrlAllowed(`http://${D}/api/v1/users`, D)).toBeNull();
		expect(oktaUrlAllowed("https://intern.local/", "intern.local")).toBeNull();
	});

	it("Eingabe: Adresse wird zur Domain, Token mit festem Format, Hinweis Pflicht", () => {
		expect(
			oktaConnectSchema.parse({
				domain: "https://firma.okta.com/oauth2/default",
				token: ` ${TOKEN} `,
				acknowledged: true,
			}),
		).toEqual({ domain: D, token: TOKEN, acknowledged: true });
		expect(
			oktaConnectSchema.safeParse({
				domain: "login.firma.de",
				token: TOKEN,
				acknowledged: true,
			}).success,
		).toBe(false);
		expect(
			oktaConnectSchema.safeParse({
				domain: D,
				token: "zu kurz",
				acknowledged: true,
			}).success,
		).toBe(false);
		expect(
			oktaConnectSchema.safeParse({ domain: D, token: TOKEN }).success,
		).toBe(false);
	});
});

describe("Client", () => {
	it("nächste Seite nur auf demselben Host", () => {
		expect(
			nextLinkOf(
				`<https://${D}/api/v1/users?limit=200>; rel="self", <https://${D}/api/v1/users?after=00u2&limit=200>; rel="next"`,
				D,
			),
		).toBe(`https://${D}/api/v1/users?after=00u2&limit=200`);
		expect(
			nextLinkOf('<https://evil.example/api/v1/users>; rel="next"', D),
		).toBeNull();
		expect(nextLinkOf(`<https://${D}/x>; rel="self"`, D)).toBeNull();
		expect(nextLinkOf(undefined, D)).toBeNull();
	});

	it("Wartezeit aus X-Rate-Limit-Reset bzw. Retry-After", () => {
		const now = 1_793_800_000_000;
		expect(
			oktaWaitMs({ "x-rate-limit-reset": String(now / 1000 + 20) }, now),
		).toBe(21_000);
		expect(
			oktaWaitMs({ "x-rate-limit-reset": String(now / 1000 - 5) }, now),
		).toBe(1000);
		expect(oktaWaitMs({ "retry-after": "7" }, now)).toBe(7000);
		expect(oktaWaitMs(undefined, now)).toBe(10_000);
	});

	function fake(
		answers: {
			status: number;
			body?: string;
			headers?: Record<string, string>;
		}[],
	) {
		const calls: OktaHttpRequest[] = [];
		const transport: OktaTransport = async (req) => {
			calls.push(req);
			const next = answers.shift();
			if (!next) return { ok: true, res: { status: 404, body: "{}" } };
			return {
				ok: true,
				res: {
					status: next.status,
					body: next.body ?? "[]",
					headers: next.headers,
				},
			};
		};
		return { transport, calls };
	}

	it("Token nur in der Kopfzeile, nie an fremde Hosts", async () => {
		const { transport, calls } = fake([
			{
				status: 200,
				headers: { link: `<https://${D}/api/v1/users?after=x>; rel="next"` },
			},
		]);
		const get = createOktaGet(D, TOKEN, transport);
		const r = await get("/api/v1/users?limit=200");
		expect(r).toEqual({
			ok: true,
			value: {
				status: 200,
				body: "[]",
				next: `https://${D}/api/v1/users?after=x`,
			},
		});
		expect(calls[0]?.url).toBe(`https://${D}/api/v1/users?limit=200`);
		expect(calls[0]?.headers.authorization).toBe(`SSWS ${TOKEN}`);
		expect(calls[0]?.url).not.toContain(TOKEN);
		expect(await get("https://evil.example/api/v1/users")).toEqual({
			ok: false,
			error: "host_not_allowed",
		});
		expect(calls).toHaveLength(1);
	});

	it("401 = Token ungültig, 429 einmal warten, zu lange = gebremst", async () => {
		expect(
			await createOktaGet(
				D,
				TOKEN,
				fake([{ status: 401 }]).transport,
			)("/api/v1/users"),
		).toEqual({ ok: false, error: "consent_missing" });
		const waits: number[] = [];
		const sleep = async (ms: number) => {
			waits.push(ms);
		};
		const now = () => 1_793_800_000_000;
		const once = createOktaGet(
			D,
			TOKEN,
			fake([
				{
					status: 429,
					headers: { "x-rate-limit-reset": String(1_793_800_000 + 4) },
				},
				{ status: 200 },
			]).transport,
			{ now, sleep },
		);
		expect((await once("/api/v1/users")).ok).toBe(true);
		expect(waits).toEqual([5000]);
		waits.length = 0;
		const long = createOktaGet(
			D,
			TOKEN,
			fake([
				{
					status: 429,
					headers: { "x-rate-limit-reset": String(1_793_800_000 + 600) },
				},
			]).transport,
			{ now, sleep },
		);
		expect(await long("/api/v1/users")).toEqual({
			ok: false,
			error: "throttled",
		});
		expect(waits).toEqual([]);
	});
});

describe("Konten aus Okta", () => {
	it("Konto vereinheitlichen: Status, Name, Adresse", () => {
		expect(
			oktaAccount({
				id: "00u1",
				status: "ACTIVE",
				created: "2024-02-01T09:00:00.000Z",
				lastLogin: "2026-10-30T07:00:00.000Z",
				profile: {
					login: "Anna@Firma.example",
					email: "anna@firma.example",
					firstName: "Anna",
					lastName: "Admin",
					// nie übernommen
					mobilePhone: "+49 30 123",
				} as never,
			}),
		).toEqual({
			externalId: "00u1",
			email: "anna@firma.example",
			displayName: "Anna Admin",
			kind: "member",
			enabled: true,
			isAdmin: false,
			isTopAdmin: false,
			adminRoles: [],
			mfaRegistered: null,
			lastSignInAt: "2026-10-30T07:00:00.000Z",
			createdAt: "2024-02-01T09:00:00.000Z",
			leaveAt: null,
		});
		for (const [status, enabled] of [
			["PASSWORD_EXPIRED", true],
			["LOCKED_OUT", true],
			["PROVISIONED", true],
			["STAGED", false],
			["SUSPENDED", false],
			["DEPROVISIONED", false],
		] as const)
			expect(oktaAccount({ id: "x", status })?.enabled, status).toBe(enabled);
		expect(
			oktaAccount({
				id: "y",
				status: "ACTIVE",
				profile: { login: "svc-backup" },
			}),
		).toMatchObject({
			email: null,
			displayName: "svc-backup",
			lastSignInAt: null,
		});
		expect(oktaAccount({ status: "ACTIVE" })).toBeNull();
	});

	it("zweiter Faktor: nur aktive, nicht E-Mail, Frage oder Kennwort", () => {
		expect(strongFactor([{ factorType: "email", status: "ACTIVE" }])).toBe(
			false,
		);
		expect(strongFactor([{ factorType: "question", status: "ACTIVE" }])).toBe(
			false,
		);
		expect(
			strongFactor([{ factorType: "push", status: "PENDING_ACTIVATION" }]),
		).toBe(false);
		expect(
			strongFactor([
				{ factorType: "email", status: "ACTIVE" },
				{ factorType: "webauthn", status: "ACTIVE" },
			]),
		).toBe(true);
		expect(strongFactor([])).toBe(false);
	});

	type Route = (
		path: string,
	) => { status: number; body: unknown; next?: string } | null;
	function fakeGet(route: Route) {
		const paths: string[] = [];
		const get: OktaGet = async (path) => {
			paths.push(path);
			const r = route(path);
			if (!r)
				return { ok: true, value: { status: 404, body: "{}", next: null } };
			return {
				ok: true,
				value: {
					status: r.status,
					body: JSON.stringify(r.body),
					next: r.next ?? null,
				},
			};
		};
		return { get, paths };
	}

	const users = (n: number, from = 0) =>
		Array.from({ length: n }, (_, i) => ({
			id: `00u${from + i}`,
			status: "ACTIVE",
			profile: { login: `p${from + i}@firma.example` },
		}));

	it("Abruf: blättert, setzt Admins und MFA, Domains aus der Bindung", async () => {
		const { get, paths } = fakeGet((path) => {
			if (path === "/api/v1/users?limit=200")
				return {
					status: 200,
					body: users(2),
					next: `https://${D}/api/v1/users?after=2`,
				};
			if (path === `https://${D}/api/v1/users?after=2`)
				return {
					status: 200,
					body: [
						...users(1, 2),
						{ id: "00u9", status: "SUSPENDED", profile: {} },
					],
				};
			if (path.startsWith("/api/v1/iam/assignees/users"))
				return {
					status: 200,
					body: { value: [{ id: "00u0" }, { id: "00u1" }] },
				};
			if (path === "/api/v1/users/00u0/roles")
				return {
					status: 200,
					body: [
						{
							type: "SUPER_ADMIN",
							label: "Super Administrator",
							status: "ACTIVE",
						},
					],
				};
			if (path === "/api/v1/users/00u1/roles")
				return {
					status: 200,
					body: [{ type: "READ_ONLY_ADMIN", label: "Read-only Administrator" }],
				};
			if (path === "/api/v1/users/00u0/factors")
				return {
					status: 200,
					body: [{ factorType: "token:software:totp", status: "ACTIVE" }],
				};
			if (path.endsWith("/factors"))
				return {
					status: 200,
					body: [{ factorType: "email", status: "ACTIVE" }],
				};
			return null;
		});
		const r = await fetchOktaSnapshot(get, ["Firma.example"]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const byId = Object.fromEntries(
			r.value.accounts.map((a) => [a.externalId, a]),
		);
		expect(Object.keys(byId)).toEqual(["00u0", "00u1", "00u2", "00u9"]);
		expect(byId["00u0"]).toMatchObject({
			isAdmin: true,
			isTopAdmin: true,
			adminRoles: ["Super Administrator"],
			mfaRegistered: true,
		});
		expect(byId["00u1"]).toMatchObject({
			isAdmin: true,
			isTopAdmin: false,
			mfaRegistered: false,
		});
		// gesperrt: keine Faktor-Abfrage
		expect(byId["00u9"]?.mfaRegistered).toBeNull();
		expect(paths).not.toContain("/api/v1/users/00u9/factors");
		expect(r.value.domains).toEqual(["firma.example"]);
		expect(r.value.capabilities).toEqual({
			signIn: true,
			mfa: true,
			roles: true,
			leaveDate: false,
		});
	});

	it("ohne Recht auf Rollen: Admins nicht bewertbar; zu viele aktive: MFA nicht bewertbar", async () => {
		const { get, paths } = fakeGet((path) => {
			if (path === "/api/v1/users?limit=200")
				return { status: 200, body: users(OKTA_MFA_LOOKUP_MAX + 1) };
			if (path.startsWith("/api/v1/iam/assignees/users"))
				return { status: 403, body: { errorCode: "E0000006" } };
			return null;
		});
		const r = await fetchOktaSnapshot(get, []);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.capabilities).toMatchObject({ mfa: false, roles: false });
		expect(r.value.accounts.every((a) => a.mfaRegistered === null)).toBe(true);
		expect(paths.some((p) => p.endsWith("/factors"))).toBe(false);
	});

	it("403 beim Lesen der Konten = forbidden, kaputte Antwort = bad_response", async () => {
		expect(
			await fetchOktaSnapshot(
				fakeGet(() => ({ status: 403, body: {} })).get,
				[],
			),
		).toEqual({ ok: false, error: "forbidden" });
		expect(
			await fetchOktaSnapshot(
				fakeGet(() => ({ status: 200, body: { kein: "array" } })).get,
				[],
			),
		).toEqual({ ok: false, error: "bad_response" });
	});

	it("Bindung: Inhaber:in ist aktives Konto mit gleicher Adresse", async () => {
		const known: Record<string, unknown> = {
			"olga@firma.example": {
				status: "ACTIVE",
				profile: { login: "olga@firma.example" },
			},
			"gesperrt@firma.example": {
				status: "SUSPENDED",
				profile: { login: "gesperrt@firma.example" },
			},
			"alias@firma.example": {
				status: "ACTIVE",
				profile: { login: "jemand@firma.example" },
			},
		};
		const { get } = fakeGet((path) => {
			const m = /^\/api\/v1\/users\/([^/]+)$/.exec(path);
			const u = m ? known[decodeURIComponent(m[1] as string)] : undefined;
			return u ? { status: 200, body: u } : null;
		});
		expect(await oktaBound(get, ["Olga@Firma.example"])).toEqual([
			"firma.example",
		]);
		expect(
			await oktaBound(get, [
				"gesperrt@firma.example",
				"alias@firma.example",
				"neu@firma.example",
			]),
		).toEqual([]);
	});
});
