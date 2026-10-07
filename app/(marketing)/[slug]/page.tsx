import { notFound } from "next/navigation";
import { getCmsPageBySlug } from "@/app/actions/cms";
import { MarkdownView } from "@/components/markdown-view";

// Öffentliche Rechtstexte aus cms_pages (Impressum, Datenschutzerklärung …).
// Reservierte Pfade sind App-Routen und dürfen nicht als Slug auftauchen.
const RESERVED = new Set([
	"login",
	"einrichtung",
	"onboarding",
	"einladung",
	"heute",
	"ueberblick",
	"controls",
	"synergien",
	"nachweise",
	"risiken",
	"dokumente",
	"prozesse",
	"dienstleister",
	"assets",
	"vorfaelle",
	"schulungen",
	"datenschutz",
	"organisation",
	"beschluesse",
	"audits",
	"managementbewertung",
	"abweichungen",
	"testprogramm",
	"kalender",
	"roadmap",
	"aml",
	"eigenmittel",
	"kryptowerte",
	"beschwerden",
	"antrag",
	"rahmenwerke",
	"baseline",
	"team",
	"aktivitaet",
	"einstellungen",
	"suche",
	"admin",
	"api",
	"preise",
	"vertrauen",
]);

export default async function CmsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	if (RESERVED.has(slug)) notFound();
	const page = await getCmsPageBySlug(slug);
	if (!page) notFound();
	return (
		<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
			<h1 className="font-serif-display text-3xl text-primary sm:text-4xl">
				{page.title}
			</h1>
			<MarkdownView source={page.body} className="mt-8" />
		</main>
	);
}
