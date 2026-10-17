"use server";

import { and, count, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
	products,
	securityEngagements,
	securityFindings,
	securityScans,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { FINDING_STATUS_MACHINE } from "@/lib/entities/security-finding";
import { canTransition } from "@/lib/entities/status-machine";
import { screenUpload } from "@/lib/evidence/store";
import { enqueue } from "@/lib/jobs/boss";
import { getOrgLimiter } from "@/lib/rate-limit";
import { importScan } from "@/lib/security/import-service";
import { parseScanFile } from "@/lib/security/parsers";
import { validateTargetUrl } from "@/lib/security/quick-check/ssrf";
import {
	executeQuickCheck,
	QUICK_CHECK_JOB,
	QUICK_CHECKS_PER_DAY,
	type QuickCheckJob,
} from "@/lib/security/quick-check-service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	acceptFindingSchema,
	setFindingStatusSchema,
	startQuickCheckSchema,
} from "@/lib/validation/security";

// Security-Checks: Scan-Datei importieren, passiven Schnellcheck starten,
// Befunde bearbeiten/akzeptieren. Aktive Tests (Pentests) laufen nie aus
// Klick — dafür gibt es die Pentest-Aufträge mit schriftlicher Beauftragung.

const PATH = "/sicherheit";

async function importScanFileImpl(
	formData: FormData,
): Promise<
	ActionResult<{ scanId: string; findings: number; created: number }>
