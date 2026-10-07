import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLog } from "@/db/schema";
import { AuthError, requirePlatformAdmin } from "@/lib/auth/guards";
import { withPlatform } from "@/lib/db/with-org";

export const dynamic = "force-dynamic";

// CSV-Export des Audit-Logs für Plattform-Admins (ISO A.8.15, DORA Art. 10).
// Jeder Export ist selbst ein auditierter Plattform-Zugriff (withPlatform mit
// Begründung). Filter: ?org=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD; Obergrenze
// 50 000 Zeilen je Abruf — darüber enger filtern. Hash-Kette bleibt prüfbar,
// weil prevHash/hash mit exportiert werden.

const MAX_ROWS = 50_000;
const COLUMNS = [
	"seq",
	"at",
	"organization_id",
	"actor_user_id",
	"action",
	"target",
	"outcome",
	"ip",
	"user_agent",
	"before",
	"after",
	"prev_hash",
	"hash",
] as const;

function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	const s =
		v instanceof Date
			? v.toISOString()
			: typeof v === "object"
				? JSON.stringify(v)
				: String(v);
	// Formel-Injektion in Tabellenkalkulationen entschärfen.
	const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
	return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function parseDay(v: string | null): Date | null {
	if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
	const d = new Date(`${v}T00:00:00.000Z`);
	return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
	let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
	try {
		admin = await requirePlatformAdmin();
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
	const url = new URL(req.url);
	const org = url.searchParams.get("org");
	const from = parseDay(url.searchParams.get("from"));
	const toDay = parseDay(url.searchParams.get("to"));
	const to = toDay ? new Date(toDay.getTime() + 86_400_000) : null;
	if (org && !/^[0-9a-f-]{36}$/i.test(org))
		return new NextResponse("ungültige org", { status: 400 });

	const conditions = [
		org ? eq(auditLog.organizationId, org) : undefined,
		from ? gte(auditLog.at, from) : undefined,
		to ? lte(auditLog.at, to) : undefined,
	].filter((c) => c !== undefined);

	const rows = await withPlatform(
		{
			userId: admin.userId,
			reason: `Admin: Audit-Log-Export (CSV)${org ? ` org=${org}` : ""}${from ? ` from=${from.toISOString().slice(0, 10)}` : ""}${toDay ? ` to=${toDay.toISOString().slice(0, 10)}` : ""}`,
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		(tx) =>
			tx
				.select()
				.from(auditLog)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(asc(auditLog.seq))
				.limit(MAX_ROWS),
	);

	const lines = [COLUMNS.join(";")];
	for (const r of rows) {
		lines.push(
			[
				r.seq,
				r.at,
				r.organizationId,
				r.actorUserId,
				r.action,
				r.target,
				r.outcome,
				r.ip,
				r.userAgent,
				r.before,
				r.after,
				r.prevHash,
				r.hash,
			]
				.map(csvCell)
				.join(";"),
		);
	}
	// BOM, damit Excel UTF-8 erkennt; Semikolon als Trenner für DE-Locale.
	const body = `﻿${lines.join("\r\n")}\r\n`;
	const stamp = new Date().toISOString().slice(0, 10);
	return new NextResponse(body, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"X-Row-Count": String(rows.length),
			...(rows.length >= MAX_ROWS ? { "X-Truncated": "true" } : {}),
		},
	});
}
