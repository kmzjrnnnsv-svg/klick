import type { RoleFunction } from "@/db/schema/enums";

// Funktionstrennungs-Regeln (Segregation of Duties) für die Pflichtfunktionen.
// „block" = darf dieselbe Person nicht sein; „warn" = nur ausnahmsweise mit
// Begründung (z. B. Solo-/Kleinstorganisation in Stufe 0–1).
// Quellen: ZAG-MaRisk AT 4.3.1/AT 4.4, DORA Art. 6(4), DSGVO Art. 38(6),
// GwG § 7 Abs. 1 (GWB auf Führungsebene, GL nur ausnahmsweise), ISO 27001 A.5.3.

export type SodRule = {
	code: string;
	a: RoleFunction;
	b: RoleFunction;
	severity: "block" | "warn";
	legalBasis: string;
	text: string;
};

export const SOD_RULES: readonly SodRule[] = [
	{
		code: "SOD-01",
		a: "internal_audit",
		b: "compliance",
		severity: "block",
		legalBasis: "ZAG-MaRisk AT 4.4.3 Tz. 2",
		text: "Die Interne Revision prüft die Compliance-Funktion und darf nicht mit ihr identisch sein.",
	},
	{
		code: "SOD-02",
		a: "internal_audit",
		b: "risk_control",
		severity: "block",
		legalBasis: "ZAG-MaRisk AT 4.4.3 Tz. 2",
		text: "Interne Revision und Risikocontrolling sind getrennt zu besetzen.",
	},
	{
		code: "SOD-03",
		a: "internal_audit",
		b: "isb_ciso",
		severity: "block",
		legalBasis: "ISO 27001 9.2 (Unabhängigkeit der Auditor:innen)",
		text: "Wer das ISMS verantwortet, darf es nicht selbst auditieren.",
	},
	{
		code: "SOD-04",
		a: "internal_audit",
		b: "ict_risk_function",
		severity: "block",
		legalBasis: "DORA Art. 6(6)",
		text: "Die Revision prüft den IKT-Risikomanagementrahmen unabhängig von der Kontrollfunktion.",
	},
	{
		code: "SOD-05",
		a: "internal_audit",
		b: "aml_officer",
		severity: "block",
		legalBasis: "§ 6 Abs. 2 Nr. 7 GwG (unabhängige Prüfung)",
		text: "Die Geldwäscheprävention wird von der Revision geprüft; keine Personenidentität.",
	},
	{
		code: "SOD-06",
		a: "internal_audit",
		b: "management_body",
		severity: "block",
		legalBasis: "ZAG-MaRisk AT 4.4.3",
		text: "Die Interne Revision ist der Geschäftsleitung unterstellt, nicht mit ihr identisch.",
	},
	{
		code: "SOD-07",
		a: "dpo",
		b: "management_body",
		severity: "block",
		legalBasis: "DSGVO Art. 38(6)",
		text: "Die Datenschutzbeauftragte Person darf nicht zugleich über die Zwecke der Verarbeitung entscheiden.",
	},
	{
		code: "SOD-08",
		a: "dpo",
		b: "isb_ciso",
		severity: "warn",
		legalBasis: "DSGVO Art. 38(6) · EDPB-Leitlinien",
		text: "ISB und DSB in einer Person gilt als Interessenkonflikt; nur mit Begründung und Aufsichtsabstimmung.",
	},
	{
		code: "SOD-09",
		a: "aml_officer",
		b: "management_body",
		severity: "warn",
		legalBasis: "§ 7 Abs. 1 GwG · BaFin-AuA",
		text: "Die Geschäftsleitung darf nur ausnahmsweise selbst Geldwäschebeauftragte:r sein (Kleinstorganisation, begründet).",
	},
	{
		code: "SOD-10",
		a: "ict_risk_function",
		b: "isb_ciso",
		severity: "warn",
		legalBasis: "DORA Art. 6(4) (Unabhängigkeit der Kontrollfunktion)",
		text: "Die IKT-Risikokontrolle soll von der operativen Sicherheitsverantwortung getrennt sein.",
	},
	{
		code: "SOD-11",
		a: "risk_control",
		b: "compliance_manager",
		severity: "warn",
		legalBasis: "ZAG-MaRisk AT 4.4.1",
		text: "Risikocontrolling und geschäftsinitiierende Leitungsmitglieder sollen getrennt sein.",
	},
	{
		code: "SOD-12",
		a: "incident_manager",
		b: "internal_audit",
		severity: "block",
		legalBasis: "ZAG-MaRisk AT 4.4.3",
		text: "Die Revision darf keine operativen Aufgaben wie das Vorfallmanagement wahrnehmen.",
	},
];

export type SodViolation = {
	rule: SodRule;
	userId: string;
};

// Welche Person hält zwei getrennt zu besetzende Funktionen?
export function checkSod(
	assignments: readonly { function: RoleFunction; userId: string | null }[],
	rules: readonly SodRule[] = SOD_RULES,
): SodViolation[] {
	const holders = new Map<RoleFunction, Set<string>>();
	for (const a of assignments) {
		if (!a.userId) continue;
		const set = holders.get(a.function) ?? new Set<string>();
		set.add(a.userId);
		holders.set(a.function, set);
	}
	const out: SodViolation[] = [];
	for (const rule of rules) {
		const left = holders.get(rule.a);
		const right = holders.get(rule.b);
		if (!left || !right) continue;
		for (const u of left) if (right.has(u)) out.push({ rule, userId: u });
	}
	return out;
}
