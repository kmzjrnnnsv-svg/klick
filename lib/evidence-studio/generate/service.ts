import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { evidence, roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { getOrgSummary } from "@/lib/auth/org";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";
import { implementationFor } from "../implementation";
import { berlinToday } from "../queries";
import {
	assembleDoc,
	canonicalJson,
	contentHash,
	type SignerSlot,
	type Snapshot,
} from "./doc";
import { GENERATORS } from "./registry";

// Nachweis aus Klick erzeugen: Registerdaten → Schnappschuss → PDF (mit
// Schnappschuss und Markdown als Anhang) → verschlüsselte Ablage → an alle
// Controls der Art. Gleicher Inhalt wie der letzte Nachweis → kein neuer.

const plusMonths = (iso: string, months: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
};

async function latestOf(
	tx: OrgTx,
	orgId: string,
	code: string,
	entityId: string | null,
) {
	const entityMatch = entityId
		? sql`${evidence.snapshot}->>'entityId' = ${entityId}`
		: sql`coalesce(${evidence.snapshot}->>'entityId', '') = ''`;
	const [latest] = await tx
		.select({
			id: evidence.id,
			contentSha256: evidence.contentSha256,
			createdAt: evidence.createdAt,
		})
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				eq(evidence.kindCode, code),
				entityMatch,
			),
		)
		.orderBy(desc(evidence.createdAt))
		.limit(1);
	const [n] = await tx
		.select({ n: count() })
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				eq(evidence.kindCode, code),
				entityMatch,
			),
		);
	return { latest: latest ?? null, versions: n?.n ?? 0 };
}

async function signerSlots(
	tx: OrgTx,
	orgId: string,
	signers: readonly { function: RoleFunction; mode: "all" | "any" }[],
): Promise<SignerSlot[]> {
	if (signers.length === 0) return [];
	const rows = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			externalName: roleAssignments.externalName,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				inArray(
					roleAssignments.function,
					signers.map((s) => s.function),
				),
			),
		);
	const names = await userNames(
		tx,
		rows.map((r) => r.userId),
	);
	return signers.map((s) => ({
		function: s.function,
		mode: s.mode,
		holders: rows
			.filter((r) => r.function === s.function)
			.map((r) =>
				r.userId ? (names.get(r.userId) ?? "") : (r.externalName ?? ""),
			)
			.filter(Boolean),
	}));
}

export type GenerateResult =
	| { ok: true; id: string; reused: boolean; audit: AuditInput[] }
	| { ok: false; error: "unknown_kind" | "not_found" };

// Aktuelle Prüfsumme einer Art (für „veraltet“): null, wenn nicht erzeugbar
export async function currentHash(
	tx: OrgTx,
	orgId: string,
	code: string,
	entityId?: string,
): Promise<string | null> {
	const gen = GENERATORS.get(code);
	if (!gen) return null;
	const facts = await gen.load(tx, orgId, entityId);
	if (facts === null) return null;
	return contentHash({ v: 1, kind: code, entityId: entityId ?? null, facts });
}

export async function generateKindEvidence(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	code: string,
	entityId?: string,
): Promise<GenerateResult> {
	const kind = EVIDENCE_KIND_BY_CODE.get(code);
	const gen = GENERATORS.get(code);
	if (!kind || !gen) return { ok: false, error: "unknown_kind" };
	const facts = await gen.load(tx, ctx.orgId, entityId);
	if (facts === null) return { ok: false, error: "not_found" };
	const snapshot: Snapshot = {
		v: 1,
		kind: code,
		entityId: entityId ?? null,
		facts,
	};
	const hash = contentHash(snapshot);
	const { latest, versions } = await latestOf(
		tx,
		ctx.orgId,
		code,
		entityId ?? null,
	);
	if (latest?.contentSha256 === hash)
		return { ok: true, id: latest.id, reused: true, audit: [] };

	const today = berlinToday();
	const id = crypto.randomUUID();
	const version = versions + 1;
	const built = gen.build(facts, { today });
	const org = await getOrgSummary(ctx.orgId);
	const doc = assembleDoc({
		kind,
		org: org?.name ?? "",
		today,
		version,
		evidenceId: id,
		contentSha256: hash,
		title: built.title,
		subtitle: built.subtitle,
		blocks: built.blocks,
		signers: await signerSlots(tx, ctx.orgId, kind.signers),
	});
	const pdf = renderPdf(doc, {
		attachments: [
			{
				name: "nachweis.json",
				data: JSON.stringify(JSON.parse(canonicalJson(snapshot)), null, 2),
				mime: "application/json",
				description: "Schnappschuss der Registerdaten (Prüfsumme im Kopf)",
			},
			{
				name: "nachweis.md",
				data: renderMarkdown(doc),
				mime: "text/markdown",
			},
		],
	});
	await storeEncryptedEvidence(tx, {
		id,
		orgId: ctx.orgId,
		bytes: pdf,
		mime: "application/pdf",
		safeName: `${code}-v${version}-${today}.pdf`,
		title: doc.title,
		description: `${kind.purpose} Erzeugt aus den Registern in Klick.`,
		type: "document",
		classification: "internal",
		validUntil: plusMonths(today, kind.reviewMonths),
		createdByUserId: ctx.userId,
		source: "klick",
	});
	await tx
		.update(evidence)
		.set({
			kindCode: code,
			contentSha256: hash,
			snapshot: snapshot as unknown as Record<string, unknown>,
			supersedesId: latest?.id ?? null,
		})
		.where(eq(evidence.id, id));
	for (const c of kind.controls) {
		const impl = await implementationFor(tx, ctx.orgId, c);
		if (impl) await linkEvidenceToControl(tx, ctx.orgId, impl.id, id);
	}
	return {
		ok: true,
		id,
		reused: false,
		audit: [
			{
				action: "evidence.generated",
				target: `evidence:${id}`,
				after: {
					kindCode: code,
					entityId: entityId ?? null,
					version,
					contentSha256: hash,
					supersedesId: latest?.id ?? null,
					controls: kind.controls,
				},
			},
		],
	};
}

// Heutige Prüfsummen der erzeugbaren Arten in diesen Bögen (für „veraltet“)
export async function kindHashesFor(
	tx: OrgTx,
	orgId: string,
	sheets: readonly {
		items: readonly {
			resolution:
				| { type: "kind"; kind: { code: string; scope: string } }
				| { type: string };
		}[];
	}[],
): Promise<Map<string, string | null>> {
	const codes = new Set<string>();
	for (const s of sheets)
		for (const i of s.items)
			if (
				i.resolution.type === "kind" &&
				"kind" in i.resolution &&
				i.resolution.kind.scope === "org" &&
				GENERATORS.has(i.resolution.kind.code)
			)
				codes.add(i.resolution.kind.code);
	const out = new Map<string, string | null>();
	for (const code of codes) out.set(code, await currentHash(tx, orgId, code));
	return out;
}
