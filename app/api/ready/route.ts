import { checkReadiness, summarize } from "@/lib/health/readiness";

// Readiness: Datenbank, Objektspeicher, clamd, Enterprise-DBs (je wenn
// konfiguriert), Scheduler und Mail. 503, sobald eine Pflicht-Abhängigkeit
// ausfällt; Zustand je Abhängigkeit im JSON (ohne Hosts oder Fehlertexte).
export const dynamic = "force-dynamic";

export async function GET() {
	const { status, httpStatus, checks } = summarize(await checkReadiness());
	return Response.json(
		{ status, checks },
		{ status: httpStatus, headers: { "Cache-Control": "no-store" } },
	);
}
