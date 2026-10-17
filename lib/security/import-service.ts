import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	products,
	securityFindings,
	securityScans,
	tasks,
} from "@/db/schema";
import type {
	FindingSeverity,
	ScanCounts,
	ScanSource,
	ScanTool,
} from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { nonconformityFromSecurityFindings } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import { encryptField } from "@/lib/crypto/fields";
import { fieldAad, loadOrgDek } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import { scanText } from "@/lib/dlp/detectors";
import { s3Configured, storeEncryptedEvidence } from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import {
	CATEGORY_CONTROL,
	fingerprint,
	reconcile,
	SEVERITY_RANK,
	slaDueAt,
} from "./finding-rules";
import type { NormalizedFinding, ParsedScan } from "./types";

// Scan-Import in einer Transaktion (Aufrufer: mutateOrg, schreibt die
// zurückgegebenen Audits): Rohdatei als Nachweis (enthält sie Secrets, nur
// die redigierte Fassung), Befunde abgleichen (neu, gesehen, Regression,
// Vollscan → behoben), Details mit Org-DEK verschlüsseln, eskalieren
// (kritisch → eine gebündelte Abweichung, hoch → Aufgabe, Secret → Sofort-
// Alarm) und bei Vollscan einen Wirksamkeitstest je Control eintragen.

export type ImportInput = {
	parsed: ParsedScan;
	source: ScanSource;
	fullScan: boolean;
	productId: string | null;
	raw?: { text: string; fileName: string } | null;
	tokenId?: string | null;
	// laufender Schnellcheck: Zeile existiert schon
	scanId?: string | null;
};

export type ImportResult = {
	scanId: string;
	counts: ScanCounts;
	// Schwere aller offenen Befunde dieses Scans (CI-Gate)
	openSeverities: FindingSeverity[];
	audits: AuditInput[];
};

// Welche Controls ein Scan prüft (Vollscan → Wirksamkeitstest).
const TOOL_CONTROLS: Record<ScanTool, string[]> = {
	trivy: ["CC-OPS-03", "CC-DEV-05"],
	osv: ["CC-OPS-03", "CC-DEV-05"],
	sarif: ["CC-DEV-03"],
	gitleaks: ["CC-CRY-03"],
	zap: ["CC-DEV-04"],
	nuclei: ["CC-DEV-04"],
	quick_check: ["CC-DEV-04", "CC-CRY-05"],
	manual: [],
};

const EVIDENCE_SOURCE = {
	upload: "scan_import",
	api: "api_ingest",
	quick_check: "quick_check",
} as const;

const emptyCounts = (): ScanCounts => ({
	critical: 0,
	high: 0,
	medium: 0,
	low: 0,
	info: 0,
	new: 0,
	reopened: 0,
	resolved: 0,
});

