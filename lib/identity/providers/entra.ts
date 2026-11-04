import type {
	ProviderAccount,
	ProviderCapabilities,
	ProviderError,
	ProviderResult,
	ProviderSnapshot,
} from "@/lib/identity/types";
import type { MsGet } from "@/lib/microsoft/types";

// Microsoft Entra ID, nur lesend (Identität anbinden, Teil D): Antworten von
// Microsoft Graph werden zur vereinheitlichten Momentaufnahme. Ohne SDK; Token,
// Host-Prüfung (auch für @odata.nextLink) und Warten bei 429 liegen im Client
// (MsGet). Übernommen wird nur, was ProviderAccount braucht: nie Rohantworten,
// Telefonnummern, IP-Adressen oder Gruppen. Endpunkte, Felder und Grenzen nach
// Microsoft Learn (Stand 11/2026, prüfen).

export const ENTRA_MAX_ACCOUNTS = 50_000;
// Rollenvorlage „Global Administrator“, in jedem Tenant gleich
export const GLOBAL_ADMIN_TEMPLATE = "62e90394-69f5-4237-9190-012177145e10";

// Sicherheitsstopp je Liste (Seiten über @odata.nextLink)
const MAX_PAGES = 200;
// $expand liefert bei Verzeichnisobjekten höchstens 20 Einträge und keinen
// nextLink: Rollen mit so vielen Mitgliedern werden einzeln nachgelesen
const EXPAND_LIMIT = 20;
const MAX_ROLE_NAMES = 10;

const DOMAINS_PATH = "/organization?$select=verifiedDomains";
const USER_FIELDS =
	"id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime";
const MFA_PATH =
	"/reports/authenticationMethods/userRegistrationDetails?$select=id,isMfaRegistered&$top=999";
const ROLES_PATH =
	"/directoryRoles?$select=id,displayName,roleTemplateId&$expand=members($select=id)";

// Felder, die Lizenz oder Recht brauchen: signInActivity (Entra ID P1 +
// AuditLog.Read.All), employeeLeaveDateTime (User-LifeCycleInfo.Read.All).
// Bei 403 auf der ersten Seite der Reihe nach weniger anfragen.
type UserVariant = { signIn: boolean; leaveDate: boolean };
const USER_VARIANTS: readonly UserVariant[] = [
	{ signIn: true, leaveDate: true },
	{ signIn: true, leaveDate: false },
	{ signIn: false, leaveDate: true },
	{ signIn: false, leaveDate: false },
];

function usersPath(v: UserVariant): string {
	const fields = [USER_FIELDS];
	if (v.signIn) fields.push("signInActivity");
	if (v.leaveDate) fields.push("employeeLeaveDateTime");
	return `/users?$select=${fields.join(",")}&$top=999`;
}

type Rec = Record<string, unknown>;
type Item = Rec & { id: string };
type Fail = { ok: false; error: ProviderError };
type UserRow = Omit<
	ProviderAccount,
	"isAdmin" | "isTopAdmin" | "adminRoles" | "mfaRegistered"
>;
type RoleInfo = { names: Set<string>; top: boolean };

const fail = (error: ProviderError): Fail => ({ ok: false, error });

function statusError(status: number): ProviderError {
	if (status === 401) return "token_failed";
	if (status === 403) return "forbidden";
	if (status === 429) return "throttled";
	return "bad_response";
}

const isRec = (v: unknown): v is Rec =>
	typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(body: string): unknown {
	try {
		return JSON.parse(body);
	} catch {
		return undefined;
	}
}

const str = (v: unknown): string | null =>
	typeof v === "string" && v.trim() !== "" ? v.trim() : null;

// ISO-Zeitpunkt wie geliefert; unlesbar oder vor 1970 (Graph meldet „nie“
// teils als 0001-01-01) = unbekannt
function iso(v: unknown): string | null {
	const s = str(v);
	if (!s) return null;
	const t = Date.parse(s);
	return Number.isFinite(t) && t > 0 ? s : null;
}

// Gast: userType „Guest“ oder eingeladenes Konto („…#EXT#@…“ im Anmeldenamen)
export function entraGuest(u: {
	userType?: string | null;
	userPrincipalName?: string | null;
}): boolean {
	return (
		(u.userType ?? "").toLowerCase() === "guest" ||
		(u.userPrincipalName ?? "").toUpperCase().includes("#EXT#")
	);
}

// Letzte Anmeldung: die spätere aus interaktiv und nicht interaktiv
function lastSignIn(activity: unknown): string | null {
	if (!isRec(activity)) return null;
	const a = iso(activity.lastSignInDateTime);
	const b = iso(activity.lastNonInteractiveSignInDateTime);
	if (!a) return b;
	if (!b) return a;
	return Date.parse(b) > Date.parse(a) ? b : a;
}

