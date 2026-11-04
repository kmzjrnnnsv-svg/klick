import type { LicenceStage } from "@/db/schema/enums";
import type { OrgRole, Resource } from "@/lib/auth/permissions";

// Navigation wird aus Rahmenwerken, Lizenzstufe und Rolle abgeleitet
// (reine Funktion, getestet). Module, deren Rahmenwerk nicht gewählt ist,
// existieren in der Nav nicht. Einträge späterer Phasen tragen `phase`
// und werden ausgegraut dargestellt, damit die Struktur sichtbar bleibt.
//
// Kurz halten (S1, Nov 2026): verwandte Seiten teilen sich einen Eintrag
// (`sections`), oben auf der Seite wechselt ein Umschalter zwischen ihnen
// (`SectionSwitch`, components/shell/section-switch.tsx). Die Pfade
// bleiben; die Rahmenwerke stehen gesammelt unter /rahmenwerke.

export type NavLabelKey =
	| "analytics"
	| "today"
	| "overview"
	| "gapAnalysis"
	| "products"
	| "security"
	| "controls"
	| "synergies"
	| "relations"
	| "evidence"
	| "risks"
	| "documents"
	| "processes"
	| "providers"
	| "assets"
	| "incidents"
	| "trainings"
	| "privacy"
	| "organisation"
	| "resolutions"
	| "audits"
	| "managementReview"
	| "reports"
	| "trustCenter"
	| "nonconformities"
	| "changes"
	| "testProgramme"
	| "calendar"
	| "roadmap"
	| "ismsPlan"
	| "aml"
	| "ownFunds"
	| "cryptoAssets"
	| "custody"
	| "krypto"
	| "complaints"
	| "application"
	| "baseline"
	| "team"
	| "settings"
	| "activity"
	| "policies"
	| "help"
	| "frameworks"
	| "planning"
	| "myAudit"
	| "auditRequests"
	| "auditTrail"
	| "account";

export type NavGroupKey =
	| "audit"
	| "today"
	| "overview"
	| "implement"
	| "registers"
	| "governance"
	| "casp"
	| "bottom";

export type NavIcon =
	| "sun"
	| "sparkles"
	| "gauge"
	| "list-checks"
	| "package"
	| "shield-alert"
	| "shield-check"
	| "git-merge"
	| "network"
	| "file-check"
	| "triangle-alert"
	| "file-text"
	| "workflow"
	| "truck"
	| "server"
	| "siren"
	| "graduation-cap"
	| "lock"
	| "building"
	| "gavel"
	| "git-pull-request"
	| "clipboard-check"
	| "presentation"
	| "wrench"
	| "flask"
	| "calendar"
	| "map"
	| "landmark"
	| "coins"
	| "bitcoin"
	| "megaphone"
	| "message-square"
	| "folder-open"
	| "book-open"
	| "users"
	| "settings"
	| "activity"
	| "badge-check"
	| "vault"
	| "wallet"
	| "search"
	| "layers"
	| "circle-help";

export type NavItem = {
	key: string;
	labelKey?: NavLabelKey;
	// Direktes Label (z. B. Rahmenwerk-Name) statt i18n-Key.
	label?: string;
	href: string;
	// weitere Pfade, unter denen der Eintrag aktiv ist (z. B. Detailseiten)
	match?: string[];
	icon: NavIcon;
	phase?: "P2" | "P3" | "P4" | "P5";
	count?: number;
	// weitere Seiten unter diesem Eintrag (Umschalter oben auf der Seite)
	sections?: NavSectionGroup;
	// Sprungziele nur für die Suche (⌘K), z. B. jedes Rahmenwerk
	jumps?: { key: string; label: string; href: string }[];
};

// Seiten, die sich einen Eintrag teilen. Die erste ist die Seite des
// Eintrags; `perm` blendet einen Abschnitt im Umschalter aus, wenn die
// Person das Recht nicht hat (wie der Guard der Seite), `hideFor` für
// Rollen, denen die Navigation die Seite nicht zeigt.
export type NavSection = {
	key: string;
	labelKey: NavLabelKey;
	href: string;
	icon: NavIcon;
	perm?: Partial<Record<Resource, readonly string[]>>;
	hideFor?: OrgRole[];
};