export async function importScan(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	input: ImportInput,
	now = new Date(),
): Promise<ImportResult> {
	const { parsed } = input;
	const audits: AuditInput[] = [];

	// 1) Nachweis: Rohdatei nur ohne Secrets, sonst die redigierte Normalform
	let evidenceId: string | null = null;
	if (input.raw && s3Configured()) {
		const secretsInRaw =
			parsed.tool === "gitleaks" ||
			scanText(input.raw.text).some((f) => f.category === "secret");
		const body = secretsInRaw
			? JSON.stringify(
					{
						tool: parsed.toolName,
						target: parsed.target,
						findings: parsed.findings,
					},
					null,
					1,
				)
			: input.raw.text;
		const stored = await storeEncryptedEvidence(tx, {
			orgId: ctx.orgId,
			bytes: new TextEncoder().encode(body),
			safeName: secretsInRaw
				? `${input.raw.fileName.replace(/\.[^.]+$/, "")}.redigiert.json`
				: input.raw.fileName,
			mime: "application/json",
			title: `Scan ${parsed.toolName ?? parsed.tool} ${now.toISOString().slice(0, 10)}`,
			description: secretsInRaw
				? "Redigierte Fassung — Secrets aus dem Original wurden nicht gespeichert."
				: undefined,
			type: "log_extract",
			classification: "confidential",
			createdByUserId: ctx.userId,
			source: EVIDENCE_SOURCE[input.source],
		});
		evidenceId = stored.id;
	}

	// 2) Scan-Zeile
	let scanId = input.scanId ?? null;
	if (scanId) {
		await tx
			.update(securityScans)
			.set({ toolName: parsed.toolName, target: parsed.target, evidenceId })
			.where(eq(securityScans.id, scanId));
	} else {
		const [row] = await tx
			.insert(securityScans)
			.values({
				organizationId: ctx.orgId,
				tool: parsed.tool,
				source: input.source,
				toolName: parsed.toolName,
				target: parsed.target,
				productId: input.productId,
				evidenceId,
				fullScan: input.fullScan,
				status: "running",
				tokenId: input.tokenId ?? null,
				createdByUserId: ctx.userId,
				startedAt: now,
			})
			.returning({ id: securityScans.id });
		if (!row) throw new Error("insert failed");
		scanId = row.id;
	}

	// 3) Fingerprints, Dubletten im Scan zusammenfassen (schwerste gewinnt)
	const incoming = new Map<string, NormalizedFinding>();
	for (const f of parsed.findings) {
		const fp = fingerprint(f, parsed.target);
		const prev = incoming.get(fp);
		if (!prev || SEVERITY_RANK[f.severity] < SEVERITY_RANK[prev.severity])
			incoming.set(fp, f);
	}
	const fps = [...incoming.keys()];

	// 4) Bestand: alle Treffer per Fingerprint + derselbe Scan-Umfang
	const scope = and(
		eq(securityFindings.tool, parsed.tool),
		parsed.target === null
			? isNull(securityFindings.target)
			: eq(securityFindings.target, parsed.target),
		input.productId === null
			? isNull(securityFindings.productId)
			: eq(securityFindings.productId, input.productId),
	);
	const existing = await tx
		.select({
			id: securityFindings.id,
			fingerprint: securityFindings.fingerprint,
			status: securityFindings.status,
			severity: securityFindings.severity,
		})
		.from(securityFindings)
		.where(
			and(
				eq(securityFindings.organizationId, ctx.orgId),
				fps.length > 0
					? or(inArray(securityFindings.fingerprint, fps), scope)
					: scope,
			),
		);
	const plan = reconcile(existing, fps, input.fullScan);
	const counts = emptyCounts();

	// 5a) neue Befunde — IDs vorab, damit die Details mit AAD verschlüsselt
	// in einem Insert landen
	const { dek, keyVersion } = await loadOrgDek(tx, ctx.orgId);
	const created: { id: string; f: NormalizedFinding }[] = [];
	const rows = [];
	for (const fp of plan.create) {
		const f = incoming.get(fp);
		if (!f) continue;
		const id = crypto.randomUUID();
		created.push({ id, f });
		rows.push({
			id,
			organizationId: ctx.orgId,
			fingerprint: fp,
			tool: parsed.tool,
			ruleId: f.ruleId.slice(0, 300),
			title: f.title.slice(0, 300),
			severity: f.severity,
			category: f.category,
			target: parsed.target,
			location: f.location?.slice(0, 1000) ?? null,
			cwe: f.cwe,
			cve: f.cve,
			cvss: f.cvss,
			packageName: f.package?.name ?? null,
			packageVersion: f.package?.version ?? null,
			fixedVersion: f.package?.fixed ?? null,
			details: await encryptField(
				{
					description: f.description,
					remediation: f.remediation,
					evidence: f.evidence,
				},
				dek,
				{ keyVersion, aad: fieldAad("security_findings", id, "details") },
			),
			status: "open" as const,
			firstSeenAt: now,
			lastSeenAt: now,
			dueAt: slaDueAt(f.severity, now),
			controlCode: CATEGORY_CONTROL[f.category],
			productId: input.productId,
			lastScanId: scanId,
		});
	}
	for (let i = 0; i < rows.length; i += 500)
		await tx
			.insert(securityFindings)
			.values(rows.slice(i, i + 500))
			// paralleler Import desselben Befunds: der erste gewinnt
			.onConflictDoNothing({
				target: [securityFindings.organizationId, securityFindings.fingerprint],
			});
	counts.new = created.length;

	// 5b) gesehen / Regression / behoben
	if (plan.seen.length > 0)
		await tx
			.update(securityFindings)
			.set({ lastSeenAt: now, lastScanId: scanId })
			.where(inArray(securityFindings.id, plan.seen));
	if (plan.reopen.length > 0)
		await tx
			.update(securityFindings)
			.set({
				status: "open",
				resolvedAt: null,
				lastSeenAt: now,
				lastScanId: scanId,
				reopenCount: sql`${securityFindings.reopenCount} + 1`,
				statusNote: "Wieder gefunden (Regression)",
			})
			.where(inArray(securityFindings.id, plan.reopen));
	if (plan.resolve.length > 0)
		await tx
			.update(securityFindings)
			.set({
				status: "resolved",
				resolvedAt: now,
				statusNote: "Im Vollscan nicht mehr gefunden",
			})
			.where(inArray(securityFindings.id, plan.resolve));
	counts.reopened = plan.reopen.length;
	counts.resolved = plan.resolve.length;

	// offene Befunde dieses Scans (für Zähler und CI-Gate)
	const openRows =
		fps.length > 0
			? await tx
					.select({
						id: securityFindings.id,
						title: securityFindings.title,
						location: securityFindings.location,
						severity: securityFindings.severity,
						category: securityFindings.category,
						status: securityFindings.status,
						nonconformityId: securityFindings.nonconformityId,
						taskId: securityFindings.taskId,
					})
					.from(securityFindings)
					.where(
						and(
							eq(securityFindings.organizationId, ctx.orgId),
							inArray(securityFindings.fingerprint, fps),
							inArray(securityFindings.status, ["open", "in_progress"]),
						),
					)
			: [];
	for (const r of openRows) counts[r.severity] += 1;

	// 6) Eskalation nur für Neues und Regressionen
	const fresh = new Set([...created.map((c) => c.id), ...plan.reopen]);
	const escalate = openRows.filter((r) => fresh.has(r.id));
	const owner = input.productId
		? ((
				await tx
					.select({ ownerUserId: products.ownerUserId })
					.from(products)
					.where(eq(products.id, input.productId))
					.limit(1)
			)[0]?.ownerUserId ?? ctx.userId)
		: ctx.userId;

	const critical = escalate.filter(
		(r) => r.severity === "critical" && !r.nonconformityId,
	);
	const draft = nonconformityFromSecurityFindings(
		critical,
		{ tool: parsed.toolName ?? parsed.tool, target: parsed.target },
		owner,
		now,
	);
	if (draft) {
		const nc = await createNonconformity(tx, ctx, draft, now);
		audits.push(nc.audit);
		await tx
			.update(securityFindings)
			.set({ nonconformityId: nc.id })
			.where(
				inArray(
					securityFindings.id,
					critical.map((r) => r.id),
				),
			);
	}

	const high = escalate.filter((r) => r.severity === "high" && !r.taskId);
	const firstHigh = high[0];
	if (firstHigh) {
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: ctx.orgId,
				title:
					high.length === 1
						? `Sicherheitsbefund beheben: ${firstHigh.title}`.slice(0, 200)
						: `${high.length} hohe Sicherheitsbefunde beheben (${parsed.toolName ?? parsed.tool})`,
				description: high
					.slice(0, 20)
					.map((r) => `- ${r.title}${r.location ? ` (${r.location})` : ""}`)
					.join("\n"),
				assigneeUserId: owner,
				createdByUserId: ctx.userId,
				dueAt: slaDueAt("high", now)?.toISOString().slice(0, 10) ?? null,
				priority: "high",
				entityType: "security_finding",
				entityId: firstHigh.id,
				sourceKind: "security_finding",
			})
			.returning({ id: tasks.id });
		if (task)
			await tx
				.update(securityFindings)
				.set({ taskId: task.id })
				.where(
					inArray(
						securityFindings.id,
						high.map((r) => r.id),
					),
				);
	}

	const secrets = escalate.filter((r) => r.category === "secret");
	if (secrets.length > 0)
		await notify(tx, {
			orgId: ctx.orgId,
			recipients: [owner],
			actorUserId: ctx.userId,
			kind: "security_alert",
			title: `Secret gefunden: ${secrets[0]?.title ?? "Zugangsdaten"}${secrets.length > 1 ? ` (+${secrets.length - 1})` : ""}`,
			body: "Schlüssel sofort widerrufen und neu ausstellen, dann den Befund schließen.",
			link: `/sicherheit/befunde/${secrets[0]?.id}`,
		});

	// 7) Wirksamkeitstest je geprüftem Control (nur Vollscan/Schnellcheck).
	// Ein automatischer Scan ist ein Indiz, kein Prüfurteil: kritische und hohe
	// Befunde ergeben „teilweise“ — die CAPA läuft über die Befund-Abweichung,
	// nicht doppelt über den Test.
	if (input.fullScan || parsed.tool === "quick_check") {
		const codes = TOOL_CONTROLS[parsed.tool];
		const impls = await tx
			.select({ id: controlImplementations.id, code: controls.code })
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.organizationId, ctx.orgId),
					inArray(controls.code, codes),
				),
			);
		const serious = openRows.some(
			(r) => r.severity === "critical" || r.severity === "high",
		);
		for (const impl of impls) {
			const t = await insertControlTest(tx, ctx, {
				implementationId: impl.id,
				method: "vuln_scan",
				scope: `${parsed.toolName ?? parsed.tool}${parsed.target ? ` · ${parsed.target}` : ""}`,
				testedAt: now,
				testerUserId: ctx.userId,
				result: serious ? "partial" : "pass",
				notes: `Automatisch aus Scan: ${counts.critical} kritisch, ${counts.high} hoch, ${counts.medium} mittel offen.`,
				evidenceId,
			});
			audits.push(...t.audits);
		}
	}

	await tx
		.update(securityScans)
		.set({ status: "completed", counts, finishedAt: new Date() })
		.where(eq(securityScans.id, scanId));
	audits.push({
		action: "security.scan_imported",
		target: `security_scan:${scanId}`,
		after: {
			tool: parsed.tool,
			source: input.source,
			target: parsed.target,
			productId: input.productId,
			fullScan: input.fullScan,
			via: input.tokenId ? "api_token" : undefined,
			tokenId: input.tokenId ?? undefined,
			counts,
		},
	});
	return {
		scanId,
		counts,
		openSeverities: openRows.map((r) => r.severity),
		audits,
	};
}
