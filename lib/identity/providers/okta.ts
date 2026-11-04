import type {
	ProviderAccount,
	ProviderError,
	ProviderResult,
	ProviderSnapshot,
} from "@/lib/identity/types";
import type { OktaGet } from "@/lib/okta/client";

// Okta, nur lesend (Teil D I4): Management API mit einem API-Token einer
// Person mit Leserechten. Übernommen wird nur, was ProviderAccount braucht:
// nie Rohantworten, Telefonnummern, Adressen, Gruppen oder Anmeldeprotokolle.
// Felder und Grenzen nach der Okta-Doku (Stand 11/2026, prüfen).

export const OKTA_MAX_ACCOUNTS = 50_000;
// Faktoren gibt es nur je Konto: bis hierhin fragt Klick sie ab, darüber
// ist die MFA-Prüfung nicht bewertbar (Drosselung der Okta-API)
export const OKTA_MFA_LOOKUP_MAX = 2_000;
const OKTA_ADMIN_LOOKUP_MAX = 500;
const MAX_PAGES = 300;

// Faktoren, die nicht als zweiter Faktor zählen
const WEAK_FACTORS = new Set(["email", "question", "password"]);

type Fail = { ok: false; error: ProviderError };

const parse = <T>(body: string): T | null => {
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
};

const statusError = (status: number): ProviderError =>
	status === 403 ? "forbidden" : "bad_response";

// Anmelden können: aktiv, Kennwort abgelaufen, Wiederherstellung, kurz
// gesperrt, angelegt mit offener Aktivierung. Nicht: STAGED, SUSPENDED,
// DEPROVISIONED
const ENABLED = new Set([
	"ACTIVE",
	"PASSWORD_EXPIRED",
	"RECOVERY",
	"LOCKED_OUT",
	"PROVISIONED",
]);

type OktaUser = {
	id?: unknown;
	status?: unknown;
	created?: unknown;
	lastLogin?: unknown;
	profile?: {
		login?: unknown;
		email?: unknown;
		firstName?: unknown;
		lastName?: unknown;
		displayName?: unknown;
	};
};

const str = (v: unknown): string | null =>
	typeof v === "string" && v.trim() ? v.trim() : null;

const iso = (v: unknown): string | null => {
	const s = str(v);
	return s && !Number.isNaN(Date.parse(s)) ? s : null;
};

export function oktaAccount(u: OktaUser): ProviderAccount | null {
	const id = str(u.id);
	if (!id) return null;
	const login = str(u.profile?.login)?.toLowerCase() ?? null;
	const mail = str(u.profile?.email)?.toLowerCase() ?? null;
	const email = mail ?? (login?.includes("@") ? login : null);
	const full = [str(u.profile?.firstName), str(u.profile?.lastName)]
		.filter(Boolean)
		.join(" ");
	return {
		externalId: id,
		email,
		displayName: (
			str(u.profile?.displayName) ??
			(full || null) ??
			login ??
			id
		).slice(0, 200),
		// Okta kennt keine Gastkonten im Verzeichnis
		kind: "member",
		enabled: typeof u.status === "string" && ENABLED.has(u.status),
		isAdmin: false,
		isTopAdmin: false,
		adminRoles: [],
		mfaRegistered: null,
		lastSignInAt: iso(u.lastLogin),
		createdAt: iso(u.created),
		leaveAt: null,
	};
}

// Bindung Okta ↔ Org: eine Inhaber:in der Org ist dort ein aktives Konto
// (Anmeldename bzw. Adresse gleich). Liefert die Domains dieser Adressen;
// leer = nicht gebunden.
export async function oktaBound(
	get: OktaGet,
	ownerEmails: readonly string[],
): Promise<string[]> {
	const domains = new Set<string>();
	for (const raw of ownerEmails.slice(0, 20)) {
		const email = raw.toLowerCase();
		const r = await get(`/api/v1/users/${encodeURIComponent(email)}`);
		if (!r.ok || r.value.status !== 200) continue;
		const u = parse<OktaUser>(r.value.body);
		const login = str(u?.profile?.login)?.toLowerCase();
		const mail = str(u?.profile?.email)?.toLowerCase();
		if (u?.status === "ACTIVE" && (login === email || mail === email))
			domains.add(email.slice(email.lastIndexOf("@") + 1));
	}
	return [...domains];
}

// Mindestens ein aktiver Faktor, der als zweiter Faktor zählt
export function strongFactor(
	factors: { factorType?: unknown; status?: unknown }[],
): boolean {
	return factors.some(
		(f) =>
			f.status === "ACTIVE" &&
			typeof f.factorType === "string" &&
			!WEAK_FACTORS.has(f.factorType),
	);
}