> {
	const c = await requireOrg({ security: ["create"] });
	const file = formData.get("file");
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	// Pipeline (Typ, clamd); Secrets im Bericht sind erwartet und werden beim
	// Import redigiert, alle anderen DLP-Regeln gelten.
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		classification: "confidential",
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
		secretsExpected: true,
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const text = new TextDecoder().decode(bytes);
	const parsed = parseScanFile(text, v.safeName);
	if (!parsed.ok) return { ok: false, error: `scan_${parsed.error}` };
	let productId = String(formData.get("productId") ?? "") || null;
	// Import in einen Sicherheitsauftrag: Befunde gehören zum Auftrag, kein
	// Vollscan-Abgleich (der Auftrag sieht nur einen Ausschnitt).
	const engagementId = String(formData.get("engagementId") ?? "") || null;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		if (engagementId) {
			const [e] = await tx
				.select({
					id: securityEngagements.id,
					status: securityEngagements.status,
					productId: securityEngagements.productId,
				})
				.from(securityEngagements)
				.where(
					and(
						eq(securityEngagements.id, engagementId),
						eq(securityEngagements.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (
				!e ||
				e.status === "planned" ||
				e.status === "closed" ||
				e.status === "cancelled"
			)
				return { result: null, audit: [] };
			productId = productId ?? e.productId;
		}
		if (productId) {
			const [p] = await tx
				.select({ id: products.id })
				.from(products)
				.where(
					and(eq(products.id, productId), eq(products.organizationId, c.orgId)),
				)
				.limit(1);
			if (!p) return { result: null, audit: [] };
		}
		const r = await importScan(tx, c, {
			parsed: parsed.scan,
			source: "upload",
			fullScan: !engagementId && formData.get("fullScan") === "1",
			productId,
			raw: { text, fileName: v.safeName },
		});
		if (engagementId)
			await tx
				.update(securityFindings)
				.set({ engagementId })
				.where(
					and(
						eq(securityFindings.organizationId, c.orgId),
						eq(securityFindings.lastScanId, r.scanId),
						isNull(securityFindings.engagementId),
					),
				);
		return { result: r, audit: r.audits };
	});
	if (!res) return { ok: false, error: "notFound" };
	revalidatePath(PATH, "layout");
	return {
		ok: true,
		data: {
			scanId: res.scanId,
			findings: parsed.scan.findings.length,
			created: res.counts.new,
		},
	};
}

async function startQuickCheckImpl(
	input: unknown,
): Promise<ActionResult<{ scanId: string }>> {
	const c = await requireOrg({ security: ["create"] });
	const parsed = startQuickCheckSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const target = validateTargetUrl(d.url);
	if (!target.ok) return { ok: false, error: `target_${target.error}` };
	const url = target.url.toString();
	const out = await mutateOrg<ActionResult<{ scanId: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const since = new Date(Date.now() - 86_400_000);
			const [n] = await tx
				.select({ n: count() })
				.from(securityScans)
				.where(
					and(
						eq(securityScans.organizationId, c.orgId),
						eq(securityScans.tool, "quick_check"),
						gte(securityScans.startedAt, since),
					),
				);
			if ((n?.n ?? 0) >= QUICK_CHECKS_PER_DAY)
				return { result: { ok: false, error: "quota" }, audit: [] };
			if (d.productId) {
				const [p] = await tx
					.select({ id: products.id })
					.from(products)
					.where(
						and(
							eq(products.id, d.productId),
							eq(products.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			}
			const [row] = await tx
				.insert(securityScans)
				.values({
					organizationId: c.orgId,
					tool: "quick_check",
					source: "quick_check",
					toolName: "Klick-Schnellcheck",
					target: url,
					productId: d.productId ?? null,
					fullScan: true,
					status: "running",
					createdByUserId: c.userId,
				})
				.returning({ id: securityScans.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { scanId: row.id } },
				audit: {
					action: "security.quick_check_started",
					target: `security_scan:${row.id}`,
					after: {
						url,
						productId: d.productId ?? null,
						// Bestätigung der Berechtigung (nur eigene/beauftragte Ziele)
						authorizationConfirmed: true,
					},
				},
			};
		},
	);
	if (!out.ok) return out;
	const job: QuickCheckJob = {
		orgId: c.orgId,
		scanId: out.data.scanId,
		url,
		userId: c.userId,
	};
	if (!(await enqueue(QUICK_CHECK_JOB, job)))
		after(() => executeQuickCheck(job));
	revalidatePath(PATH, "layout");
	return out;
}

async function loadFinding(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	id: string,
) {
	const [row] = await tx
		.select({
			id: securityFindings.id,
			status: securityFindings.status,
			acceptedUntil: securityFindings.acceptedUntil,
			statusNote: securityFindings.statusNote,
		})
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.id, id),
				eq(securityFindings.organizationId, orgId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function setFindingStatusImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ security: ["update"] });
	const parsed = setFindingStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { findingId, status, note } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const row = await loadFinding(tx, c.orgId, findingId);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(FINDING_STATUS_MACHINE, row.status, status, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};
		await tx
			.update(securityFindings)
			.set({
				status,
				statusNote: note ?? null,
				resolvedAt: status === "resolved" ? new Date() : null,
				acceptedUntil: null,
			})
			.where(eq(securityFindings.id, row.id));
		return {
			result: { ok: true, data: { status, approvalRequested: false } },
			audit: {
				action: "security.finding_status",
				target: `security_finding:${row.id}`,
				before: { status: row.status },
				after: { status, note: note ?? null },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

// Akzeptieren = bewusste Risikoentscheidung: Begründung und Ablauf (höchstens
// ein Jahr); danach öffnet der Tick den Befund wieder.
async function acceptFindingImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ security: ["accept"] });
	const parsed = acceptFindingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const until = new Date(`${d.acceptedUntil}T00:00:00Z`);
	const now = Date.now();
	if (until.getTime() <= now || until.getTime() > now + 366 * 86_400_000)
		return { ok: false, error: "acceptedUntil_range" };
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const row = await loadFinding(tx, c.orgId, d.findingId);
		if (!row || row.status === "resolved" || row.status === "false_positive")
			return { result: { ok: false, error: "notFound" }, audit: [] };
		await tx
			.update(securityFindings)
			.set({
				status: "accepted",
				statusNote: d.note,
				acceptedUntil: d.acceptedUntil,
			})
			.where(eq(securityFindings.id, row.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "security.finding_accepted",
				target: `security_finding:${row.id}`,
				before: { status: row.status },
				after: {
					status: "accepted",
					note: d.note,
					acceptedUntil: d.acceptedUntil,
				},
			},
		};
	});
	revalidatePath(PATH, "layout");
	return res;
}

export const importScanFile = safeAction("importScanFile", importScanFileImpl);
export const startQuickCheck = safeAction(
	"startQuickCheck",
	startQuickCheckImpl,
);
export const setFindingStatus = safeAction(
	"setFindingStatus",
	setFindingStatusImpl,
);
export const acceptFinding = safeAction("acceptFinding", acceptFindingImpl);
