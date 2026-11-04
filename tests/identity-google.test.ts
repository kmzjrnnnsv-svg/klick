import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	adminUrl,
	createGoogleGet,
	type GoogleGet,
	tokenErrorOf,
} from "@/lib/google/client";
import {
	type GoogleHttpRequest,
	type GoogleTransport,
	googleUrlAllowed,
} from "@/lib/google/http";
import {
	GOOGLE_SCOPES,
	googleAssertion,
	parseServiceAccount,
} from "@/lib/google/token";
import {
	fetchGoogleSnapshot,
	googleAccount,
	googleBound,
	googleCustomer,
} from "@/lib/identity/providers/google";

// Teil D I3: Google Workspace nur lesend. Dienstkonto mit domänenweiter
// Delegierung (RS256, sub = Admin-Adresse), nur oauth2.googleapis.com und
// admin.googleapis.com, Token je Admin-Adresse, bei 429 einmal warten.

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyJson = JSON.stringify({
	type: "service_account",
	project_id: "klick-identitaet",
	private_key_id: "abc123",
	private_key: pem,
	client_email: "klick-identitaet@klick-identitaet.iam.gserviceaccount.com",
	client_id: "104857600123456789012",
});
const sa = parseServiceAccount(keyJson);
if (!sa) throw new Error("Dienstkonto nicht lesbar");

const b64json = (part: string) =>
	JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("Dienstkonto", () => {
	it("liest nur die nötigen Felder und lehnt Unpassendes ab", () => {
		expect(sa).toEqual({
			clientEmail: "klick-identitaet@klick-identitaet.iam.gserviceaccount.com",
			clientId: "104857600123456789012",
			privateKey: pem,
			keyId: "abc123",
		});
		const base = JSON.parse(keyJson) as Record<string, string>;
		expect(parseServiceAccount("kein json")).toBeNull();
		expect(
			parseServiceAccount(JSON.stringify({ ...base, type: "authorized_user" })),
		).toBeNull();
		expect(
			parseServiceAccount(
				JSON.stringify({ ...base, client_email: "x@gmail.com" }),
			),
		).toBeNull();
		expect(
			parseServiceAccount(JSON.stringify({ ...base, client_id: "abc" })),
		).toBeNull();
		expect(
			parseServiceAccount(
				JSON.stringify({
					...base,
					private_key:
						"-----BEGIN PRIVATE KEY-----\nkaputt\n-----END PRIVATE KEY-----",
				}),
			),
		).toBeNull();
	});

	it("Assertion: RS256 mit kid, sub = Admin-Adresse, nur Lese-Bereiche, 1 h", () => {
		const now = Date.UTC(2026, 10, 4, 10, 0, 0);
		const jwt = googleAssertion(sa, "admin@firma.example", now);
		const [h, p, s] = jwt.split(".") as [string, string, string];
		expect(b64json(h)).toEqual({ alg: "RS256", typ: "JWT", kid: "abc123" });
		const payload = b64json(p);
		expect(payload).toEqual({
			iss: sa.clientEmail,
			sub: "admin@firma.example",
			scope: GOOGLE_SCOPES.join(" "),
			aud: "https://oauth2.googleapis.com/token",
			iat: now / 1000,
			exp: now / 1000 + 3600,
		});
		for (const scope of GOOGLE_SCOPES) expect(scope).toMatch(/\.readonly$/);
		expect(
			verify(
				"sha256",
				Buffer.from(`${h}.${p}`),
				createPublicKey(publicKey.export({ type: "spki", format: "pem" })),
				Buffer.from(s, "base64url"),
			),
		).toBe(true);
	});
});

