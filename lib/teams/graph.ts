import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import type { TeamsConfig } from "./config";
import type { TeamsHttpError, TeamsHttpRequest, TeamsTransport } from "./http";

// Microsoft Graph für Hinweise im Aktivitätsfeed von Teams (T5). Ohne SDK:
// Token je Tenant über Client-Credentials (Zertifikat oder Geheimnis), Konto
// über die E-Mail finden, App für die Person installieren, Hinweis senden.
// Endpunkte und Felder nach Microsoft Learn (Stand 10/2026, prüfen).

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const ACTIVITY_TYPE = "klickHinweis";

export type GraphError =
	| TeamsHttpError
	| "token_failed"
	| "consent_missing"
	| "user_not_found"
	| "app_not_in_catalog"
	| "install_failed"
	| "send_failed"
	| "throttled";

export type GraphResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: GraphError };

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function pemBlock(pem: string, label: RegExp): string | null {
	const m = pem.match(
		new RegExp(`-----BEGIN (${label.source})-----[\\s\\S]+?-----END \\1-----`),
	);
	return m ? m[0] : null;
}

// Signierte Client-Assertion (RFC 7523) für die Anmeldung mit Zertifikat
export function clientAssertion(
	clientId: string,
	tenantId: string,
	pem: string,
	nowMs: number,
	jti: string = randomUUID(),
): string {
	const cert = pemBlock(pem, /CERTIFICATE/);
	const key = pemBlock(pem, /(?:RSA |EC |ENCRYPTED )?PRIVATE KEY/);
	if (!cert || !key) throw new Error("teams_cert_invalid");
	const der = Buffer.from(
		cert.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
		"base64",
	);
	const header = {
		alg: "RS256",
		typ: "JWT",
		x5t: b64url(createHash("sha1").update(der).digest()),
	};
	const now = Math.floor(nowMs / 1000);
	const payload = {
		aud: `${LOGIN}/${tenantId}/oauth2/v2.0/token`,
		iss: clientId,
		sub: clientId,
		jti,
		nbf: now - 30,
		exp: now + 600,
	};
	const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const sig = sign("sha256", Buffer.from(data), createPrivateKey(key));
	return `${data}.${b64url(sig)}`;
}

