import { describe, expect, it } from "vitest";
import {
	ENTRA_MAX_ACCOUNTS,
	entraAdminRole,
	entraGuest,
	fetchEntraSnapshot,
	GLOBAL_ADMIN_TEMPLATE,
} from "@/lib/identity/providers/entra";
import type { ProviderAccount, ProviderResult } from "@/lib/identity/types";
import type { MsGet, MsResponse } from "@/lib/microsoft/types";

// Entra ID (Teil D) gegen einen nachgebauten Graph: Seiten, Gäste, Rollen,
// Rückfälle bei fehlender Lizenz bzw. fehlendem Recht, Fehlercodes.

const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";
const NEXT = "https://graph.microsoft.com/v1.0";

const DOMAINS_PATH = "/organization?$select=verifiedDomains";
const BASE =
	"id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime";
const USERS_ALL = `/users?$select=${BASE},signInActivity,employeeLeaveDateTime&$top=999`;
const USERS_SIGNIN = `/users?$select=${BASE},signInActivity&$top=999`;
const USERS_LEAVE = `/users?$select=${BASE},employeeLeaveDateTime&$top=999`;
const USERS_NONE = `/users?$select=${BASE}&$top=999`;
const MFA_PATH =
	"/reports/authenticationMethods/userRegistrationDetails?$select=id,isMfaRegistered&$top=999";
const ROLES_PATH =
	"/directoryRoles?$select=id,displayName,roleTemplateId&$expand=members($select=id)";

type Reply = ProviderResult<MsResponse>;
type Route = Reply[] | ((url: string) => Reply);

const json = (body: unknown, status = 200): Reply => ({
	ok: true,
	value: {
		status,
		body: typeof body === "string" ? body : JSON.stringify(body),
	},
});
const status = (code: number): Reply =>
	json({ error: { code: "Forbidden", message: "nope" } }, code);
const page = (value: unknown[], next?: string): Reply =>
	json(next ? { value, "@odata.nextLink": next } : { value });

// Graph-Nachbau: Antworten je Pfad-Präfix (längstes gewinnt) in Reihenfolge,
// jeder Aufruf wird mitgeschrieben
function fakeGraph(routes: Record<string, Route>) {
	const calls: { tenantId: string; url: string }[] = [];
	const get: MsGet = async (tenantId, url) => {
		calls.push({ tenantId, url });
		const key = Object.keys(routes)
			.filter((k) => url.startsWith(k))
			.sort((a, b) => b.length - a.length)[0];
		if (!key) throw new Error(`unerwarteter Aufruf: ${url}`);
		const route = routes[key];
		if (typeof route === "function") return route(url);
		const reply = route?.shift();
		if (!reply) throw new Error(`keine Antwort mehr für: ${url}`);
		return reply;
	};
	return { get, calls, urls: () => calls.map((c) => c.url) };
}

const ORG = {
	value: [
		{
			id: "org-1",
			verifiedDomains: [
				{ name: "Contoso.com", isVerified: true, isDefault: true },
				// so liefert Graph verifiedDomain: ohne isVerified
				{ name: "contoso.onmicrosoft.com", isInitial: true },
				{ name: "pending.example", isVerified: false },
				{ name: "CONTOSO.COM", isVerified: true },
			],
		},
	],
};

