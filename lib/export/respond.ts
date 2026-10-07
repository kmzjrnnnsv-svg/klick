import { NextResponse } from "next/server";
import {
	AuthError,
	type OrgContext,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { toCsv } from "@/lib/csv";
import { mutateOrg } from "@/lib/db/with-org";

// Exporte unter /api/export/*: Guard (export:create), Datei als Attachment,
// jeder Export als Audit-Eintrag mit Zeilenzahl (Alarmierung > 1 000 Zeilen
// läuft über den Audit-Log; vgl. Härtung „Export > 1 000 Zeilen").

export async function exportGuard(): Promise<OrgContext | NextResponse> {
	try {
		return await requireOrg({ export: ["create"] });
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
}

// Pakete (ZIP) verlangen Step-up (Härtung: Export/Prüfungspaket). Fehlt die
// frische Bestätigung, leiten wir zur 2FA-Seite und zurück zum Download.
export async function exportStepUpGuard(
	req: Request,
): Promise<OrgContext | NextResponse> {
	try {
		return await requireStepUp({ export: ["create"] });
	} catch (e) {
		if (e instanceof AuthError) {
			if (e.code === "step_up_required") {
				const url = new URL(req.url);
				const back = `${url.pathname}${url.search}`;
				return NextResponse.redirect(
					new URL(
						`/login/2fa?stepup=1&zurueck=${encodeURIComponent(back)}`,
						url.origin,
					),
					303,
				);
			}
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		}
		throw e;
	}
}

export function zipResponse(filename: string, body: Uint8Array): NextResponse {
	return new NextResponse(new Uint8Array(body), {
		status: 200,
		headers: {
			...COMMON,
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Content-Length": String(body.byteLength),
		},
	});
}

export async function auditExport(
	ctx: OrgContext,
	kind: string,
	rows: number,
	detail?: Record<string, unknown>,
): Promise<void> {
	await mutateOrg(toOrgCtx(ctx), async () => ({
		result: null,
		audit: {
			action: `export.${kind}`,
			target: `organization:${ctx.orgId}`,
			after: { rows, ...detail },
			...(rows > 1000 ? { outcome: "success" as const } : {}),
		},
	}));
}

const COMMON = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
};

export function csvResponse(
	filename: string,
	header: readonly string[],
	rows: readonly unknown[][],
): NextResponse {
	return new NextResponse(toCsv(header, rows), {
		status: 200,
		headers: {
			...COMMON,
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"X-Row-Count": String(rows.length),
		},
	});
}

export function markdownResponse(filename: string, body: string): NextResponse {
	return new NextResponse(body, {
		status: 200,
		headers: {
			...COMMON,
			"Content-Type": "text/markdown; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}

export function stamp(): string {
	return new Date().toISOString().slice(0, 10);
}

// Markdown-Tabellenzelle: Pipes und Zeilenumbrüche entschärfen.
export function md(v: unknown): string {
	if (v === null || v === undefined) return "";
	return String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}
