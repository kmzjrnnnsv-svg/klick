// Liveness: Prozess antwortet. Keine DB, kein Secret.
export const dynamic = "force-dynamic";

export function GET() {
	return Response.json(
		{ status: "ok", service: "both.money", time: new Date().toISOString() },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