describe("Adressen", () => {
	it("nur die beiden Google-Hosts über https ohne Port", () => {
		expect(
			googleUrlAllowed("https://oauth2.googleapis.com/token"),
		).not.toBeNull();
		expect(
			googleUrlAllowed("https://admin.googleapis.com/admin/directory/v1/users"),
		).not.toBeNull();
		expect(googleUrlAllowed("http://admin.googleapis.com/x")).toBeNull();
		expect(googleUrlAllowed("https://admin.googleapis.com:8443/x")).toBeNull();
		expect(googleUrlAllowed("https://www.googleapis.com/x")).toBeNull();
		expect(
			googleUrlAllowed("https://admin.googleapis.com.evil.example/"),
		).toBeNull();
		expect(googleUrlAllowed("https://u:p@admin.googleapis.com/")).toBeNull();
	});

	it("Abfragen nur an admin.googleapis.com", () => {
		expect(adminUrl("/admin/directory/v1/users")).toBe(
			"https://admin.googleapis.com/admin/directory/v1/users",
		);
		expect(adminUrl("https://admin.googleapis.com/admin/x?y=1")).toBe(
			"https://admin.googleapis.com/admin/x?y=1",
		);
		expect(adminUrl("https://oauth2.googleapis.com/token")).toBeNull();
		expect(adminUrl("https://evil.example/admin")).toBeNull();
		expect(adminUrl("nicht-url")).toBeNull();
	});

	it("Fehler des Token-Endpunkts", () => {
		expect(tokenErrorOf('{"error":"unauthorized_client"}')).toBe(
			"consent_missing",
		);
		expect(tokenErrorOf('{"error":"access_denied"}')).toBe("consent_missing");
		expect(tokenErrorOf('{"error":"invalid_grant"}')).toBe("forbidden");
		expect(tokenErrorOf('{"error":"server_error"}')).toBe("token_failed");
	});
});

type Answer = {
	status: number;
	body?: string;
	headers?: Record<string, string>;
};