export type NavSectionGroup =
	| "overview"
	| "frameworks"
	| "synergies"
	| "planning"
	| "review"
	| "nonconformities"
	| "team";

export const NAV_SECTIONS: Record<NavSectionGroup, NavSection[]> = {
	overview: [
		{
			key: "overview",
			labelKey: "overview",
			href: "/ueberblick",
			icon: "gauge",
		},
		{
			key: "analytics",
			labelKey: "analytics",
			href: "/auswertung",
			icon: "activity",
		},
	],
	frameworks: [
		{
			key: "frameworks",
			labelKey: "frameworks",
			href: "/rahmenwerke",
			icon: "book-open",
		},
		{
			key: "baseline",
			labelKey: "baseline",
			href: "/baseline",
			icon: "shield-check",
		},
	],
	synergies: [
		{
			key: "synergies",
			labelKey: "synergies",
			href: "/synergien",
			icon: "git-merge",
		},
		{
			key: "relations",
			labelKey: "relations",
			href: "/zusammenhaenge",
			icon: "network",
		},
	],
	planning: [
		{
			key: "calendar",
			labelKey: "calendar",
			href: "/kalender",
			icon: "calendar",
			perm: { obligation: ["read"] },
		},
		{
			key: "roadmap",
			labelKey: "roadmap",
			href: "/roadmap",
			icon: "map",
			perm: { milestone: ["read"] },
		},
		{
			key: "ismsPlan",
			labelKey: "ismsPlan",
			href: "/jahresplan",
			icon: "clipboard-check",
			perm: { obligation: ["read"] },
		},
	],
	review: [
		{
			key: "managementReview",
			labelKey: "managementReview",
			href: "/managementbewertung",
			icon: "presentation",
			perm: { management_review: ["read"] },
		},
		{
			key: "reports",
			labelKey: "reports",
			href: "/berichte",
			icon: "book-open",
			perm: { management_review: ["read"] },
		},
	],
	nonconformities: [
		{
			key: "nonconformities",
			labelKey: "nonconformities",
			href: "/abweichungen",
			icon: "wrench",
			perm: { nonconformity: ["read"] },
		},
		{
			key: "testProgramme",
			labelKey: "testProgramme",
			href: "/testprogramm",
			icon: "flask",
			perm: { control: ["read"] },
		},
	],
	team: [
		{
			key: "team",
			labelKey: "team",
			href: "/team",
			icon: "users",
			hideFor: ["auditor"],
		},
		{
			key: "activity",
			labelKey: "activity",
			href: "/aktivitaet",
			icon: "activity",
		},
	],
};

// Alle Pfade eines Eintrags: eigener, Zusatzpfade, geteilte Seiten
export function navItemHrefs(item: NavItem): string[] {
	return [
		item.href,
		...(item.match ?? []),
		...(item.sections ? NAV_SECTIONS[item.sections].map((s) => s.href) : []),
	];
}

export type NavGroup = {
	key: NavGroupKey;
	labelKey?:
		| "groupImplement"
		| "groupRegisters"
		| "groupGovernance"
		| "groupCasp"
		| "groupRecords";
	items: NavItem[];
};

export type NavInput = {
	frameworks: { slug: string; name: string }[];
	licenceStage: LicenceStage;
	caspServices: string[];
	role: OrgRole;
	counts?: { today?: number };
	// Verbindung zu both.money aktiv → Eintrag „Krypto (both.money)“
	walletLinked?: boolean;
	// Prüfer:innen: das Audit, in dem sie prüfen (myAuditId), sonst null
	auditId?: string | null;
};

const FINANCE_SLUGS = new Set([
	"micar",
	"zag",
	"zag-marisk",
	"kwg",
	"marisk",
	"uk-fca",
	"ae-vara",
	"bh-cbb",
	"ch-finma",
	"br-bcb",
]);
const AML_SLUGS = new Set(["gwg", "amlr", "tfr", "sanctions"]);