type Admin = { top: boolean; roles: string[] };

// Konten mit direkt zugewiesener Admin-Rolle; null = Recht fehlt
async function oktaAdmins(
	get: OktaGet,
): Promise<ProviderResult<Map<string, Admin> | null>> {
	const ids: string[] = [];
	let path: string | null = "/api/v1/iam/assignees/users?limit=200";
	for (let page = 0; path && page < 20; page += 1) {
		const r = await get(path);
		if (!r.ok) return r as Fail;
		if (r.value.status === 403 || r.value.status === 404)
			return { ok: true, value: null };
		if (r.value.status !== 200)
			return { ok: false, error: statusError(r.value.status) };
		const body = parse<{
			value?: { id?: unknown }[];
			_links?: { next?: { href?: unknown } };
		}>(r.value.body);
		if (!body || !Array.isArray(body.value))
			return { ok: false, error: "bad_response" };
		for (const a of body.value) if (typeof a.id === "string") ids.push(a.id);
		const href = body._links?.next?.href;
		path = r.value.next ?? (typeof href === "string" ? href : null);
	}
	const admins = new Map<string, Admin>();
	for (const id of ids.slice(0, OKTA_ADMIN_LOOKUP_MAX)) {
		const r = await get(`/api/v1/users/${encodeURIComponent(id)}/roles`);
		if (!r.ok) return r as Fail;
		if (r.value.status === 403) return { ok: true, value: null };
		if (r.value.status !== 200) continue;
		const roles = parse<
			{ type?: unknown; label?: unknown; status?: unknown }[]
		>(r.value.body);
		if (!Array.isArray(roles)) continue;
		const active = roles.filter((x) => x.status !== "INACTIVE");
		if (active.length === 0) continue;
		admins.set(id, {
			top: active.some((x) => x.type === "SUPER_ADMIN"),
			roles: active
				.map((x) => str(x.label) ?? str(x.type))
				.filter((x): x is string => Boolean(x))
				.slice(0, 10),
		});
	}
	return { ok: true, value: admins };
}

// `domains` = Domains für die Zuordnung (aus der Bindung und bestätigten
// SSO-Domains der Org); Okta kennt keine bestätigten E-Mail-Domains
export async function fetchOktaSnapshot(
	get: OktaGet,
	domains: readonly string[],
): Promise<ProviderResult<ProviderSnapshot>> {
	const accounts: ProviderAccount[] = [];
	let path: string | null = "/api/v1/users?limit=200";
	for (let page = 0; path; page += 1) {
		if (page >= MAX_PAGES) return { ok: false, error: "too_many" };
		const r = await get(path);
		if (!r.ok) return r as Fail;
		if (r.value.status !== 200)
			return { ok: false, error: statusError(r.value.status) };
		const users = parse<OktaUser[]>(r.value.body);
		if (!Array.isArray(users)) return { ok: false, error: "bad_response" };
		for (const u of users) {
			const a = oktaAccount(u);
			if (a) accounts.push(a);
			if (accounts.length > OKTA_MAX_ACCOUNTS)
				return { ok: false, error: "too_many" };
		}
		path = r.value.next;
	}

	const admins = await oktaAdmins(get);
	if (!admins.ok) return admins;
	if (admins.value)
		for (const a of accounts) {
			const x = admins.value.get(a.externalId);
			if (!x) continue;
			a.isAdmin = true;
			a.isTopAdmin = x.top;
			a.adminRoles = x.roles;
		}

	// Faktoren nur für Konten, die sich anmelden können, und nur bis zur
	// Obergrenze; darüber ist MFA nicht bewertbar
	const enabled = accounts.filter((a) => a.enabled);
	let mfa = enabled.length <= OKTA_MFA_LOOKUP_MAX;
	if (mfa)
		for (const a of enabled) {
			const r = await get(
				`/api/v1/users/${encodeURIComponent(a.externalId)}/factors`,
			);
			if (!r.ok) return r as Fail;
			if (r.value.status === 403) {
				mfa = false;
				break;
			}
			if (r.value.status !== 200) continue;
			const factors = parse<{ factorType?: unknown; status?: unknown }[]>(
				r.value.body,
			);
			if (Array.isArray(factors)) a.mfaRegistered = strongFactor(factors);
		}
	if (!mfa) for (const a of accounts) a.mfaRegistered = null;

	return {
		ok: true,
		value: {
			accounts,
			domains: [...new Set(domains.map((d) => d.toLowerCase()))],
			capabilities: {
				signIn: true,
				mfa,
				roles: admins.value !== null,
				leaveDate: false,
			},
		},
	};
}
