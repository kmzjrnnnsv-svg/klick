// Admin > Nutzer:innen (Admin-Portal, Teil 3): Filter der Liste über die URL
// und grobe Geräteangabe aus dem Browser-Kopf, rein und getestet in
// tests/admin-users.test.ts. Nur Betriebsdaten, keine Inhalte einer Org.
import type { AccountStatus } from "@/lib/auth/account-status";

export const USER_STATUS_FILTERS = [
	"all",
	"active",
	"pending",
	"blocked",
	"no_factor",
	"admin",
] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export function parseUserFilter(sp: { q?: string; status?: string }): {
	q: string;
	status: UserStatusFilter;
} {
	const q = (sp.q ?? "").trim().toLowerCase().slice(0, 120);
	const status = (USER_STATUS_FILTERS as readonly string[]).includes(
		sp.status ?? "",
	)
		? (sp.status as UserStatusFilter)
		: "all";
	return { q, status };
}

export type UserListRow = {
	name: string;
	email: string;
	role: string | null;
	status: AccountStatus;
	factors: number;
	orgNames: readonly string[];
};

export function userMatches(
	row: UserListRow,
	filter: { q: string; status: UserStatusFilter },
): boolean {
	if (filter.q) {
		const hay = [row.name, row.email, ...row.orgNames].join(" ").toLowerCase();
		if (!hay.includes(filter.q)) return false;
	}
	switch (filter.status) {
		case "all":
			return true;
		case "no_factor":
			// Nicht aktivierte Konten haben noch keinen Faktor, das ist kein Befund
			return row.factors === 0 && row.status === "active";
		case "admin":
			return row.role === "admin";
		default:
			return row.status === filter.status;
	}
}

export function userFilterHref(filter: {
	q: string;
	status: UserStatusFilter;
}): string {
	const p = new URLSearchParams();
	if (filter.q) p.set("q", filter.q);
	if (filter.status !== "all") p.set("status", filter.status);
	const s = p.toString();
	return s ? `/admin/users?${s}` : "/admin/users";
}

// Browser und System grob aus dem User-Agent: genug, um eine Sitzung
// wiederzuerkennen („Safari · macOS“), nie eine Version oder Kennung.
// Reihenfolge zählt: Edge und Opera tragen „Chrome“, Chrome trägt „Safari“.
const BROWSERS: [RegExp, string][] = [
	[/Edg(e|A|iOS)?\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/Firefox\/|FxiOS\//, "Firefox"],
	[/SamsungBrowser\//, "Samsung Internet"],
	[/Chrome\/|CriOS\/|Chromium\//, "Chrome"],
	[/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
	[/iPhone/, "iPhone"],
	[/iPad/, "iPad"],
	[/Android/, "Android"],
	[/Windows/, "Windows"],
	[/CrOS/, "ChromeOS"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/Linux/, "Linux"],
];

export function deviceLabel(
	userAgent: string | null | undefined,
): string | null {
	const ua = (userAgent ?? "").slice(0, 512);
	if (!ua) return null;
	if (/^node|undici|curl\/|python|Go-http-client/i.test(ua)) return "Skript";
	const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
	const system = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
	if (!browser && !system) return null;
	return [browser, system].filter(Boolean).join(" · ");
}

// Auth-Ereignisse aus dem Plattform-Protokoll, die die Detailseite zeigt.
// Andere Aktionen der Person (in einer Org) stehen in deren Kette und
// bleiben hinter der Lockbox.
export const USER_EVENT_ACTIONS = [
	"auth.signin",
	"auth.signin_failed",
	"auth.signout",
	"auth.2fa_verified",
	"auth.2fa_failed",
	"auth.session_revoked",
	"auth.access_reset",
	"auth.idp_mfa_accepted",
	"auth.sso_bypass",
	"auth.login_link_cli",
	"auth.recover_link_cli",
	"auth.user_created",
	"auth.user_updated",
	"admin.ban_user",
	"admin.unban_user",
	"admin.set_role",
	"admin.impersonate_user",
	"admin.stop_impersonating",
	"admin.sessions_revoked",
] as const;
export type UserEventAction = (typeof USER_EVENT_ACTIONS)[number];

export const isUserEventAction = (a: string): a is UserEventAction =>
	(USER_EVENT_ACTIONS as readonly string[]).includes(a);
