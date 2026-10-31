// Einfache Sprache (Teil Z): Satzlänge und Fachwörter, die ein Kind nicht
// kennt. Die Erklärung nennt die Sache selbst statt des Fachworts.

export const sentences = (s: string) =>
	s.split(/(?<=[.!?])\s+/).filter(Boolean);
export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Fachwörter, die ein Kind nicht kennt; die Erklärung nennt die Sache selbst
export const JARGON = [
	/\bGovernance\b/,
	/\bIKT\b/,
	/\bAssertion/,
	/\bImplementier/,
	/\bMitigation/,
	/\bRemediation/,
	/\bStakeholder/,
	/\bAssets?\b/,
	/\bPolicy\b/,
	/\bIncident/,
	/\bControls?\b/,
	/\bAuthentifizier/,
	/\bAutorisier/,
	/\bEntität/,
	/\bDue[- ]Diligence/,
	/\bOutsourcing/,
	/\bISMS\b/,
	/\bSoA\b/,
	/—/,
];
