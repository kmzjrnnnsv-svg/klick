import { createHash } from "node:crypto";
import type {
	FindingCategory,
	FindingSeverity,
	FindingStatus,
} from "@/db/schema/enums";
import type { NormalizedFinding } from "./types";

// Regeln rund um Befunde — rein und getestet: Schwere aus CVSS/Tool-Stufen,
// Fingerprint (Wiedererkennung über Scans), Redaktion von Secrets, SLA je
// Schwere, Control-Zuordnung je Kategorie, Abgleich neuer Scans mit dem
// Bestand.

// ── Schwere ────────────────────────────────────────────────────────────────

export const SEVERITY_RANK: Record<FindingSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

// CVSS v3/v4-Bänder (FIRST): ≥ 9 kritisch, ≥ 7 hoch, ≥ 4 mittel, > 0 niedrig.
export function severityFromCvss(score: number | null | undefined) {
	if (score === null || score === undefined || Number.isNaN(score)) return null;
	if (score >= 9) return "critical" as const;
	if (score >= 7) return "high" as const;
	if (score >= 4) return "medium" as const;
	if (score > 0) return "low" as const;
	return "info" as const;
}

// Freitext-Stufen der Tools (CRITICAL, High, error, warning, unknown …).
export function severityFromLabel(
	label: string | null | undefined,
): FindingSeverity {
	switch ((label ?? "").trim().toLowerCase()) {
		case "critical":
			return "critical";
		case "high":
		case "error":
			return "high";
		case "medium":
		case "moderate":
		case "warning":
			return "medium";
		case "low":
		case "note":
			return "low";
		default:
			return "info";
	}
}

export function atLeast(
	severity: FindingSeverity,
	threshold: FindingSeverity,
): boolean {
	return SEVERITY_RANK[severity] <= SEVERITY_RANK[threshold];
}

// ── Fingerprint ────────────────────────────────────────────────────────────

// Abhängigkeiten werden toolübergreifend erkannt (Trivy und OSV melden
// dieselbe CVE im selben Paket als einen Befund); Versionen zählen nicht mit,
// damit ein Update, das die Lücke nicht schließt, kein neuer Befund wird.
export function fingerprint(
	f: NormalizedFinding,
	target: string | null,
): string {
	const parts =
		f.category === "dependency" && f.package
			? ["dep", f.cve ?? f.ruleId, f.package.name, target ?? ""]
			: f.toolFingerprint
				? ["tfp", f.ruleId, f.toolFingerprint, target ?? ""]
				: [f.category, f.ruleId, f.location ?? "", target ?? ""];
	return createHash("sha256")
		.update(parts.join("\u0000"))
		.digest("hex")
		.slice(0, 40);
}

// ── Redaktion ──────────────────────────────────────────────────────────────

// Secret → „sk_l…(32 Zeichen)“: genug zum Wiederfinden, nie genug zum Nutzen.
export function redactSecret(secret: string | null | undefined): string | null {
	if (!secret) return null;
	const s = secret.trim();
	if (s.length === 0) return null;
	const head = s.length > 12 ? s.slice(0, 4) : "";
	return `${head}…(${s.length} Zeichen)`;
}

// Fundstelle in einer Zeile ersetzen (gitleaks „Match“, SARIF-Snippets).
export function redactIn(
	text: string | null | undefined,
	secret: string | null | undefined,
): string | null {
	if (!text) return null;
	if (!secret) return text;
	return text.split(secret).join(redactSecret(secret) ?? "…");
}

// ── SLA ────────────────────────────────────────────────────────────────────

export const FINDING_SLA_DAYS: Record<FindingSeverity, number | null> = {
	critical: 7,
	high: 30,
	medium: 90,
	low: 180,
	info: null,
};

export function slaDueAt(
	severity: FindingSeverity,
	firstSeen: Date,
): Date | null {
	const days = FINDING_SLA_DAYS[severity];
	return days === null
		? null
		: new Date(firstSeen.getTime() + days * 86_400_000);
}

// ── Control-Zuordnung ──────────────────────────────────────────────────────

export const CATEGORY_CONTROL: Record<FindingCategory, string> = {
	dependency: "CC-OPS-03",
	secret: "CC-CRY-03",
	code: "CC-DEV-03",
	config: "CC-OPS-04",
	web: "CC-DEV-04",
	tls: "CC-CRY-05",
	dns: "CC-NET-03",
	exposure: "CC-DEV-04",
	other: "CC-OPS-03",
};

// ── Abgleich (Reconcile) ───────────────────────────────────────────────────

export type ExistingFinding = {
	id: string;
	fingerprint: string;
	status: FindingStatus;
};

export type ReconcilePlan = {
	// neu im Bestand
	create: string[];
	// weiterhin vorhanden (lastSeen aktualisieren)
	seen: string[];
	// behoben gemeldet, taucht wieder auf → Regression
	reopen: string[];
	// Vollscan: nicht mehr gefunden → behoben
	resolve: string[];
};

// Neue Fingerprints gegen den Bestand desselben Ziels. Akzeptierte und
// Fehlalarme bleiben, wie sie sind; behoben + wieder da = wieder offen; nur
// ein Vollscan darf Fehlendes als behoben markieren (Teil-Scans sehen nicht
// alles).
export function reconcile(
	existing: readonly ExistingFinding[],
	incoming: readonly string[],
	fullScan: boolean,
): ReconcilePlan {
	const byFp = new Map(existing.map((e) => [e.fingerprint, e]));
	const seenFps = new Set(incoming);
	const plan: ReconcilePlan = { create: [], seen: [], reopen: [], resolve: [] };
	for (const fp of seenFps) {
		const e = byFp.get(fp);
		if (!e) plan.create.push(fp);
		else if (e.status === "resolved") plan.reopen.push(e.id);
		else plan.seen.push(e.id);
	}
	if (fullScan)
		for (const e of existing)
			if (
				!seenFps.has(e.fingerprint) &&
				(e.status === "open" || e.status === "in_progress")
			)
				plan.resolve.push(e.id);
	return plan;
}

// Gate für CI (?fail_on=high): gibt es offene Befunde ab dieser Schwere?
export function gateFails(
	severities: readonly FindingSeverity[],
	threshold: FindingSeverity | null,
): boolean {
	return threshold !== null && severities.some((s) => atLeast(s, threshold));
}