const ANNA = {
	id: "u-anna",
	displayName: "Anna Admin",
	userPrincipalName: "anna@contoso.com",
	mail: "Anna@Contoso.com",
	accountEnabled: true,
	userType: "Member",
	createdDateTime: "2024-02-01T09:00:00Z",
	signInActivity: {
		lastSignInDateTime: "2026-10-01T08:00:00Z",
		lastNonInteractiveSignInDateTime: "2026-09-01T08:00:00Z",
	},
	employeeLeaveDateTime: null,
	// darf nie in der Momentaufnahme landen
	mobilePhone: "+49 170 0000000",
	businessPhones: ["+49 69 000000"],
};
const BOB = {
	id: "u-bob",
	displayName: "Bob Partner",
	userPrincipalName: "bob_partner.example#EXT#@contoso.onmicrosoft.com",
	mail: "bob@partner.example",
	accountEnabled: true,
	userType: "Guest",
	createdDateTime: "2025-05-05T10:00:00Z",
	signInActivity: {
		lastSignInDateTime: "2026-03-01T10:00:00Z",
		lastNonInteractiveSignInDateTime: "2026-10-20T07:30:00Z",
	},
};
const CARLA = {
	id: "u-carla",
	displayName: "Carla Extern",
	// Gast nur am Anmeldenamen erkennbar, klein geschrieben
	userPrincipalName: "Carla_Firma.de#ext#@contoso.onmicrosoft.com",
	mail: null,
	accountEnabled: false,
	userType: "Member",
	createdDateTime: "2023-01-01T00:00:00Z",
	signInActivity: null,
	employeeLeaveDateTime: "2026-12-31T00:00:00Z",
};
const DIENST = {
	id: "u-dienst",
	displayName: null,
	userPrincipalName: null,
	mail: null,
	createdDateTime: null,
	signInActivity: {
		lastSignInDateTime: "0001-01-01T00:00:00Z",
		lastNonInteractiveSignInDateTime: null,
	},
};

const ROLES = {
	value: [
		{
			id: "r-ga",
			displayName: "Global Administrator",
			roleTemplateId: GLOBAL_ADMIN_TEMPLATE,
			members: [
				{ "@odata.type": "#microsoft.graph.user", id: "u-anna" },
				{ "@odata.type": "#microsoft.graph.servicePrincipal", id: "sp-1" },
				{ "@odata.type": "#microsoft.graph.group", id: "g-1" },
			],
		},
		{
			id: "r-ua",
			displayName: "User Administrator",
			roleTemplateId: "fe930be7-5e62-47db-91af-98c3a49a38b1",
			members: [
				{ "@odata.type": "#microsoft.graph.user", id: "u-dienst" },
				{ "@odata.type": "#microsoft.graph.user", id: "u-anna" },
			],
		},
		{
			id: "r-sp",
			displayName: "Application Administrator",
			roleTemplateId: "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3",
			members: [
				{ "@odata.type": "#microsoft.graph.servicePrincipal", id: "sp-2" },
			],
		},
	],
};

const MFA = {
	value: [
		{
			id: "u-anna",
			isMfaRegistered: true,
			userPrincipalName: "anna@contoso.com",
		},
		{ id: "u-bob", isMfaRegistered: false },
		{ id: "u-geloescht", isMfaRegistered: true },
	],
};

function happyRoutes(): Record<string, Route> {
	return {
		"/organization": [json(ORG)],
		"/users?": [page([ANNA, BOB], `${NEXT}/users?$skiptoken=seite2`)],
		[`${NEXT}/users?$skiptoken`]: [page([CARLA, DIENST])],
		"/reports/authenticationMethods/userRegistrationDetails": [json(MFA)],
		"/directoryRoles": [json(ROLES)],
	};
}

const byId = (accounts: ProviderAccount[], id: string) => {
	const a = accounts.find((x) => x.externalId === id);
	if (!a) throw new Error(`Konto fehlt: ${id}`);
	return a;
};

async function snapshot(routes: Record<string, Route>, maxAccounts?: number) {
	const g = fakeGraph(routes);
	const r = await fetchEntraSnapshot(
		g.get,
		TENANT,
		maxAccounts ? { maxAccounts } : undefined,
	);
	return { r, g };
}

