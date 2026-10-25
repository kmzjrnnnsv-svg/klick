// Freigabe-Pflichten je Rahmenwerk — pure. Eine Quelle für beide Modi
// (ADR-024): im Standard schaltet ensureOrgWorkflows die Abläufe eines
// gewählten Rahmenwerks ein, im individuellen Modus prüft Klick daraus,
// ob die eigenen Abläufe die Pflicht noch tragen (governanceChecks).
//
// Fundstellen nach Modellwissen (Rechtsstand Oktober 2026) — vor dem
// Verkauf gegen die Primärquellen prüfen (CLAUDE.md, offene Punkte).

export type ApprovalDuty = {
	// approval_workflows.kind des Standard-Ablaufs
	kind: string;
	// gilt unabhängig vom Rahmenwerk (Ablauf ist standardmäßig an)
	always?: boolean;
	// Rahmenwerk → Fundstelle; ein gewähltes Rahmenwerk schaltet ein
	basis: Readonly<Record<string, string>>;
	// erst ab dieser Lizenzstufe (0–4)
	fromStage?: number;
	// Stellen, die im Ablauf vorkommen müssen (Prüfung im individuellen Modus)
	requires: readonly string[];
	// … und zwar mit allen Personen der Funktion
	everyone?: boolean;
};

const MANAGEMENT = "function:management_body";

const APPOINTMENT_BASIS = {
	iso27001: "ISO 27001 Abschnitt 5.3",
	dora: "DORA Art. 5 Abs. 2",
	"zag-marisk": "ZAG-MaRisk AT 4.4",
	kwg: "MaRisk AT 4.4",
	micar: "MiCAR Art. 68",
	gwg: "GwG § 7",
	dsgvo: "DSGVO Art. 37",
	soc2: "SOC 2 CC1.3",
	ccss: "CCSS 1.06",
} as const;

const OUTSOURCING_BASIS = {
	dora: "DORA Art. 28",
	"zag-marisk": "ZAG-MaRisk AT 9",
	kwg: "§ 25b KWG, MaRisk AT 9",
	micar: "MiCAR Art. 73",
} as const;

export const APPROVAL_DUTIES: readonly ApprovalDuty[] = [
	{
		kind: "role_appointment",
		always: true,
		basis: APPOINTMENT_BASIS,
		requires: [MANAGEMENT],
		everyone: true,
	},
	{
		kind: "role_revocation",
		always: true,
		basis: APPOINTMENT_BASIS,
		requires: [MANAGEMENT],
		everyone: true,
	},
	{
		kind: "management_approval",
		always: true,
		basis: { iso27001: "ISO 27001 Abschnitt 5.1", dora: "DORA Art. 5 Abs. 2" },
		requires: [MANAGEMENT],
	},
	{
		kind: "management_decision",
		always: true,
		basis: {},
		requires: [MANAGEMENT],
	},
	{
		kind: "objective_release",
		always: true,
		basis: { iso27001: "ISO 27001 Abschnitt 6.2" },
		requires: [MANAGEMENT],
	},
	{
		kind: "document_publish",
		always: true,
		basis: {
			iso27001: "ISO 27001 Abschnitt 5.2 und 7.5.2",
			dora: "DORA Art. 6 Abs. 8",
		},
		requires: ["approver_of_entity"],
	},
	{
		kind: "risk_acceptance",
		always: true,
		basis: {
			iso27001: "ISO 27001 Abschnitt 6.1.3",
			dora: "DORA Art. 6 Abs. 8",
		},
		requires: [MANAGEMENT],
	},
	{
		kind: "scope",
		basis: { iso27001: "ISO 27001 Abschnitt 4.3" },
		requires: [MANAGEMENT],
	},
	{
		kind: "provider_intake",
		basis: OUTSOURCING_BASIS,
		requires: ["function:outsourcing_officer"],
	},
	{
		// kritische/wichtige Funktion bzw. wesentliche Auslagerung: dazu die GL
		kind: "provider_intake_management",
		basis: OUTSOURCING_BASIS,
		requires: ["function:outsourcing_officer", MANAGEMENT],
	},
	{
		kind: "provider_onboarding",
		basis: OUTSOURCING_BASIS,
		requires: [MANAGEMENT],
	},
	{
		kind: "aml_risk_analysis",
		basis: { gwg: "GwG § 4 Abs. 3 und § 5", amlr: "AMLR Art. 10" },
		requires: [MANAGEMENT],
	},
	{
		kind: "own_funds",
		basis: { micar: "MiCAR Art. 67", zag: "ZAG § 15", kwg: "CRR Art. 92" },
		requires: [MANAGEMENT],
	},
	{
		kind: "marketing",
		basis: { micar: "MiCAR Art. 66" },
		requires: ["function:compliance"],
	},
	{
		kind: "change",
		basis: { "zag-marisk": "ZAG-MaRisk AT 8", kwg: "MaRisk AT 8" },
		requires: [MANAGEMENT],
	},
];

export const DUTY_BY_KIND: ReadonlyMap<string, ApprovalDuty> = new Map(
	APPROVAL_DUTIES.map((d) => [d.kind, d]),
);

// Abläufe, die ein Rahmenwerk gerade eingeschaltet hat (Toast, Audit)
export type WorkflowEnabledByDuty = {
	kind: string;
	name: string;
	frameworks: string[];
	basis: string[];
};

export type RequiredDuty = {
	kind: string;
	// gilt ohnehin (standardmäßig an) — schaltet nichts ein
	always: boolean;
	// gewählte Rahmenwerke, die den Ablauf verlangen (leer bei „immer“)
	frameworks: string[];
	// Fundstellen dieser Rahmenwerke
	basis: string[];
};

// Welche Abläufe verlangen die gewählten Rahmenwerke bei dieser Stufe?
export function requiredDuties(
	frameworks: readonly string[],
	stage: number,
): RequiredDuty[] {
	const chosen = new Set(frameworks);
	return APPROVAL_DUTIES.flatMap((d) => {
		if (d.fromStage !== undefined && stage < d.fromStage) return [];
		const fws = Object.keys(d.basis).filter((s) => chosen.has(s));
		if (!d.always && fws.length === 0) return [];
		return [
			{
				kind: d.kind,
				always: d.always === true,
				frameworks: fws,
				basis: fws.map((s) => d.basis[s] ?? s),
			},
		];
	});
}

// Schlüssel für „schon einmal eingeschaltet“ (org_settings.approvalDuties):
// je Ablauf und Rahmenwerk genau einmal — wer danach bewusst ausschaltet,
// bleibt bei aus, bis ein weiteres Rahmenwerk den Ablauf verlangt.
export function dutyKeys(d: RequiredDuty): string[] {
	return d.frameworks.map((s) => `${d.kind}@${s}`);
}
