// Seite → Hilfe-Artikel („Hilfe zu dieser Seite“ oben in der App). Rein und
// klein, damit der Knopf im Browser nicht alle Artikel lädt. Der längste
// passende Pfad gewinnt; ein Test hält jede Seite der Navigation abgedeckt.

export const HELP_ROUTES: readonly (readonly [string, string])[] = [
	["/heute", "heute"],
	["/heute/aufgaben", "heute"],
	["/heute/freigaben", "freigaben"],
	["/heute/verantwortung", "organisation"],
	["/ueberblick", "ueberblick"],
	["/gap-analyse", "gap-analyse"],
	["/controls", "controls"],
	["/synergien", "controls"],
	["/zusammenhaenge", "zusammenhaenge"],
	["/rahmenwerke", "rahmenwerke"],
	["/baseline", "rahmenwerke"],
	["/nachweise", "nachweise"],
	["/nachweise/verfassen", "nachweise"],
	["/sicherheit", "sicherheit"],
	["/risiken", "risiken"],
	["/dokumente", "dokumente"],
	["/prozesse", "prozesse"],
	["/dienstleister", "dienstleister"],
	["/assets", "assets"],
	["/vorfaelle", "vorfaelle"],
	["/produkte", "produkte"],
	["/schulungen", "schulungen"],
	["/datenschutz", "datenschutz"],
	["/organisation", "organisation"],
	["/beschluesse", "beschluesse"],
	["/aenderungen", "beschluesse"],
	["/managementbewertung", "beschluesse"],
	["/berichte", "beschluesse"],
	["/audits", "audits"],
	["/abweichungen", "audits"],
	["/testprogramm", "audits"],
	["/kalender", "kalender"],
	["/roadmap", "kalender"],
	["/trust-center", "trust-center"],
	["/aml", "geldwaesche"],
	["/eigenmittel", "casp"],
	["/kryptowerte", "casp"],
	["/verwahrung", "casp"],
	["/krypto", "casp"],
	["/beschwerden", "casp"],
	["/antrag", "casp"],
	["/team", "rollen-rechte"],
	["/einstellungen", "einstellungen"],
	["/aktivitaet", "fassungen"],
	["/suche", "erste-schritte"],
	["/bereich", "erste-schritte"],
	["/richtlinien", "richtlinien"],
	["/hilfe", "erste-schritte"],
];

export const HELP_FALLBACK = "erste-schritte";

export function helpSlugForPath(pathname: string): string {
	let best: { slug: string; len: number } | null = null;
	for (const [prefix, slug] of HELP_ROUTES)
		if (
			(pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
			(!best || prefix.length > best.len)
		)
			best = { slug, len: prefix.length };
	return best?.slug ?? HELP_FALLBACK;
}

// Seiten eines Artikels (für „Zur Seite“ auf der Artikelseite)
export function routesForArticle(slug: string): string[] {
	return HELP_ROUTES.filter(
		([p, s]) => s === slug && !p.startsWith("/hilfe"),
	).map(([p]) => p);
}