const STAGE_INDEX: Record<LicenceStage, number> = {
	"0_vorbereitung": 0,
	"1_agent": 1,
	"2_casp_zag": 2,
	"3_emi": 3,
	"4_bank": 4,
};

// Hilfe-Wiki: für alle Rollen, unten in der Seitenleiste
const HELP_ITEM: NavItem = {
	key: "help",
	labelKey: "help",
	href: "/hilfe",
	icon: "circle-help",
};

// Prüfer:innen (E, Nov 2026): ein kurzes Menü für die Prüfung — ihr Audit
// mit Anfragen und Prüfpfad, dann Nachweise, Dokumente, Risiken, unten Konto
// und Hilfe. Alles andere bleibt über die Suche erreichbar, soweit das Recht
// es erlaubt. Mit mehreren Audits führt der erste Eintrag zur Liste.
function auditorNav(auditId: string | null): NavGroup[] {
	const base = auditId ? `/audits/${auditId}` : "/audits";
	const audit: NavItem[] = [
		{
			key: "audits",
			labelKey: auditId ? "myAudit" : "audits",
			href: base,
			match: ["/audits"],
			icon: "clipboard-check",
		},
	];
	if (auditId)
		audit.push(
			{
				key: "auditRequests",
				labelKey: "auditRequests",
				href: `${base}?tab=anfragen`,
				match: [`${base}/anfragen`],
				icon: "message-square",
			},
			{
				key: "auditTrail",
				labelKey: "auditTrail",
				href: `${base}?tab=pruefpfad`,
				icon: "list-checks",
			},
		);
	return [
		{ key: "audit", items: audit },
		{
			key: "registers",
			labelKey: "groupRecords",
			items: [
				{
					key: "evidence",
					labelKey: "evidence",
					href: "/nachweise",
					icon: "file-check",
				},
				{
					key: "documents",
					labelKey: "documents",
					href: "/dokumente",
					icon: "file-text",
				},
				{
					key: "risks",
					labelKey: "risks",
					href: "/risiken",
					icon: "triangle-alert",
				},
			],
		},
		{
			key: "bottom",
			items: [
				{
					key: "settings",
					labelKey: "account",
					href: "/einstellungen",
					icon: "settings",
				},
				HELP_ITEM,
			],
		},
	];
}