describe("entraGuest", () => {
	it("erkennt Gäste an userType und #EXT#", () => {
		expect(entraGuest({ userType: "Guest" })).toBe(true);
		expect(entraGuest({ userType: "guest" })).toBe(true);
		expect(
			entraGuest({ userType: "Member", userPrincipalName: "a_b.de#EXT#@x" }),
		).toBe(true);
		expect(entraGuest({ userPrincipalName: "a_b.de#ext#@x" })).toBe(true);
		expect(
			entraGuest({ userType: "Member", userPrincipalName: "a@contoso.com" }),
		).toBe(false);
		expect(entraGuest({ userType: null, userPrincipalName: null })).toBe(false);
		expect(entraGuest({})).toBe(false);
	});
});

describe("fetchEntraSnapshot", () => {
	it("liest Domains, zwei Seiten Konten, MFA und Rollen", async () => {
		const { r, g } = await snapshot(happyRoutes());
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const { accounts, capabilities, domains } = r.value;

		expect(g.urls()).toEqual([
			DOMAINS_PATH,
			USERS_ALL,
			`${NEXT}/users?$skiptoken=seite2`,
			MFA_PATH,
			ROLES_PATH,
		]);
		expect(g.calls.every((c) => c.tenantId === TENANT)).toBe(true);

		expect(domains).toEqual(["contoso.com", "contoso.onmicrosoft.com"]);
		expect(capabilities).toEqual({
			signIn: true,
			mfa: true,
			roles: true,
			leaveDate: true,
		});
		expect(accounts.map((a) => a.externalId)).toEqual([
			"u-anna",
			"u-bob",
			"u-carla",
			"u-dienst",
		]);

		expect(byId(accounts, "u-anna")).toEqual({
			externalId: "u-anna",
			email: "anna@contoso.com",
			displayName: "Anna Admin",
			kind: "member",
			enabled: true,
			isAdmin: true,
			isTopAdmin: true,
			adminRoles: ["Global Administrator", "User Administrator"],
			mfaRegistered: true,
			lastSignInAt: "2026-10-01T08:00:00Z",
			createdAt: "2024-02-01T09:00:00Z",
			leaveAt: null,
		});

		const bob = byId(accounts, "u-bob");
		expect(bob.kind).toBe("guest");
		expect(bob.email).toBe("bob@partner.example");
		expect(bob.mfaRegistered).toBe(false);
		// nicht interaktiv später als interaktiv
		expect(bob.lastSignInAt).toBe("2026-10-20T07:30:00Z");
		expect(bob.isAdmin).toBe(false);
		expect(bob.adminRoles).toEqual([]);

		const carla = byId(accounts, "u-carla");
		expect(carla.kind).toBe("guest");
		expect(carla.email).toBe("carla_firma.de#ext#@contoso.onmicrosoft.com");
		expect(carla.enabled).toBe(false);
		// nicht im Registrierungsbericht = unbekannt
		expect(carla.mfaRegistered).toBeNull();
		expect(carla.lastSignInAt).toBeNull();
		expect(carla.leaveAt).toBe("2026-12-31T00:00:00Z");

		const dienst = byId(accounts, "u-dienst");
		expect(dienst.email).toBeNull();
		expect(dienst.displayName).toBe("u-dienst");
		expect(dienst.kind).toBe("member");
		expect(dienst.enabled).toBe(true);
		expect(dienst.createdAt).toBeNull();
		// 0001-01-01 = nie
		expect(dienst.lastSignInAt).toBeNull();
		expect(dienst.isAdmin).toBe(true);
		expect(dienst.isTopAdmin).toBe(false);
		expect(dienst.adminRoles).toEqual(["User Administrator"]);

		// nur die vereinheitlichten Felder, keine Telefonnummern o. Ä.
		const keys = [
			"adminRoles",
			"createdAt",
			"displayName",
			"email",
			"enabled",
			"externalId",
			"isAdmin",
			"isTopAdmin",
			"kind",
			"lastSignInAt",
			"leaveAt",
			"mfaRegistered",
		];
		for (const a of accounts) expect(Object.keys(a).sort()).toEqual(keys);
		expect(JSON.stringify(r.value)).not.toMatch(/\+49|sp-1|g-1|u-geloescht/);
	});

	it("filtert unbestätigte Domains und verlangt die Form", async () => {
		const routes = happyRoutes();
		routes["/organization"] = [
			json({
				value: [
					{
						verifiedDomains: [
							{ name: "b.example", isVerified: true },
							{ name: "a.example", isVerified: false },
							{ name: "", isVerified: true },
							{ isVerified: true },
						],
					},
				],
			}),
		];
		const { r } = await snapshot(routes);
		expect(r.ok && r.value.domains).toEqual(["b.example"]);

		const bad = happyRoutes();
		bad["/organization"] = [json({ value: [{ verifiedDomains: "x" }] })];
		expect((await snapshot(bad)).r).toEqual({
			ok: false,
			error: "bad_response",
		});
	});

	it("fällt bei 403 auf weniger Felder zurück (Anmeldung, dann Austritt)", async () => {
		const routes = happyRoutes();
		routes["/users?"] = [
			status(403),
			status(403),
			page([ANNA, BOB], `${NEXT}/users?$skiptoken=seite2`),
		];
		const { r, g } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const userCalls = g.urls().filter((u) => u.startsWith("/users?"));
		expect(userCalls).toEqual([USERS_ALL, USERS_SIGNIN, USERS_LEAVE]);
		expect(r.value.capabilities).toMatchObject({
			signIn: false,
			leaveDate: true,
		});
		// selbst wenn Graph Anmeldedaten mitschickte: Fähigkeit fehlt = null
		expect(r.value.accounts.every((a) => a.lastSignInAt === null)).toBe(true);
		expect(byId(r.value.accounts, "u-carla").leaveAt).toBe(
			"2026-12-31T00:00:00Z",
		);
	});

	it("nimmt nur Anmeldedaten, wenn das Austrittsdatum fehlt", async () => {
		const routes = happyRoutes();
		routes["/users?"] = [
			status(403),
			page([ANNA, BOB], `${NEXT}/users?$skiptoken=seite2`),
		];
		const { r, g } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(g.urls().filter((u) => u.startsWith("/users?"))).toEqual([
			USERS_ALL,
			USERS_SIGNIN,
		]);
		expect(r.value.capabilities).toMatchObject({
			signIn: true,
			leaveDate: false,
		});
		expect(byId(r.value.accounts, "u-carla").leaveAt).toBeNull();
		expect(byId(r.value.accounts, "u-anna").lastSignInAt).toBe(
			"2026-10-01T08:00:00Z",
		);
	});

	it("geht bis zur Grundauswahl und meldet danach forbidden", async () => {
		const routes = happyRoutes();
		routes["/users?"] = [
			status(403),
			status(403),
			status(403),
			page([ANNA, BOB], `${NEXT}/users?$skiptoken=seite2`),
		];
		const { r, g } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(g.urls().filter((u) => u.startsWith("/users?"))).toEqual([
			USERS_ALL,
			USERS_SIGNIN,
			USERS_LEAVE,
			USERS_NONE,
		]);
		expect(r.value.capabilities).toMatchObject({
			signIn: false,
			leaveDate: false,
		});

		const denied = happyRoutes();
		denied["/users?"] = [status(403), status(403), status(403), status(403)];
		const res = await snapshot(denied);
		expect(res.r).toEqual({ ok: false, error: "forbidden" });
		expect(res.g.urls().filter((u) => u.startsWith("/users?"))).toHaveLength(4);
	});

	it("403 auf einer späteren Seite ist kein Rückfall", async () => {
		const routes = happyRoutes();
		routes[`${NEXT}/users?$skiptoken`] = [status(403)];
		const { r, g } = await snapshot(routes);
		expect(r).toEqual({ ok: false, error: "forbidden" });
		expect(g.urls().filter((u) => u.startsWith("/users?"))).toEqual([
			USERS_ALL,
		]);
	});

	it("MFA ohne Lizenz oder Recht: Fähigkeit aus, alle unbekannt", async () => {
		const routes = happyRoutes();
		routes["/reports/authenticationMethods/userRegistrationDetails"] = [
			status(403),
		];
		const { r } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.capabilities.mfa).toBe(false);
		expect(r.value.capabilities.roles).toBe(true);
		expect(r.value.accounts.every((a) => a.mfaRegistered === null)).toBe(true);
		expect(byId(r.value.accounts, "u-anna").isTopAdmin).toBe(true);
	});

	it("MFA über mehrere Seiten", async () => {
		const routes = happyRoutes();
		routes["/reports/authenticationMethods/userRegistrationDetails"] = [
			page(
				[{ id: "u-anna", isMfaRegistered: true }],
				`${NEXT}/reports/authenticationMethods/userRegistrationDetails?$skiptoken=2`,
			),
		];
		routes[`${NEXT}/reports/authenticationMethods`] = [
			page([{ id: "u-carla", isMfaRegistered: true }]),
		];
		const { r } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(byId(r.value.accounts, "u-anna").mfaRegistered).toBe(true);
		expect(byId(r.value.accounts, "u-carla").mfaRegistered).toBe(true);
		expect(byId(r.value.accounts, "u-bob").mfaRegistered).toBeNull();
	});

	it("Rollen ohne Recht: Fähigkeit aus, niemand Admin", async () => {
		const routes = happyRoutes();
		routes["/directoryRoles"] = [status(403)];
		const { r } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.capabilities.roles).toBe(false);
		expect(r.value.capabilities.mfa).toBe(true);
		for (const a of r.value.accounts) {
			expect(a.isAdmin).toBe(false);
			expect(a.isTopAdmin).toBe(false);
			expect(a.adminRoles).toEqual([]);
		}
	});

	it("höchstens 10 Rollennamen, sortiert; Admin bleibt Admin", async () => {
		const routes = happyRoutes();
		const many = Array.from({ length: 12 }, (_, i) => ({
			id: `r-${i}`,
			displayName: `${String.fromCharCode(76 - i)} Administrator`,
			roleTemplateId: `t-${i}`,
			members: [{ id: "u-bob" }],
		}));
		routes["/directoryRoles"] = [
			page(many.slice(0, 6), `${NEXT}/directoryRoles?$skiptoken=2`),
		];
		routes[`${NEXT}/directoryRoles`] = [page(many.slice(6))];
		const { r } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const bob = byId(r.value.accounts, "u-bob");
		expect(bob.isAdmin).toBe(true);
		expect(bob.isTopAdmin).toBe(false);
		expect(bob.adminRoles).toHaveLength(10);
		expect(bob.adminRoles[0]).toBe("A Administrator");
		expect(bob.adminRoles).toEqual([...bob.adminRoles].sort());
	});

	it("Lese-Rollen zählen nicht als Verwaltung", async () => {
		const routes = happyRoutes();
		routes["/directoryRoles"] = [
			page([
				{
					id: "r-read",
					displayName: "Directory Readers",
					roleTemplateId: "88d8e3e3-8f55-4a1e-953a-9b9898b8876b",
					members: [{ id: "u-bob" }],
				},
			]),
		];
		const { r } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const bob = byId(r.value.accounts, "u-bob");
		expect(bob.isAdmin).toBe(false);
		expect(bob.adminRoles).toEqual([]);
		expect(entraAdminRole("Security Administrator")).toBe(true);
		expect(entraAdminRole("Global Reader")).toBe(false);
	});

	it("liest Rollen mit 20 und mehr Mitgliedern einzeln nach", async () => {
		const routes = happyRoutes();
		const expanded = Array.from({ length: 20 }, (_, i) => ({
			id: `sp-${i}`,
		}));
		routes["/directoryRoles?"] = [
			json({
				value: [
					{
						id: "r-ga",
						displayName: "Global Administrator",
						roleTemplateId: GLOBAL_ADMIN_TEMPLATE,
						members: expanded,
					},
				],
			}),
		];
		routes["/directoryRoles/r-ga/members"] = [
			page(expanded, `${NEXT}/directoryRoles/r-ga/members?$skiptoken=2`),
		];
		routes[`${NEXT}/directoryRoles/r-ga/members`] = [page([{ id: "u-carla" }])];
		const { r, g } = await snapshot(routes);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(g.urls()).toContain("/directoryRoles/r-ga/members?$select=id");
		const carla = byId(r.value.accounts, "u-carla");
		expect(carla.isTopAdmin).toBe(true);
		expect(carla.adminRoles).toEqual(["Global Administrator"]);
		expect(byId(r.value.accounts, "u-anna").isAdmin).toBe(false);
	});

	it("zu viele Konten", async () => {
		const { r, g } = await snapshot(happyRoutes(), 3);
		expect(r).toEqual({ ok: false, error: "too_many" });
		// bricht nach der zweiten Seite ab, ohne MFA und Rollen zu lesen
		expect(g.urls()).not.toContain(MFA_PATH);
		expect(ENTRA_MAX_ACCOUNTS).toBe(50_000);
	});

	it("zu viele Seiten", async () => {
		let n = 0;
		const routes = happyRoutes();
		routes["/users?"] = () => page([{ ...BOB, id: `u-${n++}` }], `${NEXT}/x`);
		routes[`${NEXT}/x`] = () =>
			page([{ ...BOB, id: `u-${n++}` }], `${NEXT}/x?$skiptoken=${n}`);
		const { r, g } = await snapshot(routes);
		expect(r).toEqual({ ok: false, error: "too_many" });
		expect(g.urls().filter((u) => u !== DOMAINS_PATH)).toHaveLength(200);
	});

	it("bildet Statuscodes und Client-Fehler ab", async () => {
		const cases: [string, Reply, string][] = [
			["/organization", status(401), "token_failed"],
			["/organization", status(403), "forbidden"],
			["/users?", status(429), "throttled"],
			["/users?", status(401), "token_failed"],
			["/users?", status(500), "bad_response"],
			["/users?", status(404), "bad_response"],
			[
				"/reports/authenticationMethods/userRegistrationDetails",
				status(500),
				"bad_response",
			],
			[
				"/reports/authenticationMethods/userRegistrationDetails",
				status(429),
				"throttled",
			],
			["/directoryRoles", status(401), "token_failed"],
			["/directoryRoles", status(503), "bad_response"],
			["/organization", { ok: false, error: "timeout" }, "timeout"],
			["/users?", { ok: false, error: "host_not_allowed" }, "host_not_allowed"],
			["/directoryRoles", { ok: false, error: "throttled" }, "throttled"],
		];
		for (const [path, reply, error] of cases) {
			const routes = happyRoutes();
			routes[path] = [reply];
			const { r } = await snapshot(routes);
			expect(r, `${path} ${JSON.stringify(reply)}`).toEqual({
				ok: false,
				error,
			});
		}
	});

	it("unlesbares JSON oder falsche Form = bad_response", async () => {
		const cases: [string, Reply][] = [
			["/organization", json("kein json")],
			["/organization", json({ wert: [] })],
			["/users?", json("{")],
			["/users?", json({ value: {} })],
			["/users?", json({ value: [{ displayName: "ohne id" }] })],
			["/users?", json({ value: [ANNA], "@odata.nextLink": 42 })],
			[
				"/reports/authenticationMethods/userRegistrationDetails",
				json("<html>"),
			],
			["/directoryRoles", json({ value: [{ id: "r", members: "x" }] })],
			["/directoryRoles", json(null)],
		];
		for (const [path, reply] of cases) {
			const routes = happyRoutes();
			routes[path] = [reply];
			const { r } = await snapshot(routes);
			expect(r, `${path} ${JSON.stringify(reply)}`).toEqual({
				ok: false,
				error: "bad_response",
			});
		}
	});
});
