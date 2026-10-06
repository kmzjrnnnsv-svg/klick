// Liveness: Prozess antwortet. Keine DB, kein Secret, kein Rate-Limit (nginx).
export const dynamic = "force-dynamic";

export function GET() {
	return Response.json(
		{ status: "ok", service: "klick", time: new Date().toISOString() },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