export function buildNav(input: NavInput): NavGroup[] {
	if (input.role === "auditor") return auditorNav(input.auditId ?? null);
	// Mitarbeitende sehen nur ihre Richtlinien (Kenntnisnahme dort)
	if (input.role === "employee")
		return [
			{
				key: "today",
				items: [
					{
						key: "policies",
						labelKey: "policies",
						href: "/richtlinien",
						icon: "book-open",
					},
					HELP_ITEM,
				],
			},
		];
	const slugs = new Set(input.frameworks.map((f) => f.slug));
	const hasFinance = [...slugs].some((s) => FINANCE_SLUGS.has(s));
	const hasAml = [...slugs].some((s) => AML_SLUGS.has(s));
	const stage = STAGE_INDEX[input.licenceStage];
	// Verwahrung: Wallet-Register und Abstimmung bei Verwahrdienst oder CCSS
	const hasCustody =
		input.caspServices.includes("custody") || slugs.has("ccss");

	const groups: NavGroup[] = [
		{
			key: "today",
			items: [
				{
					key: "today",
					labelKey: "today",
					href: "/heute",
					icon: "sun",
					count: input.counts?.today,
				},
			],
		},
		{
			key: "overview",
			items: [
				{
					key: "overview",
					labelKey: "overview",
					href: "/ueberblick",
					icon: "gauge",
					sections: "overview",
				},
			],
		},
		{
			key: "implement",
			labelKey: "groupImplement",
			items: [
				{
					key: "gapAnalysis",
					labelKey: "gapAnalysis",
					href: "/gap-analyse",
					icon: "list-checks",
				},
				// ein Eintrag für alle Rahmenwerke (Liste mit Abdeckung)
				{
					key: "frameworks",
					labelKey: "frameworks",
					href: "/rahmenwerke",
					icon: "book-open",
					sections: "frameworks",
					jumps: input.frameworks.map((f) => ({
						key: `fw-${f.slug}`,
						label: f.name,
						href: `/rahmenwerke/${f.slug}`,
					})),
				},
				{
					key: "controls",
					labelKey: "controls",
					href: "/controls",
					icon: "shield-check",
				},
				{
					key: "evidence",
					labelKey: "evidence",
					href: "/nachweise",
					icon: "file-check",
				},
				{
					key: "synergies",
					labelKey: "synergies",
					href: "/synergien",
					icon: "git-merge",
					sections: "synergies",
				},
				{
					key: "security",
					labelKey: "security",
					href: "/sicherheit",
					icon: "shield-alert",
				},
			],
		},
		{
			key: "registers",
			labelKey: "groupRegisters",
			items: [
				{
					key: "risks",
					labelKey: "risks",
					href: "/risiken",
					icon: "triangle-alert",
				},
				{
					key: "documents",
					labelKey: "documents",
					href: "/dokumente",
					icon: "file-text",
				},
				{
					key: "processes",
					labelKey: "processes",
					href: "/prozesse",
					icon: "workflow",
				},
				{
					key: "providers",
					labelKey: "providers",
					href: "/dienstleister",
					icon: "truck",
				},
				{
					key: "assets",
					labelKey: "assets",
					href: "/assets",
					icon: "server",
				},
				{
					key: "incidents",
					labelKey: "incidents",
					href: "/vorfaelle",
					icon: "siren",
				},
				// CRA: Produktregister nur mit aktivem Rahmenwerk
				...(slugs.has("cra")
					? [
							{
								key: "products",
								labelKey: "products" as const,
								href: "/produkte",
								icon: "package" as const,
							},
						]
					: []),
				{
					key: "trainings",
					labelKey: "trainings",
					href: "/schulungen",
					icon: "graduation-cap",
				},
				{
					key: "privacy",
					labelKey: "privacy",
					href: "/datenschutz",
					icon: "lock",
				},
			],
		},
		{
			key: "governance",
			labelKey: "groupGovernance",
			items: [
				{
					key: "organisation",
					labelKey: "organisation",
					href: "/organisation",
					icon: "building",
				},
				{
					key: "resolutions",
					labelKey: "resolutions",
					href: "/beschluesse",
					icon: "gavel",
				},
				// Neu-Produkt-Prozess (MaRisk AT 8, DORA Art. 8 Abs. 3): nur mit
				// einem Rahmenwerk, das ihn verlangt
				...(["zag-marisk", "kwg", "dora"].some((s) => slugs.has(s))
					? [
							{
								key: "changes",
								labelKey: "changes" as const,
								href: "/aenderungen",
								icon: "git-pull-request" as const,
							},
						]
					: []),
				{
					key: "audits",
					labelKey: "audits",
					href: "/audits",
					icon: "clipboard-check",
				},
				{
					key: "managementReview",
					labelKey: "managementReview",
					href: "/managementbewertung",
					icon: "presentation",
					sections: "review",
				},
				{
					key: "trustCenter",
					labelKey: "trustCenter",
					href: "/trust-center",
					icon: "badge-check",
				},
				{
					key: "nonconformities",
					labelKey: "nonconformities",
					href: "/abweichungen",
					icon: "wrench",
					sections: "nonconformities",
				},
				{
					key: "planning",
					labelKey: "planning",
					href: "/kalender",
					icon: "calendar",
					sections: "planning",
				},
			],
		},
	];

	if (hasFinance || hasAml || hasCustody || stage >= 1) {
		const items: NavItem[] = [];
		if (hasAml || hasFinance) {
			items.push({
				key: "aml",
				labelKey: "aml",
				href: "/aml",
				icon: "landmark",
			});
		}
		if (hasFinance) {
			items.push(
				{
					key: "ownFunds",
					labelKey: "ownFunds",
					href: "/eigenmittel",
					icon: "coins",
				},
				{
					key: "cryptoAssets",
					labelKey: "cryptoAssets",
					href: "/kryptowerte",
					icon: "bitcoin",
				},
				...(hasCustody
					? [
							{
								key: "custody",
								labelKey: "custody" as const,
								href: "/verwahrung",
								icon: "vault" as const,
							},
						]
					: []),
				{
					key: "complaints",
					labelKey: "complaints",
					href: "/beschwerden",
					icon: "message-square",
				},
				{
					key: "application",
					labelKey: "application",
					href: "/antrag",
					icon: "folder-open",
				},
			);
		}
		if (hasCustody && !hasFinance)
			items.push({
				key: "custody",
				labelKey: "custody",
				href: "/verwahrung",
				icon: "vault",
			});
		if (input.walletLinked)
			items.push({
				key: "krypto",
				labelKey: "krypto",
				href: "/krypto",
				icon: "wallet",
			});
		if (items.length > 0)
			groups.push({ key: "casp", labelKey: "groupCasp", items });
	} else if (input.walletLinked)
		groups.push({
			key: "casp",
			labelKey: "groupCasp",
			items: [
				{ key: "krypto", labelKey: "krypto", href: "/krypto", icon: "wallet" },
			],
		});

	// Aktivität steht unter Team (Umschalter oben auf der Seite)
	const bottom: NavItem[] = [
		{
			key: "team",
			labelKey: "team",
			href: "/team",
			icon: "users",
			sections: "team",
		},
		{
			key: "settings",
			labelKey: "settings",
			href: "/einstellungen",
			icon: "settings",
		},
		HELP_ITEM,
	];
	groups.push({ key: "bottom", items: bottom });

	return groups;
}

