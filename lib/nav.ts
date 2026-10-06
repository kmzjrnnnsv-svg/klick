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
	phase?: "P1" | "P2" | "P3" | "P4" | "P5";
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
					phase: "P1",
				},
				{
					key: "synergies",
					labelKey: "synergies",
					href: "/synergien",
					icon: "git-merge",
					phase: "P1",
				},
				{
					key: "evidence",
					labelKey: "evidence",
					href: "/nachweise",
					icon: "file-check",
					phase: "P1",
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
					phase: "P2",
				},
				{
					key: "documents",
					labelKey: "documents",
					href: "/dokumente",
					icon: "file-text",
					phase: "P2",
				},
				{
					key: "processes",
					labelKey: "processes",
					href: "/prozesse",
					icon: "workflow",
					phase: "P3",
				},
				{
					key: "providers",
					labelKey: "providers",
					href: "/dienstleister",
					icon: "truck",
					phase: "P2",
				},
				{
					key: "assets",
					labelKey: "assets",
					href: "/assets",
					icon: "server",
					phase: "P2",
				},
				{
					key: "incidents",
					labelKey: "incidents",
					href: "/vorfaelle",
					icon: "siren",
					phase: "P2",
				},
				{
					key: "trainings",
					labelKey: "trainings",
					href: "/schulungen",
					icon: "graduation-cap",
					phase: "P2",
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
					phase: "P3",
				},
				{
					key: "resolutions",
					labelKey: "resolutions",
					href: "/beschluesse",
					icon: "gavel",
					phase: "P3",
				},
				{
					key: "audits",
					labelKey: "audits",
					href: "/audits",
					icon: "clipboard-check",
					phase: "P3",
				},
				{
					key: "managementReview",
					labelKey: "managementReview",
					href: "/managementbewertung",
					icon: "presentation",
					phase: "P3",
				},
				{
					key: "nonconformities",
					labelKey: "nonconformities",
					href: "/abweichungen",
					icon: "wrench",
					phase: "P3",
				},
				{
					key: "testProgramme",
					labelKey: "testProgramme",
					href: "/testprogramm",
					icon: "flask",
					phase: "P3",
				},
				{
					key: "calendar",
					labelKey: "calendar",
					href: "/kalender",
					icon: "calendar",
					phase: "P3",
				},
				{
					key: "roadmap",
					labelKey: "roadmap",
					href: "/roadmap",
					icon: "map",
					phase: "P4",
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
				phase: "P4",
			});
		}
		if (hasFinance) {
			items.push(
				{
					key: "ownFunds",
					labelKey: "ownFunds",
					href: "/eigenmittel",
					icon: "coins",
					phase: "P4",
				},
				{
					key: "cryptoAssets",
					labelKey: "cryptoAssets",
					href: "/kryptowerte",
					icon: "bitcoin",
					phase: "P4",
				},
				{
					key: "complaints",
					labelKey: "complaints",
					href: "/beschwerden",
					icon: "message-square",
					phase: "P3",
				},
				{
					key: "application",
					labelKey: "application",
					href: "/antrag",
					icon: "folder-open",
					phase: "P4",
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
				phase: "P1" as const,
			})),
			{
				key: "baseline",
				labelKey: "baseline",
				href: "/baseline",
				icon: "shield-check",
				phase: "P1",
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
			phase: "P2",
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
