// Readiness: bis die eigene Datenbank angebunden ist (W2) wie Liveness.
export const dynamic = "force-dynamic";

export function GET() {
	return Response.json(
		{ status: "ready", service: "both.money" },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