function toUserRow(u: Item, v: UserVariant): UserRow {
	const upn = str(u.userPrincipalName);
	const email = (str(u.mail) ?? upn)?.toLowerCase() ?? null;
	return {
		externalId: u.id,
		email,
		displayName: str(u.displayName) ?? email ?? u.id,
		kind: entraGuest({ userType: str(u.userType), userPrincipalName: upn })
			? "guest"
			: "member",
		enabled: u.accountEnabled !== false,
		lastSignInAt: v.signIn ? lastSignIn(u.signInActivity) : null,
		createdAt: iso(u.createdDateTime),
		leaveAt: v.leaveDate ? iso(u.employeeLeaveDateTime) : null,
	};
}

// Eine Seite einer Graph-Liste: { value: [{ id, … }], "@odata.nextLink"? }
function parsePage(
	body: string,
): { items: Item[]; next: string | null } | null {
	const j = parseJson(body);
	if (!isRec(j) || !Array.isArray(j.value)) return null;
	const next = j["@odata.nextLink"];
	if (next != null && typeof next !== "string") return null;
	const items: Item[] = [];
	for (const v of j.value) {
		if (!isRec(v) || typeof v.id !== "string" || v.id === "") return null;
		items.push(v as Item);
	}
	return { items, next: next ? next : null };
}

type ListResult = { ok: true } | (Fail & { firstForbidden: boolean });

// Liest alle Seiten; visit bekommt jede Seite und kann mit einem Fehler
// abbrechen. firstForbidden = 403 schon auf der ersten Seite (fehlende
// Lizenz bzw. fehlendes Recht, für Rückfälle und Fähigkeiten).
async function listAll(
	get: MsGet,
	tenantId: string,
	path: string,
	visit: (items: Item[]) => ProviderError | null,
): Promise<ListResult> {
	let next: string | null = path;
	for (let page = 0; next !== null; page++) {
		if (page >= MAX_PAGES)
			return { ...fail("too_many"), firstForbidden: false };
		const r = await get(tenantId, next);
		if (!r.ok) return { ...fail(r.error), firstForbidden: false };
		const { status, body } = r.value;
		if (status !== 200) {
			return {
				...fail(statusError(status)),
				firstForbidden: page === 0 && status === 403,
			};
		}
		const p = parsePage(body);
		if (!p) return { ...fail("bad_response"), firstForbidden: false };
		const stop = visit(p.items);
		if (stop) return { ...fail(stop), firstForbidden: false };
		next = p.next;
	}
	return { ok: true };
}

// Bestätigte Domains des Tenants. verifiedDomain trägt laut Learn kein
// isVerified (alles in der Liste ist bestätigt): fehlt es, zählt die Domain,
// nur ausdrücklich false fällt heraus.
async function fetchDomains(
	get: MsGet,
	tenantId: string,
): Promise<ProviderResult<string[]>> {
	const r = await get(tenantId, DOMAINS_PATH);
	if (!r.ok) return fail(r.error);
	if (r.value.status !== 200) return fail(statusError(r.value.status));
	const j = parseJson(r.value.body);
	if (!isRec(j) || !Array.isArray(j.value)) return fail("bad_response");
	const out = new Set<string>();
	for (const org of j.value) {
		if (!isRec(org)) return fail("bad_response");
		const list = org.verifiedDomains ?? [];
		if (!Array.isArray(list)) return fail("bad_response");
		for (const d of list) {
			if (!isRec(d)) return fail("bad_response");
			const name = str(d.name);
			if (name && d.isVerified !== false) out.add(name.toLowerCase());
		}
	}
	return { ok: true, value: [...out].sort() };
}

async function fetchUsers(
	get: MsGet,
	tenantId: string,
	maxAccounts: number,
): Promise<ProviderResult<{ rows: UserRow[]; variant: UserVariant }>> {
	for (const [i, variant] of USER_VARIANTS.entries()) {
		const rows: UserRow[] = [];
		const seen = new Set<string>();
		const r = await listAll(get, tenantId, usersPath(variant), (items) => {
			for (const u of items) {
				if (seen.has(u.id)) continue;
				seen.add(u.id);
				rows.push(toUserRow(u, variant));
			}
			return rows.length > maxAccounts ? "too_many" : null;
		});
		if (r.ok) return { ok: true, value: { rows, variant } };
		const last = i === USER_VARIANTS.length - 1;
		if (!r.firstForbidden || last) return fail(r.error);
	}
	return fail("forbidden");
}

