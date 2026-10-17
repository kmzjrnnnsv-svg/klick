import type {
	EngagementKind,
	EngagementStatus,
	FindingSeverity,
	FindingStatus,
	ProductRole,
	RetestStatus,
} from "@/db/schema/enums";

// Sicherheitsaufträge (S7) — rein: Sperren je Statuswechsel, Ergebnis bei
// Lieferung, Nachtest-Frist, geprüfte Controls, Vorlagen für Methodik und
// Regeln.

export type EngagementLike = {
	kind: EngagementKind;
	targets: readonly string[];
	startAt: string | null;
	endAt: string | null;
	authorizationEvidenceId: string | null;
	summary: string | null;
};

export type EngagementFindingLike = {
	severity: FindingSeverity;
	status: FindingStatus;
	retestStatus: RetestStatus | null;
};

export type GateError =
	| "authorization_missing"
	| "targets_missing"
	| "period_missing"
	| "summary_missing"
	| "retest_open";

const OPEN: ReadonlySet<FindingStatus> = new Set(["open", "in_progress"]);

export function isOpenFinding(f: Pick<EngagementFindingLike, "status">) {
	return OPEN.has(f.status);
}

// Fachliche Sperre für den Wechsel nach `to` (null = erlaubt). Der
// Schnellcheck-Auftrag braucht keine schriftliche Beauftragung (passiv, nur
// eigene oder beauftragte Ziele mit Bestätigung).
export function engagementGate(
	to: EngagementStatus,
	e: EngagementLike,
	findings: readonly EngagementFindingLike[],
): GateError | null {
	if (to === "authorized") {
		if (e.kind !== "quick_check" && !e.authorizationEvidenceId)
			return "authorization_missing";
		if (e.targets.length === 0) return "targets_missing";
		if (!e.startAt || !e.endAt || e.endAt < e.startAt) return "period_missing";
	}
	if (to === "delivered" && !e.summary?.trim()) return "summary_missing";
	if (
		to === "closed" &&
		findings.some((f) => isOpenFinding(f) && f.retestStatus !== "failed")
	)
		return "retest_open";
	return null;
}

// Ergebnis für den Wirksamkeitstest bei Lieferung: offene kritische Befunde
// → nicht wirksam (Abweichung), offene hohe/mittlere → teilweise, sonst
// wirksam.
export function engagementResult(
	findings: readonly EngagementFindingLike[],
): "pass" | "partial" | "fail" {
	const open = findings.filter(isOpenFinding);
	if (open.some((f) => f.severity === "critical")) return "fail";
	if (open.some((f) => f.severity === "high" || f.severity === "medium"))
		return "partial";
	return "pass";
}

// Nachtest: 30 Tage bei offenen kritischen/hohen Befunden, sonst 90; ohne
// offene Befunde keiner.
export function retestDueDate(
	findings: readonly EngagementFindingLike[],
	from: Date,
): string | null {
	const open = findings.filter(isOpenFinding);
	if (open.length === 0) return null;
	const days = open.some(
		(f) => f.severity === "critical" || f.severity === "high",
	)
		? 30
		: 90;
	return new Date(from.getTime() + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

// Welche Controls der Auftrag prüft (Wirksamkeitstest bei Lieferung).
export function engagementControls(
	kind: EngagementKind,
	productRole: ProductRole | null,
): { codes: string[]; method: "pentest" | "vuln_scan" } | null {
	if (kind === "cra_readiness") return null;
	const codes = ["CC-DEV-04"];
	if (productRole === "manufacturer" && kind === "pentest")
		codes.push("CC-PRD-10");
	return { codes, method: kind === "pentest" ? "pentest" : "vuln_scan" };
}

export const METHODOLOGY_DEFAULT: Record<EngagementKind, string> = {
	pentest:
		"OWASP Web Security Testing Guide (WSTG), OWASP ASVS 5.0 Level 2 als Prüfkatalog, PTES für Ablauf und Bericht; Bewertung nach CVSS 3.1/4.0; Grey-Box mit Testkonten je Rolle.",
	security_check:
		"Passiver Schnellcheck (Header, TLS, DNS, security.txt, Secrets im JS-Bundle), Import der Scans aus der CI (Abhängigkeiten, SAST, Secrets), Review nach OWASP ASVS 5.0 Level 1 mit Fokus auf typische Fehler KI-gebauter Apps: Zugriffsregeln der Datenbank (z. B. Supabase-RLS), Service-Schlüssel im Client, Auth-Flows, Rate-Limits.",
	quick_check:
		"Passiver Schnellcheck aus Klick: nur was ein Browser lädt (Header, Cookies, TLS, DNS, security.txt, Secrets im JS-Bundle, Source-Maps) — keine aktiven Tests.",
	cra_readiness:
		"CRA Anhang I Teil I und II, Produktcheckliste je Produkt, SBOM-Prüfung nach BSI TR-03183-2, Prozess für Schwachstellen und Meldungen (Art. 14), Konformitätsweg (Art. 32).",
};

export const RULES_OF_ENGAGEMENT_TEMPLATE = [
	"Testzeitraum und -fenster: … (Wartungsfenster/Geschäftszeiten)",
	"Ansprechpartner und Notfallkontakt (24/7): …",
	"Erlaubte Techniken: … · Verboten: Denial of Service, Social Engineering, physische Tests, Datenexfiltration über Nachweis hinaus",
	"Umgang mit Zugangsdaten und personenbezogenen Daten: nur Testkonten, Funde sofort melden, keine Kopien",
	"Abbruchkriterien: Produktionsstörung, Fund kritischer Schwachstelle (sofortige Meldung)",
	"Quell-IP-Adressen der Tester: …",
	"Löschung der Testdaten und Nachweise beim Tester: … Tage nach Abschluss",
].join("\n");
