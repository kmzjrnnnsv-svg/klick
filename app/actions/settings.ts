"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { type EntityProfile, evidence, orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary, revokeSessionsOfOrgMembers } from "@/lib/auth/org";
import { auth } from "@/lib/auth/server";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { DEFAULT_PREFIXES } from "@/lib/documents/numbering";
import { env } from "@/lib/env";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { entityProfileSchema } from "@/lib/validation/org";

async function stepUp(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		return { ok: true, ctx: await requireStepUp({ settings: ["update"] }) };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
}

const label5 = z.tuple([
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
]);
const riskSettingsSchema = z
	.object({
		likelihood: label5,
		impact: label5,
		acceptable: z.coerce.number().int().min(1).max(24),
		tolerable: z.coerce.number().int().min(2).max(25),
		allowSelfApproval: z.boolean(),
	})
	.refine((v) => v.tolerable > v.acceptable, {
		message: "tolerierbar muss grösser als akzeptabel sein",
		path: ["tolerable"],
	});

async function updateRiskSettingsImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = riskSettingsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				riskScales: orgSettings.riskScales,
				riskAppetite: orgSettings.riskAppetite,
				allowSelfApproval: orgSettings.allowSelfApproval,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({
				riskScales: { likelihood: d.likelihood, impact: d.impact },
				riskAppetite: { acceptable: d.acceptable, tolerable: d.tolerable },
				allowSelfApproval: d.allowSelfApproval,
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.risk",
				target: `organization:${c.orgId}`,
				before: before ?? null,
				after: {
					riskAppetite: { acceptable: d.acceptable, tolerable: d.tolerable },
					allowSelfApproval: d.allowSelfApproval,
				},
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/risiken", "layout");
	return { ok: true, data: undefined };
}

const numberingSchema = z.object({
	numbering: z.record(
		z.string(),
		z.object({
			prefix: z.string().regex(/^[A-Z]{1,5}$/, "1–5 Grossbuchstaben"),
			next: z.coerce.number().int().min(1).max(99999),
		}),
	),
});

async function updateNumberingImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = numberingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const allowed = new Set(Object.keys(DEFAULT_PREFIXES));
	const numbering = Object.fromEntries(
		Object.entries(parsed.data.numbering).filter(([k]) => allowed.has(k)),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ documentNumbering: orgSettings.documentNumbering })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ documentNumbering: numbering })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.numbering",
				target: `organization:${c.orgId}`,
				before: before?.documentNumbering ?? null,
				after: numbering,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Stammdaten für Meldungen: LEI, Sitzland, Behörde, Bilanzsumme, Rechtsform,
// Registernummer — fließen in Informationsregister, Antrag, Lieferantenpaket.
async function updateEntityProfileImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = entityProfileSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const next: EntityProfile = Object.fromEntries(
		Object.entries(parsed.data).filter(([, v]) => v !== undefined),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ entityProfile: orgSettings.entityProfile })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ entityProfile: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.entity_profile",
				target: `organization:${c.orgId}`,
				before: before?.entityProfile ?? null,
				after: next,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Organisation löschen (Crypto-Shredding): Sitzungen der Mitglieder beenden,
// Nachweis-Dateien im Objektspeicher löschen, Organisation über Better Auth
// entfernen — die Kaskade löscht alle Org-Tabellen inklusive org_settings und
// damit den einzigen Ort des Mandantenschlüssels. Das Audit-Log der Org bleibt
// (append-only, ohne FK) als Spur; die Löschbestätigung geht per Mail an den
// Owner. Nur Owner, Step-up, Kurzname muss abgetippt werden.
const deleteOrgSchema = z.object({
	confirmSlug: z.string().trim().min(1).max(120),
	exportConfirmed: z.literal(true),
});

async function deleteOrganizationActionImpl(
	input: unknown,
): Promise<ActionResult<{ deletedAt: string }>> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = deleteOrgSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const org = await getOrgSummary(c.orgId);
	if (!org) return { ok: false, error: "notFound" };
	if (parsed.data.confirmSlug !== org.slug)
		return {
			ok: false,
			error: "slugMismatch",
			fieldErrors: { confirmSlug: ["slugMismatch"] },
		};

	// 1) Bestand erfassen + letzter Eintrag in der Org-Kette.
	const { fileCount } = await mutateOrg(toOrgCtx(c), async (tx) => {
		const rows = await tx
			.select({ key: evidence.storageKey })
			.from(evidence)
			.where(eq(evidence.organizationId, c.orgId));
		return {
			result: { fileCount: rows.filter((r) => r.key).length },
			audit: {
				action: "org.delete_requested",
				target: `organization:${c.orgId}`,
				after: { slug: org.slug, files: rows.length },
			},
		};
	});

	// 2) Dateien im Objektspeicher löschen (verschlüsselt, aber weg ist weg).
	let filesDeleted = 0;
	const e = env();
	if (e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY) {
		const { deleteObjects, listKeys } = await import("@/lib/storage/s3");
		const keys = await listKeys(`org/${c.orgId}/`);
		filesDeleted = keys.length === 0 ? 0 : await deleteObjects(keys);
	}

	// 3) Fremde Sitzungen beenden, dann Organisation löschen (Kaskade).
	const sessionsRevoked = await revokeSessionsOfOrgMembers(c.orgId, c.userId);
	await auth.api.deleteOrganization({
		body: { organizationId: c.orgId },
		headers: await headers(),
	});
	const deletedAt = new Date().toISOString();

	// 4) Plattform-Audit + Löschbestätigung.
	await auditPlatform(
		{ userId: c.userId, ip: c.ip, userAgent: c.userAgent },
		{
			action: "org.deleted",
			organizationId: c.orgId,
			target: `organization:${c.orgId}`,
			after: {
				slug: org.slug,
				name: org.name,
				filesDeleted,
				filesExpected: fileCount,
				sessionsRevoked,
				deletedAt,
			},
		},
	);
	const mail = transactionalEmail({
		subject: `Löschbestätigung: ${org.name}`,
		eyebrow: "Löschbestätigung",
		title: `Die Organisation „${org.name}“ wurde gelöscht`,
		body: `Zeitpunkt: ${deletedAt}\nKurzname: ${org.slug}\nGelöschte Nachweis-Dateien: ${filesDeleted}\nBeendete Sitzungen anderer Mitglieder: ${sessionsRevoked}\n\nDer Mandantenschlüssel wurde mit den Organisationsdaten vernichtet (Crypto-Shredding); verschlüsselte Reste in Backups sind damit unlesbar und fallen nach der Backup-Aufbewahrung (30 Tage) weg. Das Audit-Log der Organisation bleibt als Nachweis der Löschung erhalten.\n\nAufbewahrungspflichten (z. B. GwG § 8, HGB § 257) liegen bei der Organisation — bitte bewahre den Export entsprechend auf.`,
	});
	await sendTransactionalMail({ to: c.email, ...mail }).catch(() => undefined);
	return { ok: true, data: { deletedAt } };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const updateRiskSettings = safeAction(
	"updateRiskSettings",
	updateRiskSettingsImpl,
);
export const updateNumbering = safeAction(
	"updateNumbering",
	updateNumberingImpl,
);
export const updateEntityProfile = safeAction(
	"updateEntityProfile",
	updateEntityProfileImpl,
);
export const deleteOrganizationAction = safeAction(
	"deleteOrganizationAction",
	deleteOrganizationActionImpl,
);
