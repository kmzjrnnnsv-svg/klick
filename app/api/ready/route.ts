import { pingDatabase } from "@/lib/db/health";

// Readiness: Datenbank erreichbar (App-Rolle). Liefert 503, wenn nicht.
export const dynamic = "force-dynamic";

export async function GET() {
	const ok = await pingDatabase();
	return Response.json(
		ok ? { status: "ready" } : { status: "not_ready", reason: "database" },
		{ status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
