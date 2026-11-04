import type { GoogleGet } from "@/lib/google/client";
import type {
	ProviderAccount,
	ProviderError,
	ProviderResult,
	ProviderSnapshot,
} from "@/lib/identity/types";

// Google Workspace, nur lesend (Teil D I3): Directory API über ein
// Dienstkonto mit domänenweiter Delegierung, „subject“ = Admin-Adresse der
// Kundin. Übernommen wird nur, was ProviderAccount braucht: nie
// Rohantworten, Telefonnummern, Adressen, Gruppen oder Organisationen.
// Felder und Grenzen nach der Admin-SDK-Doku (Stand 11/2026, prüfen).

export const GOOGLE_MAX_ACCOUNTS = 50_000;
const MAX_PAGES = 120;
const USER_FIELDS =
	"nextPageToken,users(id,primaryEmail,name/fullName,suspended,archived,isAdmin,isDelegatedAdmin,isEnrolledIn2Sv,lastLoginTime,creationTime)";

type Fail = { ok: false; error: ProviderError };

const parse = <T>(body: string): T | null => {
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
};

const statusError = (status: number): ProviderError =>
	status === 401 || status === 403 ? "forbidden" : "bad_response";

export type GoogleCustomer = { customerId: string; domains: string[] };

// Kundennummer und bestätigte Domains (Haupt- und weitere Domains)
export async function googleCustomer(
	get: GoogleGet,
	subject: string,
): Promise<ProviderResult<GoogleCustomer>> {
	const c = await get(
		subject,
		"/admin/directory/v1/customers/my_customer?fields=id",
	);
	if (!c.ok) return c;
	if (c.value.status !== 200)
		return { ok: false, error: statusError(c.value.status) };
	const id = parse<{ id?: unknown }>(c.value.body)?.id;
	if (typeof id !== "string" || !/^[A-Za-z0-9]{3,40}$/.test(id))
		return { ok: false, error: "bad_response" };
	const d = await get(
		subject,
		"/admin/directory/v1/customer/my_customer/domains?fields=domains(domainName,verified)",
	);
	if (!d.ok) return d;
	if (d.value.status !== 200)
		return { ok: false, error: statusError(d.value.status) };
	const list = parse<{
		domains?: { domainName?: unknown; verified?: unknown }[];
	}>(d.value.body)?.domains;
	if (!Array.isArray(list)) return { ok: false, error: "bad_response" };
	const domains = [
		...new Set(
			list
				.filter((x) => x.verified === true && typeof x.domainName === "string")
				.map((x) => (x.domainName as string).toLowerCase()),
		),
	].slice(0, 50);
	return { ok: true, value: { customerId: id, domains } };
}

// Bindung Kundin ↔ Org: eine Inhaber:in der Org hat eine Adresse aus einer
// bestätigten Domain und ist im Verzeichnis ein eigenes, aktives Konto.
// Sonst könnte eine Org die Admin-Adresse einer fremden Firma eintragen,
// die Klick schon freigegeben hat.
export async function googleBound(
	get: GoogleGet,
	subject: string,
	domains: readonly string[],
	ownerEmails: readonly string[],
): Promise<boolean> {
	for (const raw of ownerEmails.slice(0, 20)) {
		const email = raw.toLowerCase();
		const domain = email.slice(email.lastIndexOf("@") + 1);
		if (!domains.includes(domain)) continue;
		const r = await get(
			subject,
			`/admin/directory/v1/users/${encodeURIComponent(email)}?fields=primaryEmail,suspended,archived`,
		);
		if (!r.ok || r.value.status !== 200) continue;
		const u = parse<{
			primaryEmail?: string;
			suspended?: boolean;
			archived?: boolean;
		}>(r.value.body);
		if (u?.primaryEmail?.toLowerCase() === email && !u.suspended && !u.archived)
			return true;
	}
	return false;
}

type GoogleUser = {
	id?: unknown;
	primaryEmail?: unknown;
	name?: { fullName?: unknown };
	suspended?: unknown;
	archived?: unknown;
	isAdmin?: unknown;
	isDelegatedAdmin?: unknown;
	isEnrolledIn2Sv?: unknown;
	lastLoginTime?: unknown;
	creationTime?: unknown;
};

const iso = (v: unknown): string | null => {
	if (typeof v !== "string") return null;
	// „nie angemeldet“ meldet Google als Epoche
	if (v.startsWith("1970-01-01")) return null;
	return Number.isNaN(Date.parse(v)) ? null : v;
};

export function googleAccount(u: GoogleUser): ProviderAccount | null {
	if (typeof u.id !== "string" || u.id.length === 0) return null;
	const email =
		typeof u.primaryEmail === "string" ? u.primaryEmail.toLowerCase() : null;
	const top = u.isAdmin === true;
	const delegated = u.isDelegatedAdmin === true;
	const fullName =
		typeof u.name?.fullName === "string" && u.name.fullName.trim()
			? u.name.fullName.trim()
			: null;
	return {
		externalId: u.id,
		email,
		displayName: (fullName ?? email ?? u.id).slice(0, 200),
		// Google kennt keine Gastkonten im Verzeichnis
		kind: "member",
		enabled: u.suspended !== true && u.archived !== true,
		isAdmin: top || delegated,
		isTopAdmin: top,
		adminRoles: top ? ["Super Admin"] : delegated ? ["Delegated Admin"] : [],
		mfaRegistered:
			typeof u.isEnrolledIn2Sv === "boolean" ? u.isEnrolledIn2Sv : null,
		lastSignInAt: iso(u.lastLoginTime),
		createdAt: iso(u.creationTime),
		leaveAt: null,
	};
}

// `expectCustomer` = gespeicherte Kundennummer: gehört die Admin-Adresse
// inzwischen zu einer anderen Kundin, liest Klick nichts
export async function fetchGoogleSnapshot(
	get: GoogleGet,
	subject: string,
	expectCustomer?: string,
): Promise<ProviderResult<ProviderSnapshot>> {
	const customer = await googleCustomer(get, subject);
	if (!customer.ok) return customer;
	if (
		expectCustomer !== undefined &&
		customer.value.customerId.toLowerCase() !== expectCustomer.toLowerCase()
	)
		return { ok: false, error: "tenant_mismatch" };
	const accounts: ProviderAccount[] = [];
	let token: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const path = `/admin/directory/v1/users?customer=my_customer&maxResults=500&projection=basic&orderBy=email&fields=${encodeURIComponent(USER_FIELDS)}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
		const r = await get(subject, path);
		if (!r.ok) return r as Fail;
		if (r.value.status !== 200)
			return { ok: false, error: statusError(r.value.status) };
		const body = parse<{ users?: GoogleUser[]; nextPageToken?: unknown }>(
			r.value.body,
		);
		if (!body) return { ok: false, error: "bad_response" };
		for (const u of body.users ?? []) {
			const a = googleAccount(u);
			if (a) accounts.push(a);
			if (accounts.length > GOOGLE_MAX_ACCOUNTS)
				return { ok: false, error: "too_many" };
		}
		token =
			typeof body.nextPageToken === "string" && body.nextPageToken
				? body.nextPageToken
				: null;
		if (!token) break;
		if (page === MAX_PAGES - 1) return { ok: false, error: "too_many" };
	}
	return {
		ok: true,
		value: {
			accounts,
			domains: customer.value.domains,
			// Google liefert letzte Anmeldung, 2SV und Admin-Rollen ohne
			// eigene Lizenz; ein Austrittsdatum gibt es nicht
			capabilities: { signIn: true, mfa: true, roles: true, leaveDate: false },
		},
	};
}