function fakeTransport(answers: Record<string, Answer[]>) {
	const calls: GoogleHttpRequest[] = [];
	const transport: GoogleTransport = async (req) => {
		calls.push(req);
		const key = Object.keys(answers).find((k) => req.url.includes(k));
		const next = key ? answers[key]?.shift() : undefined;
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

const tokenOk = (t = "tok"): Answer => ({
	status: 200,
	body: JSON.stringify({ access_token: t, expires_in: 3600 }),
});

describe("Client", () => {
	it("Token je Admin-Adresse, wiederverwendet; nur GET außer dem Token", async () => {
		const { transport, calls } = fakeTransport({
			"/token": [tokenOk("t1"), tokenOk("t2")],
			"/users": [{ status: 200 }, { status: 200 }, { status: 200 }],
		});
		const get = createGoogleGet(sa, transport, { now: () => 0 });
		await get("a@firma.example", "/admin/directory/v1/users");
		await get("a@firma.example", "/admin/directory/v1/users");
		await get("b@firma.example", "/admin/directory/v1/users");
		const tokens = calls.filter((c) => c.url.includes("/token"));
		expect(tokens).toHaveLength(2);
		for (const c of calls) {
			if (c.url.includes("/token")) {
				expect(c.method).toBe("POST");
				expect(c.url).toBe("https://oauth2.googleapis.com/token");
				expect(c.body).toContain("grant-type%3Ajwt-bearer");
			} else expect(c.method).toBe("GET");
		}
		const users = calls.filter((c) => c.url.includes("/users"));
		expect(users.map((c) => c.headers.authorization)).toEqual([
			"Bearer t1",
			"Bearer t1",
			"Bearer t2",
		]);
	});

	it("fremder Host wird nie gefragt", async () => {
		const { transport, calls } = fakeTransport({});
		const get = createGoogleGet(sa, transport);
		const r = await get("a@firma.example", "https://evil.example/admin");
		expect(r).toEqual({ ok: false, error: "host_not_allowed" });
		expect(calls).toHaveLength(0);
	});

	it("fehlende Delegierung und unbrauchbare Admin-Adresse", async () => {
		const missing = createGoogleGet(
			sa,
			fakeTransport({
				"/token": [{ status: 401, body: '{"error":"unauthorized_client"}' }],
			}).transport,
		);
		expect(await missing("a@firma.example", "/admin/x")).toEqual({
			ok: false,
			error: "consent_missing",
		});
		const grant = createGoogleGet(
			sa,
			fakeTransport({
				"/token": [{ status: 400, body: '{"error":"invalid_grant"}' }],
			}).transport,
		);
		expect(await grant("a@firma.example", "/admin/x")).toEqual({
			ok: false,
			error: "forbidden",
		});
	});

	it("429: einmal warten, dann weiter; zweimal = gebremst; zu lang = sofort", async () => {
		const waits: number[] = [];
		const sleep = async (ms: number) => {
			waits.push(ms);
		};
		const once = createGoogleGet(
			sa,
			fakeTransport({
				"/token": [tokenOk()],
				"/admin/x": [
					{ status: 429, headers: { "retry-after": "3" } },
					{ status: 200, body: '{"ok":1}' },
				],
			}).transport,
			{ sleep },
		);
		expect(await once("a@firma.example", "/admin/x")).toEqual({
			ok: true,
			value: { status: 200, body: '{"ok":1}' },
		});
		expect(waits).toEqual([3000]);
		const twice = createGoogleGet(
			sa,
			fakeTransport({
				"/token": [tokenOk()],
				"/admin/x": [{ status: 429 }, { status: 429 }],
			}).transport,
			{ sleep },
		);
		expect(await twice("a@firma.example", "/admin/x")).toEqual({
			ok: false,
			error: "throttled",
		});
		waits.length = 0;
		const long = createGoogleGet(
			sa,
			fakeTransport({
				"/token": [tokenOk()],
				"/admin/x": [{ status: 429, headers: { "retry-after": "600" } }],
			}).transport,
			{ sleep },
		);
		expect(await long("a@firma.example", "/admin/x")).toEqual({
			ok: false,
			error: "throttled",
		});
		expect(waits).toEqual([]);
	});

	it("401 verwirft das Token, der nächste Aufruf holt ein neues", async () => {
		const { transport, calls } = fakeTransport({
			"/token": [tokenOk("alt"), tokenOk("neu")],
			"/admin/x": [{ status: 401 }, { status: 200 }],
		});
		const get = createGoogleGet(sa, transport, { now: () => 0 });
		expect((await get("a@firma.example", "/admin/x")).ok).toBe(true);
		await get("a@firma.example", "/admin/x");
		expect(
			calls
				.filter((c) => c.url.includes("/admin/x"))
				.map((c) => c.headers.authorization),
		).toEqual(["Bearer alt", "Bearer neu"]);
	});
});

// Nachgebaute Directory API über GoogleGet
type Route = (path: string) => { status: number; body: unknown } | null;
function fakeGet(route: Route) {
	const paths: string[] = [];
	const get: GoogleGet = async (_subject, path) => {
		paths.push(path);
		const r = route(path);
		if (!r) return { ok: true, value: { status: 404, body: "{}" } };
		return {
			ok: true,
			value: { status: r.status, body: JSON.stringify(r.body) },
		};
	};
	return { get, paths };
}

const customerRoute =
	(id = "C03az79cb"): Route =>
	(path) => {
		if (path.startsWith("/admin/directory/v1/customers/my_customer"))
			return { status: 200, body: { id } };
		if (path.startsWith("/admin/directory/v1/customer/my_customer/domains"))
			return {
				status: 200,
				body: {
					domains: [
						{ domainName: "Firma.example", verified: true },
						{ domainName: "neu.example", verified: false },
						{ domainName: "firma.example", verified: true },
						{ domainName: "zweit.example", verified: true },
					],
				},
			};
		return null;
	};

describe("Konten aus Google", () => {
	it("Konto vereinheitlichen", () => {
		expect(
			googleAccount({
				id: "111",
				primaryEmail: "Anna@Firma.example",
				name: { fullName: " Anna Admin " },
				isAdmin: true,
				isEnrolledIn2Sv: false,
				lastLoginTime: "2026-10-30T07:00:00.000Z",
				creationTime: "2024-02-01T09:00:00.000Z",
				// nie übernommen
				phones: [{ value: "+49 30 123" }],
			} as Parameters<typeof googleAccount>[0]),
		).toEqual({
			externalId: "111",
			email: "anna@firma.example",
			displayName: "Anna Admin",
			kind: "member",
			enabled: true,
			isAdmin: true,
			isTopAdmin: true,
			adminRoles: ["Super Admin"],
			mfaRegistered: false,
			lastSignInAt: "2026-10-30T07:00:00.000Z",
			createdAt: "2024-02-01T09:00:00.000Z",
			leaveAt: null,
		});
		const delegated = googleAccount({
			id: "222",
			primaryEmail: "bob@firma.example",
			isDelegatedAdmin: true,
			suspended: true,
			lastLoginTime: "1970-01-01T00:00:00.000Z",
		});
		expect(delegated).toMatchObject({
			enabled: false,
			isAdmin: true,
			isTopAdmin: false,
			adminRoles: ["Delegated Admin"],
			mfaRegistered: null,
			lastSignInAt: null,
			displayName: "bob@firma.example",
		});
		expect(googleAccount({ id: "333", archived: true })?.enabled).toBe(false);
		expect(googleAccount({ primaryEmail: "x@firma.example" })).toBeNull();
	});

	it("Kundennummer und nur bestätigte Domains", async () => {
		const { get } = fakeGet(customerRoute());
		expect(await googleCustomer(get, "admin@firma.example")).toEqual({
			ok: true,
			value: {
				customerId: "C03az79cb",
				domains: ["firma.example", "zweit.example"],
			},
		});
		const bad = fakeGet(customerRoute("x y"));
		expect(await googleCustomer(bad.get, "admin@firma.example")).toEqual({
			ok: false,
			error: "bad_response",
		});
		const denied = fakeGet(() => ({ status: 403, body: {} }));
		expect(await googleCustomer(denied.get, "admin@firma.example")).toEqual({
			ok: false,
			error: "forbidden",
		});
	});

	it("Abruf blättert, liefert Fähigkeiten ohne Austrittsdatum", async () => {
		const base = customerRoute();
		const { get, paths } = fakeGet((path) => {
			const c = base(path);
			if (c) return c;
			if (path.startsWith("/admin/directory/v1/users?")) {
				if (!path.includes("pageToken="))
					return {
						status: 200,
						body: {
							users: [{ id: "1", primaryEmail: "a@firma.example" }],
							nextPageToken: "seite2",
						},
					};
				if (path.includes("pageToken=seite2"))
					return {
						status: 200,
						body: { users: [{ id: "2", primaryEmail: "b@firma.example" }] },
					};
			}
			return null;
		});
		const r = await fetchGoogleSnapshot(
			get,
			"admin@firma.example",
			"c03AZ79CB",
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.accounts.map((a) => a.externalId)).toEqual(["1", "2"]);
		expect(r.value.domains).toEqual(["firma.example", "zweit.example"]);
		expect(r.value.capabilities).toEqual({
			signIn: true,
			mfa: true,
			roles: true,
			leaveDate: false,
		});
		const users = paths.filter((p) =>
			p.startsWith("/admin/directory/v1/users?"),
		);
		expect(users).toHaveLength(2);
		for (const p of users) {
			expect(p).toContain("customer=my_customer");
			expect(p).toContain("maxResults=500");
			// nur die nötigen Felder
			expect(decodeURIComponent(p)).toContain("users(id,primaryEmail,");
			expect(decodeURIComponent(p)).not.toContain("phones");
		}
	});

	it("andere Kundin hinter derselben Admin-Adresse: nichts gelesen", async () => {
		const { get, paths } = fakeGet(customerRoute("C0other"));
		expect(
			await fetchGoogleSnapshot(get, "admin@firma.example", "C03az79cb"),
		).toEqual({ ok: false, error: "tenant_mismatch" });
		expect(paths.some((p) => p.includes("/users?"))).toBe(false);
	});

	it("Fehler beim Blättern und zu viele Seiten", async () => {
		const base = customerRoute();
		const denied = fakeGet(
			(path) => base(path) ?? { status: 403, body: { error: { code: 403 } } },
		);
		expect(
			await fetchGoogleSnapshot(denied.get, "admin@firma.example"),
		).toEqual({
			ok: false,
			error: "forbidden",
		});
		let n = 0;
		const endless = fakeGet((path) => {
			const c = base(path);
			if (c) return c;
			n += 1;
			return {
				status: 200,
				body: { users: [{ id: String(n) }], nextPageToken: `p${n}` },
			};
		});
		expect(
			await fetchGoogleSnapshot(endless.get, "admin@firma.example"),
		).toEqual({
			ok: false,
			error: "too_many",
		});
		expect(n).toBe(120);
	});

	it("Bindung nur mit aktivem Konto einer Inhaber:in aus bestätigter Domain", async () => {
		const users: Record<string, unknown> = {
			"olga@firma.example": {
				primaryEmail: "olga@firma.example",
				suspended: false,
			},
			"gesperrt@firma.example": {
				primaryEmail: "gesperrt@firma.example",
				suspended: true,
			},
			"alias@firma.example": { primaryEmail: "jemand@firma.example" },
		};
		const { get, paths } = fakeGet((path) => {
			const m = /\/users\/([^?]+)\?/.exec(path);
			const u = m ? users[decodeURIComponent(m[1] as string)] : undefined;
			return u ? { status: 200, body: u } : null;
		});
		const domains = ["firma.example"];
		expect(
			await googleBound(get, "admin@firma.example", domains, [
				"Olga@Firma.example",
			]),
		).toBe(true);
		expect(
			await googleBound(get, "admin@firma.example", domains, [
				"gesperrt@firma.example",
				"alias@firma.example",
				"unbekannt@firma.example",
			]),
		).toBe(false);
		paths.length = 0;
		expect(
			await googleBound(get, "admin@firma.example", domains, [
				"olga@andere.example",
			]),
		).toBe(false);
		// fremde Domain wird gar nicht erst gefragt
		expect(paths).toEqual([]);
	});
});
