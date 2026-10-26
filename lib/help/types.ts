// Hilfe-Wiki (/hilfe): Artikel als Daten — rein. Normbezüge sind
// Anforderungsschlüssel aus dem Katalog (`iso27001:A.5.1`), ein Test prüft
// sie gegen REQUIREMENT_BY_KEY.

export type HelpArea =
	| "basics"
	| "implement"
	| "registers"
	| "governance"
	| "casp"
	| "settings";

export const HELP_AREAS: HelpArea[] = [
	"basics",
	"implement",
	"registers",
	"governance",
	"casp",
	"settings",
];

export type HelpSection = {
	// Anker auf der Artikelseite
	id: string;
	heading: string;
	body?: string[];
	// nummerierte Schritte
	steps?: string[];
	// Aufzählung
	list?: string[];
	// Hinweis am Ende des Abschnitts
	tip?: string;
};

export type HelpNorm = {
	// Anforderungsschlüssel `rahmenwerk:code`
	key: string;
	// wofür der Bereich bei dieser Anforderung hilft
	why: string;
};

export type HelpArticle = {
	slug: string;
	area: HelpArea;
	title: string;
	summary: string;
	// „employee“ = auch für Mitarbeitende sichtbar
	audience?: "employee";
	sections: HelpSection[];
	// Wer darf was (Rollen und Rechte)
	roles?: string[];
	// Was Klick von selbst tut (Tick, Erinnerungen, Abweichungen …)
	automation?: string[];
	faq?: { q: string; a: string }[];
	norms?: HelpNorm[];
	related?: string[];
};
