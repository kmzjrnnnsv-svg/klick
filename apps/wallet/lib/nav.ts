// Navigation von both.money nach Apple HIG (pure, getestet): Seitenleiste ab
// 1024 px mit Gruppen, darunter eine Tab-Leiste mit fünf Tabs — Übersicht,
// Konten, Bewegungen, Senden (nur mit eigenem Signer, sonst Empfangen) und
// Einstellungen. Alles, was keinen Tab hat, steht als gruppierte Liste unter
// /settings (wie die iOS-Einstellungen).

export type ShellLabel =
	| "overview"
	| "receive"
	| "prices"
	| "activity"
	| "accounts"
	| "send"
	| "payouts"
	| "addressBook"
	| "security"
	| "members"
	| "audit"
	| "export"
	| "access"
	| "mandates"
	| "settings"
	| "groupSend"
	| "groupOrg"
	| "groupWallet";

export type WalletNavIcon =
	| "home"
	| "arrow-down"
	| "trending-up"
	| "history"
	| "vault"
	| "send"
	| "list"
	| "book-user"
	| "shield"
	| "users"
	| "scroll"
	| "upload"
	| "key"
	| "signature"
	| "settings";

export type WalletNavItem = {
	key: string;
	href: string;
	labelKey: ShellLabel;
	icon: WalletNavIcon;
	// weitere Pfade, unter denen der Eintrag aktiv ist
	match?: string[];
};

export type WalletNavGroup = {
	key: "wallet" | "send" | "org";
	labelKey?: ShellLabel;
	items: WalletNavItem[];
};

export type WalletNavInput = {
	send: boolean;
	members: boolean;
	audit: boolean;
	exportManage: boolean;
	// Zugangsregeln (Inhaber:innen, settings:update)
	access: boolean;
	// Vollmachten (Inhaber:innen und Bedienung, wallet:initiate)
	mandates: boolean;
};

export function walletNav(input: WalletNavInput): WalletNavGroup[] {
	const groups: WalletNavGroup[] = [
		{
			key: "wallet",
			items: [
				{ key: "overview", href: "/", labelKey: "overview", icon: "home" },
				{
					key: "receive",
					href: "/receive",
					labelKey: "receive",
					icon: "arrow-down",
				},
				{
					key: "prices",
					href: "/prices",
					labelKey: "prices",
					icon: "trending-up",
				},
				{
					key: "activity",
					href: "/activity",
					labelKey: "activity",
					icon: "history",
				},
				{
					key: "accounts",
					href: "/accounts",
					labelKey: "accounts",
					icon: "vault",
				},
			],
		},
	];
	if (input.send)
		groups.push({
			key: "send",
			labelKey: "groupSend",
			items: [
				{ key: "send", href: "/send", labelKey: "send", icon: "send" },
				{ key: "payouts", href: "/payouts", labelKey: "payouts", icon: "list" },
				{
					key: "address-book",
					href: "/address-book",
					labelKey: "addressBook",
					icon: "book-user",
				},
				...(input.mandates
					? [
							{
								key: "mandates",
								href: "/mandates",
								labelKey: "mandates" as const,
								icon: "signature" as const,
							},
						]
					: []),
				{
					key: "security",
					href: "/security",
					labelKey: "security",
					icon: "shield",
				},
			],
		});
	const org: WalletNavItem[] = [
		...(input.members
			? [
					{
						key: "members",
						href: "/members",
						labelKey: "members" as const,
						icon: "users" as const,
					},
				]
			: []),
		...(input.audit
			? [
					{
						key: "audit",
						href: "/audit",
						labelKey: "audit" as const,
						icon: "scroll" as const,
					},
				]
			: []),
		...(input.exportManage
			? [
					{
						key: "export",
						href: "/settings/export",
						labelKey: "export" as const,
						icon: "upload" as const,
					},
				]
			: []),
		...(input.access
			? [
					{
						key: "access",
						href: "/settings/access",
						labelKey: "access" as const,
						icon: "key" as const,
					},
				]
			: []),
	];
	if (org.length > 0)
		groups.push({ key: "org", labelKey: "groupOrg", items: org });
	return groups;
}

export type WalletTabKey =
	| "overview"
	| "accounts"
	| "activity"
	| "send"
	| "receive"
	| "settings";
export type WalletTab = {
	key: WalletTabKey;
	href: string;
	labelKey: ShellLabel;
	icon: WalletNavIcon;
};

export function walletTabs(send: boolean): WalletTab[] {
	return [
		{ key: "overview", href: "/", labelKey: "overview", icon: "home" },
		{ key: "accounts", href: "/accounts", labelKey: "accounts", icon: "vault" },
		{
			key: "activity",
			href: "/activity",
			labelKey: "activity",
			icon: "history",
		},
		send
			? { key: "send", href: "/send", labelKey: "send", icon: "send" }
			: {
					key: "receive",
					href: "/receive",
					labelKey: "receive",
					icon: "arrow-down",
				},
		{
			key: "settings",
			href: "/settings",
			labelKey: "settings",
			icon: "settings",
		},
	];
}

const under = (path: string, href: string) =>
	href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

// Aktiver Eintrag der Seitenleiste: der spezifischste Pfad ("/" nur exakt)
export function activeWalletNav(
	groups: WalletNavGroup[],
	path: string,
): string | null {
	let best: { key: string; len: number } | null = null;
	for (const item of groups.flatMap((g) => g.items))
		for (const href of [item.href, ...(item.match ?? [])])
			if (under(path, href) && (!best || href.length > best.len))
				best = { key: item.key, len: href.length };
	return best?.key ?? null;
}

// Aktiver Tab: eigener Tab, sonst Einstellungen für alle übrigen Seiten der
// App (Kurse, Auszahlungen, Mitglieder …); Einführung und Auth ohne Tab
export function activeWalletTab(
	send: boolean,
	path: string,
): WalletTabKey | null {
	const own = walletTabs(send).find(
		(t) => t.key !== "settings" && under(path, t.href),
	);
	if (own) return own.key;
	const elsewhere = [
		"/settings",
		"/receive",
		"/send",
		"/prices",
		"/payouts",
		"/address-book",
		"/security",
		"/members",
		"/audit",
	];
	return elsewhere.some((h) => under(path, h)) ? "settings" : null;
}

// Einträge der Liste unter /settings: alles ohne eigenen Tab
export function settingsGroups(
	groups: WalletNavGroup[],
	send: boolean,
): WalletNavGroup[] {
	const tabbed = new Set<string>(walletTabs(send).map((t) => t.href));
	return groups
		.map((g) => ({ ...g, items: g.items.filter((i) => !tabbed.has(i.href)) }))
		.filter((g) => g.items.length > 0);
}