// Aktiver Eintrag: der spezifischste Pfad gewinnt — /heute/aufgaben markiert
// „Aufgaben“, nicht zusätzlich „Heute“. Ein Eintrag mit Query (Prüfer:innen:
// „Anfragen“ = /audits/<id>?tab=anfragen) gilt nur auf genau dieser Seite und
// nur, wenn jeder seiner Parameter in `search` steht.
export function activeNavKey(
	groups: NavGroup[],
	pathname: string,
	search = "",
): string | null {
	const params = new URLSearchParams(search);
	let best: { key: string; len: number } | null = null;
	for (const item of groups.flatMap((g) => g.items))
		for (const href of navItemHrefs(item)) {
			const [path = href, query] = href.split("?");
			const hit = query
				? pathname === path &&
					[...new URLSearchParams(query)].every(([k, v]) => params.get(k) === v)
				: pathname === path ||
					(path !== "/" && pathname.startsWith(`${path}/`));
			if (hit && (!best || href.length > best.len))
				best = { key: item.key, len: href.length };
		}
	return best?.key ?? null;
}

export function countNavTargets(groups: NavGroup[]): number {
	return groups.reduce((n, g) => n + g.items.length, 0);
}

// Tab-Leiste am Handy nach Apple HIG: höchstens fünf Tabs, nur Navigation,
// kein „Mehr“. Heute und Suche führen direkt zur Seite; Umsetzen, Register und
// Steuerung öffnen /bereich/<tab> — eine gruppierte Liste ihrer Seiten (wie
// die iOS-Einstellungen). CASP & Aufsicht, Team und Einstellungen hängen unter
// Steuerung, der Überblick unter Umsetzen.
export type NavTabKey =
	| "heute"
	| "umsetzen"
	| "register"
	| "steuerung"
	| "suche"
	// Prüfer:innen: Audit · Anfragen · Nachweise · Suche
	| "audit"
	| "anfragen"
	| "nachweise";

export type NavTab = {
	key: NavTabKey;
	labelKey:
		| NavLabelKey
		| "groupImplement"
		| "groupRegisters"
		| "groupGovernance"
		| "search";
	icon: NavIcon;
	href: string;
	groups: NavGroup[];
};

