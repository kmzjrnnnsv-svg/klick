import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { env } from "@/lib/env";
import { buildZip } from "@/lib/export/zip";
import { teamsConfig } from "@/lib/teams/config";
import {
	buildTeamsManifest,
	colorIcon,
	outlineIcon,
} from "@/lib/teams/manifest";

export const dynamic = "force-dynamic";

// App-Paket für die Kunden-IT (T5): manifest.json mit Symbolen, zum
// Hochladen in den Org-Katalog von Teams. Enthält keine Geheimnisse.
export async function GET() {
	try {
		await requireOrg({ integration: ["read"] });
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
	const config = teamsConfig();
	if (!config) return new NextResponse("teams_not_configured", { status: 404 });
	const manifest = buildTeamsManifest({
		appId: config.appId,
		clientId: config.clientId,
		baseUrl: env().BETTER_AUTH_URL,
	});
	const zip = buildZip([
		{ name: "manifest.json", data: JSON.stringify(manifest, null, 2) },
		{ name: "color.png", data: colorIcon() },
		{ name: "outline.png", data: outlineIcon() },
	]);
	return new NextResponse(Buffer.from(zip), {
		headers: {
			"content-type": "application/zip",
			"content-disposition": 'attachment; filename="klick-teams.zip"',
			"cache-control": "no-store",
		},
	});
}
