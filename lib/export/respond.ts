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
import { egressGuard } from "@/lib/dlp/egress";
import { getOrgLimiter } from "@/lib/rate-limit";
import { todayBerlin } from "@/lib/time/berlin";

// Exporte unter /api/export/*: Guard (export:create), Datei als Attachment,
// jeder Export als Audit-Eintrag mit Zeilenzahl (Alarmierung > 1 000 Zeilen
// läuft über den Audit-Log; vgl. Härtung „Export > 1 000 Zeilen").

// Org-Rate-Limit (Noisy Neighbour) für die teuren Pfade: 429 mit Retry-After.
export function rateLimited(orgId: string): NextResponse | null {
	const d = getOrgLimiter().check(orgId);
	if (d.allowed) return null;
	return new NextResponse("Zu viele Anfragen für diese Organisation", {
		status: 429,
		headers: {
			"Retry-After": String(Math.max(1, Math.ceil(d.retryAfterMs / 1000))),
			"Cache-Control": "no-store",
		},
	});
}

export async function exportGuard(): Promise<OrgContext | NextResponse> {
	try {
		const ctx = await requireOrg({ export: ["create"] });
		return rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "export")) ?? ctx;
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
		const ctx = await requireStepUp({ export: ["create"] });
		return rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "export")) ?? ctx;
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

// Liefert die Export-ID: sie steht im Audit-Log und als Kennzeichnung in der
// Datei (exportMark) — ein aufgetauchtes Dokument lässt sich so einer Person
// und einem Zeitpunkt zuordnen (DLP).
export async function auditExport(
	ctx: OrgContext,
	kind: string,
	rows: number,
	detail?: Record<string, unknown>,
): Promise<ExportMark> {
	const mark: ExportMark = {
		exportId: crypto.randomUUID(),
		by: ctx.name || ctx.email,
		at: new Date(),
	};
	await mutateOrg(toOrgCtx(ctx), async () => ({
		result: null,
		audit: {
			action: `export.${kind}`,
			target: `organization:${ctx.orgId}`,
			after: { rows, exportId: mark.exportId, ...detail },
			...(rows > 1000 ? { outcome: "success" as const } : {}),
		},
	}));
	return mark;
}

export type ExportMark = { exportId: string; by: string; at: Date };

export function exportMarkLine(mark: ExportMark): string {
	const at = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(mark.at);
	return `> Vertraulich – exportiert von ${mark.by} am ${at} · Export-ID ${mark.exportId}`;
}

const COMMON = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
};

// CSV bleibt maschinenlesbar (keine Kommentarzeile); die Export-ID steht im
// Header und im Audit-Log.
export function csvResponse(
	filename: string,
	header: readonly string[],
	rows: readonly unknown[][],
	mark?: ExportMark,
): NextResponse {
	return new NextResponse(toCsv(header, rows), {
		status: 200,
		headers: {
			...COMMON,
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"X-Row-Count": String(rows.length),
			...(mark ? { "X-Export-Id": mark.exportId } : {}),
		},
	});
}

export function markdownResponse(
	filename: string,
	body: string,
	mark?: ExportMark,
): NextResponse {
	return new NextResponse(mark ? `${exportMarkLine(mark)}\n\n${body}` : body, {
		status: 200,
		headers: {
			...COMMON,
			"Content-Type": "text/markdown; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			...(mark ? { "X-Export-Id": mark.exportId } : {}),
		},
	});
}

export function stamp(): string {
	return todayBerlin();
}

// Markdown-Tabellenzelle: Pipes und Zeilenumbrüche entschärfen.
export function md(v: unknown): string {
	if (v === null || v === undefined) return "";
	return String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}
