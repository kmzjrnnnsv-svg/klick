// Navigation des Plattform-Admins (rein, getestet in tests/admin-nav.test.ts):
// Gruppen wie in der App-Seitenleiste (Apple HIG, zwei Ebenen). Jede Seite
// hier braucht eine page.tsx unter app/(admin)/admin — der Test prüft das,
// damit kein Eintrag ins Leere führt.
import type { NavIcon } from "@/lib/nav";
import type de from "@/messages/de.json";

/** Schlüssel unter messages/de.json → Admin (typisiert wie next-intl). */
export type AdminLabelKey = keyof (typeof de)["Admin"];

export type AdminNavItem = {
	href: string;
	labelKey: AdminLabelKey;
	icon: NavIcon;
};

export type AdminNavGroup = {
	labelKey: AdminLabelKey;
	items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
	{
		labelKey: "groupPlatform",
		items: [
			{ href: "/admin", labelKey: "overview", icon: "gauge" },
			{ href: "/admin/orgs", labelKey: "orgs", icon: "building" },
			{ href: "/admin/users", labelKey: "users", icon: "users" },
		],
	},
	{
		labelKey: "groupSecurity",
		items: [
			{ href: "/admin/zugriffe", labelKey: "access", icon: "lock" },
			{ href: "/admin/audit", labelKey: "audit", icon: "file-text" },
		],
	},
	{
		labelKey: "groupSales",
		items: [
			{
				href: "/admin/anfragen",
				labelKey: "inquiries",
				icon: "message-square",
			},
			{ href: "/admin/preise", labelKey: "prices", icon: "coins" },
			{ href: "/admin/cms", labelKey: "cms", icon: "book-open" },
		],
	},
];

export const adminNavItems = (): AdminNavItem[] =>
	ADMIN_NAV.flatMap((g) => g.items);

/** Aktiver Eintrag: längster passender Pfad, `/admin` nur exakt. */
export function activeAdminHref(pathname: string): string | null {
	let best: string | null = null;
	for (const item of adminNavItems()) {
		const hit =
			item.href === "/admin"
				? pathname === "/admin"
				: pathname === item.href || pathname.startsWith(`${item.href}/`);
		if (hit && (!best || item.href.length > best.length)) best = item.href;
	}
	return best;
}
