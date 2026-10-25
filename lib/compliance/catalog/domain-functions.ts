import { DOMAINS, type Domain, type RoleFunction } from "@/db/schema/enums";

// Wer ist für welchen Bereich verantwortlich? (Einrichtung, Schritt „Rollen“)
// Je Bereich die geeigneten Funktionen in Reihenfolge; vorgeschlagen wird die
// erste, die in der Organisation besetzt ist. Datenschutz-Controls (CC-PRV-*)
// stehen in der Domäne „compliance“, gehören aber zur/zum DSB und sind deshalb
// ein eigener Bereich. Vorschläge nach Modellwissen (ISO 27001 A.5.2, DORA
// Art. 6, GwG § 7, DSGVO Art. 39) — je Org änderbar.

export const RESPONSIBILITY_AREAS = [...DOMAINS, "privacy"] as const;
export type ResponsibilityArea = (typeof RESPONSIBILITY_AREAS)[number];

const IT: readonly RoleFunction[] = [
	"isb_ciso",
	"ict_risk_function",
	"management_body",
];

export const AREA_CANDIDATES: Record<
	ResponsibilityArea,
	readonly RoleFunction[]
> = {
	governance: ["management_body"],
	risk: ["risk_control", "ict_risk_function", "isb_ciso", "management_body"],
	asset: IT,
	access: IT,
	crypto: IT,
	physical: IT,
	operations: IT,
	network: IT,
	development: IT,
	supplier: ["outsourcing_officer", "isb_ciso", "management_body"],
	incident: ["incident_manager", "isb_ciso", "ict_risk_function"],
	continuity: ["bcm_manager", "ict_risk_function", "isb_ciso"],
	compliance: ["compliance", "compliance_manager", "management_body"],
	hr: ["department_head", "management_body"],
	aml: ["aml_officer", "compliance"],
	conduct: ["compliance", "compliance_manager", "management_body"],
	payments: ["compliance", "management_body"],
	custody: ["compliance", "isb_ciso", "management_body"],
	fraud: ["aml_officer", "compliance"],
	privacy: ["dpo", "compliance", "management_body"],
};

export function areaOf(control: {
	code: string;
	domain: Domain;
}): ResponsibilityArea {
	return control.code.startsWith("CC-PRV-") ? "privacy" : control.domain;
}

// erste geeignete Funktion, die besetzt ist — sonst kein Vorschlag
export function suggestAreaFunction(
	area: ResponsibilityArea,
	held: ReadonlySet<RoleFunction>,
): RoleFunction | null {
	return AREA_CANDIDATES[area].find((f) => held.has(f)) ?? null;
}
