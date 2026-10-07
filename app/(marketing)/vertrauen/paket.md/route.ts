import { NextResponse } from "next/server";
import { platformSupplierMarkdown } from "@/lib/compliance/catalog/platform-supplier";

// Öffentlicher Download des Lieferantenpakets der Plattform (Markdown).
export function GET() {
	return new NextResponse(platformSupplierMarkdown(), {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Content-Disposition": 'attachment; filename="klick-lieferantenpaket.md"',
			"Cache-Control": "public, max-age=3600",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
