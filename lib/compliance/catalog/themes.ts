import type { Domain } from "@/db/schema/enums";

// Neun Themen in Alltagssprache statt 19 Fachbereichen (Teil Z5). Die
// Zuordnung gilt je Maßnahme: zuerst eine Ausnahme je Code, sonst der
// Fachbereich. So landen die Datenschutz-Maßnahmen aus verschiedenen
// Bereichen gemeinsam bei „Daten von Menschen schützen“.

export const THEMES = [
	"lead",
	"access",
	"tech",
	"build",
	"incident",
	"partners",
	"privacy",
	"money",
	"people",
] as const;
export type Theme = (typeof THEMES)[number];

// short: Beschriftung in der Übersicht
export const THEME_INFO: Record<
	Theme,
	{ title: string; short: string; simple: string }
> = {
	lead: {
		short: "Leitung",
		title: "Wer entscheidet und passt auf?",
		simple:
			"Die Leitung legt Regeln fest, kennt die Gefahren und prüft, ob alles klappt.",
	},
	access: {
		short: "Zugang",
		title: "Wer darf rein?",
		simple:
			"Nur wer etwas braucht, kommt an Räume, Geräte und Daten. Mit gutem Schloss.",
	},
	tech: {
		short: "Technik",
		title: "Technik sicher betreiben",
		simple:
			"Geräte, Netz und Programme laufen sicher, werden gepflegt und beobachtet.",
	},
	build: {
		short: "Bauen",
		title: "Sicher bauen und testen",
		simple:
			"Software und Produkte werden von Anfang an sicher gebaut und getestet.",
	},
	incident: {
		short: "Notfall",
		title: "Wenn etwas passiert",
		simple:
			"Bei Störungen und Angriffen weiß jede Person, was zu tun ist, und die Arbeit geht weiter.",
	},
	partners: {
		short: "Helfer",
		title: "Helfer von außen",
		simple:
			"Andere Firmen, die mithelfen, werden gut ausgesucht und regelmäßig geprüft.",
	},
	privacy: {
		short: "Personendaten",
		title: "Daten von Menschen schützen",
		simple:
			"Daten über Menschen werden nur genutzt, wenn es erlaubt ist, und gut geschützt.",
	},
	money: {
		short: "Geld",
		title: "Geld sauber und sicher halten",
		simple:
			"Geld kommt nicht von Verbrechern, Zahlungen sind sicher, und fremdes Geld ist gut verwahrt.",
	},
	people: {
		short: "Menschen",
		title: "Menschen schulen und einbinden",
		simple:
			"Alle wissen, worauf sie achten müssen, und lernen regelmäßig dazu.",
	},
};

const BY_DOMAIN: Record<Domain, Theme> = {
	governance: "lead",
	compliance: "lead",
	risk: "lead",
	access: "access",
	physical: "access",
	asset: "tech",
	operations: "tech",
	network: "tech",
	crypto: "tech",
	development: "build",
	incident: "incident",
	continuity: "incident",
	supplier: "partners",
	aml: "money",
	payments: "money",
	custody: "money",
	fraud: "money",
	conduct: "money",
	hr: "people",
};

// Ausnahmen je Präfix bzw. Code
const BY_PREFIX: readonly (readonly [string, Theme])[] = [
	["CC-PRV-", "privacy"],
	["CC-KEY-", "money"],
];

export function themeOf(control: { code: string; domain: Domain }): Theme {
	for (const [prefix, theme] of BY_PREFIX)
		if (control.code.startsWith(prefix)) return theme;
	return BY_DOMAIN[control.domain];
}
