import { ipInRanges, parseCidr, parseRanges } from "./ip";

// IP-Liste je Organisation (Härtung A5, ADR-029) — rein. Gespeichert in
// org_settings.network_policy, gelesen nur über networkPolicyOf (bzw.
// orgNetworkPolicy mit Zwischenspeicher). Leere Liste = aus. Die Liste gilt
// für alles (App, Token, Portale); jede Fläche außer der App lässt sich
// ausnehmen. Externe (Prüfer:innen, Berater:innen) können eine eigene Liste
// haben, sonst gilt die der Mitglieder.

export type NetworkEntry = { cidr: string; note: string };

export const NETWORK_EXCEPTIONS = [
	"supplierPortal",
	"trustCenter",
	"policyPortal",
	"ingest",
	"wallet",
] as const;
export type NetworkException = (typeof NETWORK_EXCEPTIONS)[number];

export type NetworkPolicy = {
	members: NetworkEntry[];
	// null = wie members
	externals: NetworkEntry[] | null;
	exceptions: Record<NetworkException, boolean>;
};

export const EMPTY_NETWORK_POLICY: NetworkPolicy = {
	members: [],
	externals: null,
	exceptions: {
		supplierPortal: false,
		trustCenter: false,
		policyPortal: false,
		ingest: false,
		wallet: false,
	},
};

// Wo die Liste greift; App = angemeldete Mitglieder
export type NetworkSurface = "app" | NetworkException;

export const MAX_NETWORK_ENTRIES = 100;

function entries(raw: unknown): NetworkEntry[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((e) => {
		const cidr = typeof e?.cidr === "string" ? e.cidr.trim() : "";
		if (!cidr || !parseCidr(cidr)) return [];
		const note = typeof e?.note === "string" ? e.note.trim().slice(0, 120) : "";
		return [{ cidr, note }];
	});
}

/** Gespeicherten Wert lesen; Unbekanntes und Ungültiges fällt weg. */
export function networkPolicyOf(raw: unknown): NetworkPolicy {
	const r = (raw && typeof raw === "object" ? raw : {}) as Partial<
		Record<keyof NetworkPolicy, unknown>
	>;
	const ex = (
		r.exceptions && typeof r.exceptions === "object" ? r.exceptions : {}
	) as Partial<Record<NetworkException, unknown>>;
	return {
		members: entries(r.members).slice(0, MAX_NETWORK_ENTRIES),
		externals: Array.isArray(r.externals)
			? entries(r.externals).slice(0, MAX_NETWORK_ENTRIES)
			: null,
		exceptions: Object.fromEntries(
			NETWORK_EXCEPTIONS.map((k) => [k, ex[k] === true]),
		) as Record<NetworkException, boolean>,
	};
}

export const networkPolicyActive = (p: NetworkPolicy) => p.members.length > 0;

/**
 * Darf diese Adresse auf diese Fläche? Aus = ja. Ausgenommene Fläche = ja.
 * Unbekannte Adresse bei aktiver Liste = nein (fail closed; in Produktion
 * setzt nginx X-Real-IP immer).
 */
export function networkAllows(
	policy: NetworkPolicy,
	surface: NetworkSurface,
	ip: string | null | undefined,
	opts: { external?: boolean } = {},
): boolean {
	if (!networkPolicyActive(policy)) return true;
	if (surface !== "app" && policy.exceptions[surface]) return true;
	if (!ip) return false;
	const list =
		surface === "app" && opts.external && policy.externals
			? policy.externals
			: policy.members;
	return ipInRanges(ip, parseRanges(list.map((e) => e.cidr)).ranges);
}

/**
 * Schutz vor Selbstaussperren: wer die Liste ändert, muss danach selbst
 * noch hineinkommen (als Mitglied, nicht als externe Person).
 */
export function locksOut(next: NetworkPolicy, ip: string | null): boolean {
	return !networkAllows(next, "app", ip);
}