export function tokenRequest(
	config: TeamsConfig,
	tenantId: string,
	nowMs: number,
): TeamsHttpRequest {
	const form = new URLSearchParams({
		client_id: config.clientId,
		scope: "https://graph.microsoft.com/.default",
		grant_type: "client_credentials",
	});
	if (config.credential.kind === "certificate") {
		form.set(
			"client_assertion_type",
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		form.set(
			"client_assertion",
			clientAssertion(config.clientId, tenantId, config.credential.pem, nowMs),
		);
	} else form.set("client_secret", config.credential.secret);
	return {
		method: "POST",
		url: `${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form.toString(),
	};
}

// Link aus dem Hinweis: öffnet die Klick-Seite in Teams (Stage-Ansicht), von
// dort mit einem Klick im Browser. Nur Adressen der eigenen Instanz.
export function stageDeepLink(appId: string, webUrl: string): string {
	const context = JSON.stringify({
		contentUrl: webUrl,
		websiteUrl: webUrl,
		name: "Klick",
	});
	return `https://teams.microsoft.com/l/stage/${appId}/0?context=${encodeURIComponent(context)}`;
}

export function activityBody(
	item: { title: string; webUrl: string },
	appId: string,
): Record<string, unknown> {
	const title =
		item.title.length > 150 ? `${item.title.slice(0, 149)}…` : item.title;
	return {
		topic: {
			source: "text",
			value: "Klick",
			webUrl: stageDeepLink(appId, item.webUrl),
		},
		activityType: ACTIVITY_TYPE,
		previewText: { content: title },
		templateParameters: [{ name: "title", value: title }],
	};
}

const odataQuote = (v: string) => v.replace(/'/g, "''");

export type GraphClient = ReturnType<typeof createGraphClient>;

export function createGraphClient(
	config: TeamsConfig,
	transport: TeamsTransport,
	now: () => number = Date.now,
) {
	const tokens = new Map<string, { token: string; exp: number }>();

	async function token(tenantId: string): Promise<GraphResult<string>> {
		const hit = tokens.get(tenantId);
		if (hit && hit.exp - 60_000 > now()) return { ok: true, value: hit.token };
		let req: TeamsHttpRequest;
		try {
			req = tokenRequest(config, tenantId, now());
		} catch {
			return { ok: false, error: "token_failed" };
		}
		const r = await transport(req);
		if (!r.ok) return r;
		if (r.res.status !== 200) {
			// AADSTS65001/7000229: im Tenant nicht freigegeben
			return {
				ok: false,
				error: /AADSTS(65001|7000229|700016)/.test(r.res.body)
					? "consent_missing"
					: "token_failed",
			};
		}
		try {
			const j = JSON.parse(r.res.body) as {
				access_token?: string;
				expires_in?: number;
			};
			if (!j.access_token) return { ok: false, error: "token_failed" };
			tokens.set(tenantId, {
				token: j.access_token,
				exp: now() + (j.expires_in ?? 3600) * 1000,
			});
			return { ok: true, value: j.access_token };
		} catch {
			return { ok: false, error: "token_failed" };
		}
	}

	async function call(
		tenantId: string,
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	): Promise<GraphResult<{ status: number; body: string }>> {
		const t = await token(tenantId);
		if (!t.ok) return t;
		const r = await transport({
			method,
			url: `${GRAPH}${path}`,
			headers: {
				authorization: `Bearer ${t.value}`,
				...(body ? { "content-type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!r.ok) return r;
		if (r.res.status === 401) tokens.delete(tenantId);
		if (r.res.status === 429) return { ok: false, error: "throttled" };
		return { ok: true, value: r.res };
	}

	const parse = <T>(body: string): T | null => {
		try {
			return JSON.parse(body) as T;
		} catch {
			return null;
		}
	};

	return {
		token,

		async findUser(
			tenantId: string,
			email: string,
		): Promise<GraphResult<string>> {
			const direct = await call(
				tenantId,
				"GET",
				`/users/${encodeURIComponent(email)}?$select=id`,
			);
			if (!direct.ok) return direct;
			if (direct.value.status === 200) {
				const id = parse<{ id?: string }>(direct.value.body)?.id;
				if (id) return { ok: true, value: id };
			}
			const q = encodeURIComponent(`mail eq '${odataQuote(email)}'`);
			const list = await call(
				tenantId,
				"GET",
				`/users?$filter=${q}&$select=id&$top=2`,
			);
			if (!list.ok) return list;
			const v = parse<{ value?: { id: string }[] }>(list.value.body)?.value;
			return v?.length === 1 && v[0]
				? { ok: true, value: v[0].id }
				: { ok: false, error: "user_not_found" };
		},

		async findCatalogApp(tenantId: string): Promise<GraphResult<string>> {
			const q = encodeURIComponent(
				`externalId eq '${odataQuote(config.appId)}'`,
			);
			const r = await call(
				tenantId,
				"GET",
				`/appCatalogs/teamsApps?$filter=${q}&$select=id`,
			);
			if (!r.ok) return r;
			const id = parse<{ value?: { id: string }[] }>(r.value.body)?.value?.[0]
				?.id;
			return id
				? { ok: true, value: id }
				: { ok: false, error: "app_not_in_catalog" };
		},

		async installApp(
			tenantId: string,
			userObjectId: string,
			catalogAppId: string,
		): Promise<GraphResult<true>> {
			const r = await call(
				tenantId,
				"POST",
				`/users/${encodeURIComponent(userObjectId)}/teamwork/installedApps`,
				{
					"teamsApp@odata.bind": `${GRAPH}/appCatalogs/teamsApps/${catalogAppId}`,
				},
			);
			if (!r.ok) return r;
			// 409 = schon installiert
			return r.value.status === 201 || r.value.status === 409
				? { ok: true, value: true }
				: { ok: false, error: "install_failed" };
		},

		async sendActivity(
			tenantId: string,
			userObjectId: string,
			item: { title: string; webUrl: string },
		): Promise<GraphResult<true>> {
			const r = await call(
				tenantId,
				"POST",
				`/users/${encodeURIComponent(userObjectId)}/teamwork/sendActivityNotification`,
				activityBody(item, config.appId),
			);
			if (!r.ok) return r;
			return r.value.status === 204 || r.value.status === 200
				? { ok: true, value: true }
				: { ok: false, error: "send_failed" };
		},
	};
}
