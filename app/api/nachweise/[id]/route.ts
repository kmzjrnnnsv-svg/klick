import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { evidence, orgSettings } from "@/db/schema";
import { AuthError, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { decryptBytes, unpackEnvelope, unwrapDek } from "@/lib/crypto/envelope";
import { mutateOrg } from "@/lib/db/with-org";
import { egressGuard } from "@/lib/dlp/egress";
import { env } from "@/lib/env";
import { evidenceAad } from "@/lib/evidence/aad";
import { rateLimited } from "@/lib/export/respond";
import { appUrl, attachmentDisposition, plainPage } from "@/lib/http/responses";
import { logger } from "@/lib/log";

export const dynamic = "force-dynamic";

// Downloads öffnet der Browser direkt — Fehler als kurze Seite mit Weg zurück
// statt leerer 401/403/404.
const notFound = () =>
	plainPage(
		404,
		"Nachweis nicht gefunden",
		"Diesen Nachweis gibt es nicht (mehr) oder er gehört nicht zu deiner Organisation.",
	);

// Auth-gated Download: Guard → RLS-Lookup → Entschlüsselung mit Org-DEK →
// Attachment. Vertrauliche Nachweise verlangen Step-up. Jeder Download steht
// im Audit-Log (auch der von Prüfer:innen). Fremde ID → 404, kein Orakel.
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	let ctx: Awaited<ReturnType<typeof requireOrg>>;
	try {
		ctx = await requireOrg({ evidence: ["read"] });
	} catch (e) {
		if (e instanceof AuthError) {
			if (e.code === "unauthenticated" || e.code === "session_expired")
				return NextResponse.redirect(
					appUrl("/login?grund=sitzung-abgelaufen"),
					303,
				);
			return plainPage(
				403,
				"Kein Zugriff",
				"Für diesen Nachweis fehlen dir die Rechte. Frag die Inhaber:in deiner Organisation.",
			);
		}
		throw e;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
	const limited =
		rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "evidence_download"));
	if (limited) return limited;

	const e = env();
	if (!(e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY)) {
		return notFound();
	}

	type Payload =
		| { kind: "none" }
		| { kind: "denied"; reason: "grant_required" | "step_up_required" }
		| {
				kind: "ok";
				row: typeof evidence.$inferSelect;
				dek: { wrapped: string; keyVersion: number };
		  };
	const payload = await mutateOrg<Payload>(toOrgCtx(ctx), async (tx) => {
		const [row] = await tx
			.select()
			.from(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.organizationId, ctx.orgId)))
			.limit(1);
		if (!row?.storageKey) return { result: { kind: "none" }, audit: [] };
		// Streng geheim (z. B. von DLP angehoben): Prüfer:innen nur mit Grant.
		if (
			row.classification === "secret" &&
			ctx.orgRole === "auditor" &&
			!ctx.grants.includes("secret_evidence")
		) {
			return {
				result: { kind: "denied", reason: "grant_required" },
				audit: {
					action: "evidence.download",
					target: `evidence:${id}`,
					outcome: "denied",
					after: { reason: "grant_required" },
				},
			};
		}
		const sensitive =
			row.classification === "confidential" || row.classification === "secret";
		if (sensitive && !ctx.stepUpFresh) {
			return {
				result: { kind: "denied", reason: "step_up_required" },
				audit: {
					action: "evidence.download",
					target: `evidence:${id}`,
					outcome: "denied",
					after: { reason: "step_up_required" },
				},
			};
		}
		const [s] = await tx
			.select({
				encryptedDek: orgSettings.encryptedDek,
				keyVersion: orgSettings.keyVersion,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		if (!s) return { result: { kind: "none" }, audit: [] };
		return {
			result: {
				kind: "ok",
				row,
				dek: { wrapped: s.encryptedDek, keyVersion: s.keyVersion },
			},
			audit: {
				action: "evidence.download",
				target: `evidence:${id}`,
				after: { fileName: row.fileName, classification: row.classification },
			},
		};
	});

	if (payload.kind === "none") return notFound();
	if (payload.kind === "denied") {
		// Vertraulich ohne frische MFA: zur Bestätigung und danach zurück.
		if (payload.reason === "step_up_required")
			return NextResponse.redirect(
				appUrl(
					`/login/2fa?stepup=1&zurueck=${encodeURIComponent(`/api/nachweise/${id}`)}`,
				),
				303,
			);
		return plainPage(
			403,
			"Streng geheim",
			"Dieser Nachweis ist als geheim eingestuft. Prüfer:innen brauchen dafür eine eigene Freigabe der Organisation.",
		);
	}

	let plain: Uint8Array;
	try {
		const { getBytes } = await import("@/lib/storage/s3");
		const packed = await getBytes(payload.row.storageKey as string);
		const dek = await unwrapDek(payload.dek);
		plain = await decryptBytes(unpackEnvelope(packed), dek, evidenceAad(id));
	} catch (err) {
		const ref = crypto.randomUUID().slice(0, 8);
		logger.error({ err, ref, evidenceId: id }, "evidence download failed");
		return plainPage(
			502,
			"Datei gerade nicht lesbar",
			`Der Speicher hat die Datei nicht geliefert. Versuch es gleich noch einmal; bleibt es so, nenne die Referenz ${ref}.`,
		);
	}

	return new NextResponse(new Uint8Array(plain), {
		status: 200,
		headers: {
			"Content-Type": payload.row.mimeType ?? "application/octet-stream",
			"Content-Disposition": attachmentDisposition(
				payload.row.fileName ?? "nachweis",
			),
			"Content-Length": String(plain.byteLength),
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
		},
	});
}