// MFA-Registrierung je Konto; null = Fähigkeit fehlt (Lizenz oder Recht)
async function fetchMfa(
	get: MsGet,
	tenantId: string,
	userIds: ReadonlySet<string>,
): Promise<ProviderResult<Map<string, boolean> | null>> {
	const mfa = new Map<string, boolean>();
	const r = await listAll(get, tenantId, MFA_PATH, (items) => {
		for (const it of items) {
			if (userIds.has(it.id) && typeof it.isMfaRegistered === "boolean")
				mfa.set(it.id, it.isMfaRegistered);
		}
		return null;
	});
	if (r.ok) return { ok: true, value: mfa };
	return r.firstForbidden ? { ok: true, value: null } : fail(r.error);
}

// Rollen je Konto; Mitglieder, die keine Konten aus der Liste sind
// (Dienstprinzipale, Gruppen), fallen heraus. null = Fähigkeit fehlt.
async function fetchRoles(
	get: MsGet,
	tenantId: string,
	userIds: ReadonlySet<string>,
): Promise<ProviderResult<Map<string, RoleInfo> | null>> {
	const roles: Item[] = [];
	const r = await listAll(get, tenantId, ROLES_PATH, (items) => {
		roles.push(...items);
		return null;
	});
	if (!r.ok)
		return r.firstForbidden ? { ok: true, value: null } : fail(r.error);

	const out = new Map<string, RoleInfo>();
	for (const role of roles) {
		const members = role.members ?? [];
		if (!Array.isArray(members)) return fail("bad_response");
		let memberIds: string[] = [];
		for (const m of members) {
			if (isRec(m) && typeof m.id === "string") memberIds.push(m.id);
		}
		if (members.length >= EXPAND_LIMIT) {
			const full: string[] = [];
			const more = await listAll(
				get,
				tenantId,
				`/directoryRoles/${encodeURIComponent(role.id)}/members?$select=id`,
				(items) => {
					for (const it of items) full.push(it.id);
					return null;
				},
			);
			if (!more.ok)
				return more.firstForbidden
					? { ok: true, value: null }
					: fail(more.error);
			memberIds = full;
		}
		const name = str(role.displayName) ?? str(role.roleTemplateId) ?? role.id;
		const top = role.roleTemplateId === GLOBAL_ADMIN_TEMPLATE;
		// Nur Verwaltungsrollen zählen (Lese-Rollen wie „Directory Readers“
		// oder „Global Reader“ nicht)
		if (!top && !entraAdminRole(name)) continue;
		for (const id of memberIds) {
			if (!userIds.has(id)) continue;
			const info = out.get(id) ?? { names: new Set<string>(), top: false };
			info.names.add(name);
			info.top ||= top;
			out.set(id, info);
		}
	}
	return { ok: true, value: out };
}

// Verwaltungsrolle: Name endet auf „Administrator“ (Entra-Rollen wie
// „User Administrator“, „Security Administrator“); Global Administrator
// erkennt die Vorlagen-ID
export function entraAdminRole(name: string): boolean {
	return /administrator$/i.test(name.trim());
}

export async function fetchEntraSnapshot(
	get: MsGet,
	tenantId: string,
	opts?: { maxAccounts?: number },
): Promise<ProviderResult<ProviderSnapshot>> {
	const maxAccounts = opts?.maxAccounts ?? ENTRA_MAX_ACCOUNTS;

	const domains = await fetchDomains(get, tenantId);
	if (!domains.ok) return domains;

	const users = await fetchUsers(get, tenantId, maxAccounts);
	if (!users.ok) return users;
	const { rows, variant } = users.value;
	const userIds = new Set(rows.map((u) => u.externalId));

	const mfa = await fetchMfa(get, tenantId, userIds);
	if (!mfa.ok) return mfa;
	const roles = await fetchRoles(get, tenantId, userIds);
	if (!roles.ok) return roles;

	const capabilities: ProviderCapabilities = {
		signIn: variant.signIn,
		mfa: mfa.value !== null,
		roles: roles.value !== null,
		leaveDate: variant.leaveDate,
	};
	const accounts: ProviderAccount[] = rows.map((row) => {
		const info = roles.value?.get(row.externalId);
		return {
			...row,
			isAdmin: (info?.names.size ?? 0) > 0,
			isTopAdmin: info?.top ?? false,
			adminRoles: info ? [...info.names].sort().slice(0, MAX_ROLE_NAMES) : [],
			mfaRegistered: mfa.value ? (mfa.value.get(row.externalId) ?? null) : null,
		};
	});
	return {
		ok: true,
		value: { accounts, capabilities, domains: domains.value },
	};
}