const TAB_DEFS: (Omit<NavTab, "groups"> & { groupKeys: NavGroupKey[] })[] = [
	{
		key: "heute",
		labelKey: "today",
		icon: "sun",
		href: "/heute",
		groupKeys: ["today"],
	},
	{
		key: "umsetzen",
		labelKey: "groupImplement",
		icon: "shield-check",
		href: "/bereich/umsetzen",
		groupKeys: ["overview", "implement"],
	},
	{
		key: "register",
		labelKey: "groupRegisters",
		icon: "layers",
		href: "/bereich/register",
		groupKeys: ["registers"],
	},
	{
		key: "steuerung",
		labelKey: "groupGovernance",
		icon: "building",
		href: "/bereich/steuerung",
		groupKeys: ["governance", "casp", "bottom"],
	},
	{
		key: "suche",
		labelKey: "search",
		icon: "search",
		href: "/suche",
		groupKeys: [],
	},
];

export const LIST_TABS = ["umsetzen", "register", "steuerung"] as const;
export type ListTabKey = (typeof LIST_TABS)[number];

// Prüfer:innen: Tabs führen direkt zu Seiten, keine Bereichslisten
const AUDITOR_TABS: { key: NavTabKey; item: string }[] = [
	{ key: "audit", item: "audits" },
	{ key: "anfragen", item: "auditRequests" },
	{ key: "nachweise", item: "evidence" },
];
const isAuditorNav = (groups: NavGroup[]) =>
	groups.some((g) => g.key === "audit");

// Tabs aus der abgeleiteten Navigation; Tabs ohne Einträge entfallen, die
// Suche gibt es nur zusammen mit anderen Tabs.
export function navTabs(groups: NavGroup[]): NavTab[] {
	if (isAuditorNav(groups)) {
		const items = groups.flatMap((g) => g.items);
		const tabs: NavTab[] = [];
		for (const def of AUDITOR_TABS) {
			const item = items.find((i) => i.key === def.item);
			if (item?.labelKey)
				tabs.push({
					key: def.key,
					labelKey: item.labelKey,
					icon: item.icon,
					href: item.href,
					groups: [],
				});
		}
		tabs.push({
			key: "suche",
			labelKey: "search",
			icon: "search",
			href: "/suche",
			groups: [],
		});
		return tabs;
	}
	const tabs = TAB_DEFS.map(({ groupKeys, ...tab }) => ({
		...tab,
		groups: groups.filter(
			(g) => groupKeys.includes(g.key) && g.items.length > 0,
		),
	})).filter((t) => t.key === "suche" || t.groups.length > 0);
	// Suche nur neben Bereichslisten (Mitarbeitende haben keine)
	const lists = tabs.some((t) =>
		(LIST_TABS as readonly string[]).includes(t.key),
	);
	const shown = lists ? tabs : tabs.filter((t) => t.key !== "suche");
	return shown.length > 1 ? shown : [];
}

// Aktiver Tab: Bereichsliste, Suche oder der Tab, dessen Gruppe den aktiven
// Eintrag enthält (Detailseiten über activeNavKey)
export function activeNavTab(
	groups: NavGroup[],
	pathname: string,
	search = "",
): NavTabKey | null {
	if (pathname === "/suche" || pathname.startsWith("/suche/")) return "suche";
	if (isAuditorNav(groups)) {
		const key = activeNavKey(groups, pathname, search);
		// der Prüfpfad gehört zum Audit
		const item = key === "auditTrail" ? "audits" : key;
		return AUDITOR_TABS.find((t) => t.item === item)?.key ?? null;
	}
	const list = pathname.match(/^\/bereich\/([^/]+)/)?.[1];
	if (list && (LIST_TABS as readonly string[]).includes(list))
		return list as ListTabKey;
	const key = activeNavKey(groups, pathname);
	if (!key) return null;
	const group = groups.find((g) => g.items.some((i) => i.key === key));
	if (!group) return null;
	return TAB_DEFS.find((t) => t.groupKeys.includes(group.key))?.key ?? null;
}
