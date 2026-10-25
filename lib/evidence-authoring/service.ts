import { and, eq, inArray } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	evidence,
	evidenceDrafts,
	evidenceSignatures,
	roleAssignments,
	tasks,
} from "@/db/schema";
import type { ControlSheetState, RoleFunction } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { getOrgSummary } from "@/lib/auth/org";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { EDGES_BY_CONTROL } from "@/lib/compliance/catalog";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { getOrgProfile, userNames } from "@/lib/compliance/queries";
import { decryptJson, encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { canonicalJson } from "@/lib/evidence-studio/generate/doc";
import { signerSlots } from "@/lib/evidence-studio/generate/service";
import { implementationFor } from "@/lib/evidence-studio/implementation";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";
import { notify } from "@/lib/notifications/notify";
import {
	type AuthoredContent,
	authoredContentSchema,
	contentDate,
	emptyContent,
	measuresOf,
	missingForFinalize,
	normalizeContent,
	resultOf,
} from "./content";
import { type AuthoredMeta, authoredDoc, authoredHash } from "./render";
import { presetOf, TEMPLATE_BY_KEY } from "./templates";

// Nachweise in Klick verfassen (Rohlinge): Entwurf → Abschließen. Erst beim
// Abschließen entsteht der Nachweis — PDF wie die Nachweise aus Registern,
// Ablage über storeEncryptedEvidence (S3 oder Datenbank), Inhalt zusätzlich
// feldverschlüsselt für „neue Fassung“. Danach unveränderlich.

export const draftAad = (id: string) =>
	fieldAad("evidence_drafts", id, "content_enc");
export const evidenceContentAad = (id: string) =>
	fieldAad("evidence", id, "content_enc");

const plusMonths = (iso: string, months: number) => {
	const d = new Date(`${iso}T12:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
};

// Prüffragen der Controls (Checkliste „aus den Controls“)
export async function controlQuestions(
	tx: OrgTx,
	codes: readonly string[],
): Promise<string[]> {
	if (codes.length === 0) return [];
	const rows = await tx
		.select({ questions: controls.auditQuestions })
		.from(controls)
		.where(inArray(controls.code, [...codes]));
	return [...new Set(rows.flatMap((r) => r.questions ?? []))];
}

export async function loadDraft(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select()
		.from(evidenceDrafts)
		.where(
			and(eq(evidenceDrafts.organizationId, orgId), eq(evidenceDrafts.id, id)),
		)
		.limit(1);
	if (!row) return null;
	const template = TEMPLATE_BY_KEY.get(row.templateKey);
	if (!template) return null;
	const stored = await decryptJson<AuthoredContent>(
		tx,
		orgId,
		row.contentEnc,
		draftAad(row.id),
	);
	const parsed = authoredContentSchema.safeParse(stored);
	const ctx = { today: berlinToday(), me: "", preset: row.preset };
	const content = normalizeContent(
		template,
		parsed.success ? parsed.data : emptyContent(template, ctx),
		ctx,
	);
	return { row, template, content };
}

export async function createDraft(
	tx: OrgTx,
	ctx: { orgId: string; userId: string; name: string },
	input: {
		template: string;
		preset?: string | null;
		title?: string | null;
		controlCodes?: string[];
		sheetControl?: string | null;
		sheetItem?: string | null;
		supersedesId?: string | null;
		content?: AuthoredContent;
		classification?: "internal" | "confidential";
		signers?: string[];
	},
): Promise<{ id: string } | null> {
	const template = TEMPLATE_BY_KEY.get(input.template);
	if (!template) return null;
	const preset = presetOf(template, input.preset ?? null)?.key ?? null;
	const codes = [...new Set(input.controlCodes ?? [])];
	const content =
		input.content ??
		emptyContent(template, {
			today: berlinToday(),
			me: ctx.name,
			preset,
			questions: await controlQuestions(tx, codes),
		});
	const id = crypto.randomUUID();
	await tx.insert(evidenceDrafts).values({
		id,
		organizationId: ctx.orgId,
		templateKey: template.key,
		preset,
		title:
			input.title?.trim() ||
			presetOf(template, preset)?.title ||
			template.title,
		classification: input.classification ?? "internal",
		controlCodes: codes,
		signers: input.signers ?? [...template.signers],
		contentEnc: await encryptJson(tx, ctx.orgId, content, draftAad(id)),
		sheetControl: input.sheetControl ?? null,
		sheetItem: input.sheetItem ?? null,
		supersedesId: input.supersedesId ?? null,
		createdByUserId: ctx.userId,
		updatedByUserId: ctx.userId,
	});
	return { id };
}

export type FinalizeResult =
	| {
			ok: true;
			evidenceId: string;
			tasks: number;
			testId: string | null;
			audit: AuditInput[];
	  }
	| { ok: false; error: "not_found" | "incomplete" | "no_control" };

export async function finalizeDraft(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	draftId: string,
	opts: { createTasks: boolean; recordTest: boolean },
): Promise<FinalizeResult> {
	const loaded = await loadDraft(tx, ctx.orgId, draftId);
	if (!loaded) return { ok: false, error: "not_found" };
	const { row, template, content } = loaded;
	if (missingForFinalize(template, content).length > 0)
		return { ok: false, error: "incomplete" };

	// Controls der Org (fehlende Umsetzungen legt implementationFor an)
	const impls: { code: string; id: string }[] = [];
	for (const code of row.controlCodes) {
		const impl = await implementationFor(tx, ctx.orgId, code);
		if (impl) impls.push({ code, id: impl.id });
	}
	if (opts.recordTest && template.testMethod && impls.length === 0)
		return { ok: false, error: "no_control" };

	const profile = await getOrgProfile(tx, ctx.orgId);
	const active = new Set(profile?.frameworks ?? []);
	const requirements = [
		...new Set(
			impls.flatMap((i) =>
				(EDGES_BY_CONTROL.get(i.code) ?? [])
					.map((e) => e.requirement as string)
					.filter(
						(r) => active.size === 0 || active.has(r.split(":")[0] as string),
					),
			),
		),
	].sort();

	// Fassung: Nachfolger zählt eins weiter
	let version = 1;
	if (row.supersedesId) {
		const [prev] = await tx
			.select({ snapshot: evidence.snapshot })
			.from(evidence)
			.where(
				and(
					eq(evidence.organizationId, ctx.orgId),
					eq(evidence.id, row.supersedesId),
				),
			)
			.limit(1);
		version =
			(((prev?.snapshot as { version?: number } | null)?.version ??
				1) as number) + 1;
	}

	const meta: AuthoredMeta = {
		template: template.key,
		preset: row.preset,
		title: row.title,
		controls: impls.map((i) => i.code),
		signers: row.signers,
	};
	const hash = authoredHash(meta, content);
	const id = crypto.randomUUID();
	const today = berlinToday();
	const createdBy = row.createdByUserId ?? ctx.userId;
	const names = await userNames(tx, [createdBy]);
	const functions = row.signers.filter((s): s is RoleFunction => s !== "-");
	const slots = [
		...(row.signers.includes("-")
			? [
					{
						function: "-",
						mode: "any" as const,
						holders: [names.get(createdBy) ?? ""].filter(Boolean),
					},
				]
			: []),
		...(await signerSlots(
			tx,
			ctx.orgId,
			functions.map((f) => ({ function: f, mode: "any" as const })),
		)),
	];
	const org = await getOrgSummary(ctx.orgId);
	const doc = authoredDoc({
		template,
		meta,
		content,
		org: org?.name ?? "",
		today,
		version,
		evidenceId: id,
		contentSha256: hash,
		requirements,
		signers: slots,
	});
	const now = new Date();
	const pdf = renderPdf(doc, {
		now,
		attachments: [
			{
				name: "nachweis.json",
				data: JSON.stringify(
					JSON.parse(canonicalJson({ v: 1, ...meta, content })),
					null,
					2,
				),
				mime: "application/json",
				description: "Inhalt des Nachweises (Prüfsumme im Kopf)",
			},
			{ name: "nachweis.md", data: renderMarkdown(doc), mime: "text/markdown" },
		],
	});
	const date = contentDate(template, content) ?? today;
	await storeEncryptedEvidence(tx, {
		id,
		orgId: ctx.orgId,
		bytes: pdf,
		mime: "application/pdf",
		safeName: `${template.code}-v${version}-${date}.pdf`,
		title: row.title,
		description: `${presetOf(template, row.preset)?.title ?? template.title} — in Klick verfasst.`,
		type: template.evidenceType,
		classification: row.classification,
		validUntil: plusMonths(date, template.reviewMonths),
		createdByUserId: createdBy,
		source: "authored",
	});
	await tx
		.update(evidence)
		.set({
			templateKey: template.key,
			contentSha256: hash,
			contentEnc: await encryptJson(
				tx,
				ctx.orgId,
				content,
				evidenceContentAad(id),
			),
			snapshot: { v: 1, ...meta, version } as unknown as Record<
				string,
				unknown
			>,
			supersedesId: row.supersedesId,
		})
		.where(eq(evidence.id, id));
	for (const i of impls) await linkEvidenceToControl(tx, ctx.orgId, i.id, id);

	// Position im Nachweisbogen schließen
	if (row.sheetControl && row.sheetItem) {
		const impl = await implementationFor(tx, ctx.orgId, row.sheetControl);
		if (impl) {
			const items = impl.sheet.items ?? {};
			const prev = items[row.sheetItem];
			const sheet: ControlSheetState = {
				...impl.sheet,
				items: {
					...items,
					[row.sheetItem]: {
						...prev,
						mode: "evidence",
						evidenceIds: [...new Set([...(prev?.evidenceIds ?? []), id])],
						updatedAt: now.toISOString(),
						byUserId: ctx.userId,
					},
				},
			};
			await tx
				.update(controlImplementations)
				.set({ sheet })
				.where(eq(controlImplementations.id, impl.id));
		}
	}

	const audit: AuditInput[] = [];
	// Wirksamkeitstest am ersten Control (fail → Abweichung)
	let testId: string | null = null;
	const result = resultOf(content);
	const primary = impls[0];
	if (opts.recordTest && template.testMethod && result && primary) {
		const t = await insertControlTest(tx, ctx, {
			implementationId: primary.id,
			method: template.testMethod,
			scope: row.title,
			testedAt: new Date(`${date}T12:00:00Z`),
			testerUserId: createdBy,
			result,
			evidenceId: id,
		});
		testId = t.id;
		audit.push(...t.audits);
	}

	// Maßnahmen → Aufgaben am Nachweis
	let created = 0;
	if (opts.createTasks)
		for (const m of measuresOf(content)) {
			const [task] = await tx
				.insert(tasks)
				.values({
					organizationId: ctx.orgId,
					title: m.text.slice(0, 300),
					description: `Aus „${row.title}“`,
					assigneeUserId: m.ownerUserId ?? null,
					createdByUserId: ctx.userId,
					dueAt: m.due || null,
					entityType: "evidence",
					entityId: id,
					sourceKind: "remediation",
				})
				.returning({ id: tasks.id });
			if (!task) continue;
			created += 1;
			if (m.ownerUserId)
				await notify(tx, {
					orgId: ctx.orgId,
					recipients: [m.ownerUserId],
					actorUserId: ctx.userId,
					kind: "task_assigned",
					title: `Neue Aufgabe: ${m.text.slice(0, 120)}`,
					link: "/heute/aufgaben",
				});
		}

	await tx.delete(evidenceDrafts).where(eq(evidenceDrafts.id, row.id));
	audit.unshift({
		action: "evidence.authored",
		target: `evidence:${id}`,
		after: {
			template: template.key,
			preset: row.preset,
			title: row.title,
			controls: meta.controls,
			contentSha256: hash,
			version,
			supersedes: row.supersedesId,
			tasks: created,
			testId,
		},
	});
	return { ok: true, evidenceId: id, tasks: created, testId, audit };
}

// Inhalt eines verfassten Nachweises (für Ansicht und neue Fassung)
export async function authoredContentOf(
	tx: OrgTx,
	orgId: string,
	evidenceId: string,
) {
	const [row] = await tx
		.select({
			templateKey: evidence.templateKey,
			contentEnc: evidence.contentEnc,
			snapshot: evidence.snapshot,
			title: evidence.title,
			classification: evidence.classification,
		})
		.from(evidence)
		.where(and(eq(evidence.organizationId, orgId), eq(evidence.id, evidenceId)))
		.limit(1);
	const template = row?.templateKey
		? TEMPLATE_BY_KEY.get(row.templateKey)
		: undefined;
	if (!row || !template) return null;
	const parsed = authoredContentSchema.safeParse(
		await decryptJson<AuthoredContent>(
			tx,
			orgId,
			row.contentEnc,
			evidenceContentAad(evidenceId),
		),
	);
	if (!parsed.success) return null;
	const meta = (row.snapshot ?? {}) as Partial<AuthoredMeta> & {
		version?: number;
	};
	return {
		template,
		content: parsed.data,
		title: row.title,
		classification: row.classification,
		preset: meta.preset ?? null,
		controls: meta.controls ?? [],
		signers: meta.signers ?? ["-"],
		version: meta.version ?? 1,
	};
}

// Unterschriften eines verfassten Nachweises: gefordert sind die gewählten
// Funktionen; „-“ (Erstellt von) zählt nur, wenn die verfassende Person
// selbst unterschrieben hat — und nur sie kann es.
export async function authoredSignState(
	tx: OrgTx,
	orgId: string,
	evidenceId: string,
	userId: string,
): Promise<{
	signatures: { name: string; function: string | null; signedAt: string }[];
	signAs: string | null;
	open: string[];
}> {
	const [row] = await tx
		.select({
			snapshot: evidence.snapshot,
			createdByUserId: evidence.createdByUserId,
		})
		.from(evidence)
		.where(and(eq(evidence.organizationId, orgId), eq(evidence.id, evidenceId)))
		.limit(1);
	const required = [
		...new Set(
			((row?.snapshot as { signers?: string[] } | null)?.signers ?? []).filter(
				(s) => typeof s === "string",
			),
		),
	];
	const [sigs, mine] = await Promise.all([
		tx
			.select({
				signerUserId: evidenceSignatures.signerUserId,
				name: evidenceSignatures.signerName,
				function: evidenceSignatures.function,
				signedAt: evidenceSignatures.signedAt,
			})
			.from(evidenceSignatures)
			.where(
				and(
					eq(evidenceSignatures.organizationId, orgId),
					eq(evidenceSignatures.evidenceId, evidenceId),
				),
			)
			.orderBy(evidenceSignatures.signedAt),
		tx
			.select({ function: roleAssignments.function })
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, orgId),
					effectiveAssignment(),
					eq(roleAssignments.userId, userId),
				),
			),
	]);
	const author = row?.createdByUserId ?? null;
	const signed = new Set(
		sigs
			.filter((s) => s.function !== "-" || s.signerUserId === author)
			.map((s) => s.function),
	);
	const open = required.filter((f) => !signed.has(f));
	const myFns = new Set(mine.map((m) => m.function as string));
	return {
		signatures: sigs.map((x) => ({
			name: x.name,
			function: x.function,
			signedAt: x.signedAt.toISOString(),
		})),
		signAs:
			open.find((f) => (f === "-" ? userId === author : myFns.has(f))) ?? null,
		open,
	};
}
