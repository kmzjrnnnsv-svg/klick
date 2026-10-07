import type { LicenceStage } from "@/db/schema/enums";
import type { OrgRole } from "@/lib/auth/permissions";

// Navigation wird aus Rahmenwerken, Lizenzstufe und Rolle abgeleitet
// (reine Funktion, getestet). Module, deren Rahmenwerk nicht gewählt ist,
// existieren in der Nav nicht. Einträge späterer Phasen tragen `phase`
// und werden ausgegraut dargestellt, damit die Struktur sichtbar bleibt.

export type NavLabelKey =
	| "today"
	| "overview"
	| "controls"
	| "synergies"
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
	| "nonconformities"
	| "testProgramme"
	| "calendar"
	| "roadmap"
	| "aml"
	| "ownFunds"
	| "cryptoAssets"
	| "complaints"
	| "application"
	| "baseline"
	| "team"
	| "settings"
	| "activity";

export type NavGroupKey =
	| "today"
	| "overview"
	| "implement"
	| "registers"
	| "governance"
	| "casp"
	| "frameworks"
	| "bottom";

export type NavIcon =
	| "sun"
	| "gauge"
	| "shield-check"
	| "git-merge"
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
	| "clipboard-check"
	| "presentation"
	| "wrench"
	| "flask"
	| "calendar"
	| "map"
	| "landmark"
	| "coins"
	| "bitcoin"
	| "message-square"
	| "folder-open"
	| "book-open"
	| "users"
	| "settings"
	| "activity";

export type NavItem = {
	key: string;
	labelKey?: NavLabelKey;
	// Direktes Label (z. B. Rahmenwerk-Name) statt i18n-Key.
	label?: string;
	href: string;
	icon: NavIcon;
	phase?: "P2" | "P3" | "P4" | "P5";
	count?: number;
};

export type NavGroup = {
	key: NavGroupKey;
	labelKey?:
		| "groupImplement"
		| "groupRegisters"
		| "groupGovernance"
		| "groupCasp"
		| "groupFrameworks";
	items: NavItem[];
};

export type NavInput = {
	frameworks: { slug: string; name: string }[];
	licenceStage: LicenceStage;
	caspServices: string[];
	role: OrgRole;
	counts?: { today?: number };
};

const FINANCE_SLUGS = new Set(["micar", "zag", "zag-marisk", "kwg", "marisk"]);
const AML_SLUGS = new Set(["gwg", "amlr", "tfr", "sanctions"]);

const STAGE_INDEX: Record<LicenceStage, number> = {
	"0_vorbereitung": 0,
	"1_agent": 1,
	"2_casp_zag": 2,
	"3_emi": 3,
	"4_bank": 4,
};

export function buildNav(input: NavInput): NavGroup[] {
	const slugs = new Set(input.frameworks.map((f) => f.slug));
	const hasFinance = [...slugs].some((s) => FINANCE_SLUGS.has(s));
	const hasAml = [...slugs].some((s) => AML_SLUGS.has(s));
	const stage = STAGE_INDEX[input.licenceStage];
	const isAuditor = input.role === "auditor";

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
				},
			],
		},
		{
			key: "implement",
			labelKey: "groupImplement",
			items: [
				{
					key: "controls",
					labelKey: "controls",
					href: "/controls",
					icon: "shield-check",
				},
				{
					key: "synergies",
					labelKey: "synergies",
					href: "/synergien",
					icon: "git-merge",
				},
				{
					key: "evidence",
					labelKey: "evidence",
					href: "/nachweise",
					icon: "file-check",
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
					phase: "P5",
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
				},
				{
					key: "nonconformities",
					labelKey: "nonconformities",
					href: "/abweichungen",
					icon: "wrench",
				},
				{
					key: "testProgramme",
					labelKey: "testProgramme",
					href: "/testprogramm",
					icon: "flask",
				},
				{
					key: "calendar",
					labelKey: "calendar",
					href: "/kalender",
					icon: "calendar",
				},
				{
					key: "roadmap",
					labelKey: "roadmap",
					href: "/roadmap",
					icon: "map",
				},
			],
		},
	];

	if ((hasFinance || hasAml || stage >= 1) && !isAuditor) {
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
		if (items.length > 0)
			groups.push({ key: "casp", labelKey: "groupCasp", items });
	}

	groups.push({
		key: "frameworks",
		labelKey: "groupFrameworks",
		items: [
			...input.frameworks.map((f) => ({
				key: `fw-${f.slug}`,
				label: f.name,
				href: `/rahmenwerke/${f.slug}`,
				icon: "book-open" as const,
			})),
			{
				key: "baseline",
				labelKey: "baseline",
				href: "/baseline",
				icon: "shield-check",
			},
		],
	});

	const bottom: NavItem[] = [
		{ key: "team", labelKey: "team", href: "/team", icon: "users" },
		{
			key: "settings",
			labelKey: "settings",
			href: "/einstellungen",
			icon: "settings",
		},
		{
			key: "activity",
			labelKey: "activity",
			href: "/aktivitaet",
			icon: "activity",
		},
	];
	groups.push({
		key: "bottom",
		items: isAuditor ? bottom.filter((i) => i.key !== "team") : bottom,
	});

	if (isAuditor) {
		// Prüfer:innen: reduzierte Nav — Steuerung/Register nur lesend relevante Teile.
		const allowed = new Set([
			"today",
			"overview",
			"controls",
			"evidence",
			"documents",
			"risks",
			"processes",
			"providers",
			"incidents",
			"audits",
			"settings",
			"activity",
		]);
		return groups
			.map((g) => ({
				...g,
				items: g.items.filter(
					(i) =>
						allowed.has(i.key) ||
						i.key.startsWith("fw-") ||
						i.key === "baseline",
				),
			}))
			.filter((g) => g.items.length > 0);
	}
	return groups;
}

export function countNavTargets(groups: NavGroup[]): number {
	return groups.reduce((n, g) => n + g.items.length, 0);
}
