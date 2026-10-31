// Der Compliance-Ablauf in sechs Schritten (Teil Z7): so hängen Rahmenwerke,
// Maßnahmen, Nachweise und Prüfungen in der Praxis zusammen. Ein Beispiel
// läuft durch alle Schritte (Vorfall melden). href = Stelle in Klick.

export type ProcessStep = {
	key: string;
	title: string;
	what: string;
	example: string;
	href: string;
	place: string;
};

export const PROCESS_EXAMPLE = "einen schweren Vorfall melden";

export const COMPLIANCE_PROCESS: readonly ProcessStep[] = [
	{
		key: "choose",
		title: "Regeln wählen",
		what: "Du klärst, welche Rahmenwerke für deine Firma gelten. Klick schlägt sie aus Größe und Tätigkeit vor.",
		example: "Eine Zahlungsfirma braucht DORA, das ZAG und die DSGVO.",
		href: "/rahmenwerke",
		place: "Rahmenwerke",
	},
	{
		key: "merge",
		title: "Gemeinsames finden",
		what: "Klick legt alle Regeln übereinander. Was mehrere verlangen, wird eine einzige Maßnahme.",
		example:
			"DORA, NIS2 und DSGVO wollen alle, dass schwere Vorfälle gemeldet werden. Daraus wird eine Maßnahme: Meldeprozess mit Fristen.",
		href: "/synergien",
		place: "Synergien",
	},
	{
		key: "ask",
		title: "Einmal fragen",
		what: "Die Gap-Analyse fragt einmal je Maßnahme, nicht je Regel. Deine Antwort zählt für alle.",
		example:
			"Eine Frage: Gibt es einen Meldeprozess mit Fristen? Dein Ja zählt für DORA, NIS2 und DSGVO.",
		href: "/gap-analyse",
		place: "Gap-Analyse",
	},
	{
		key: "strictest",
		title: "Nach der strengsten Vorgabe umsetzen",
		what: "Wo Regeln verschieden streng sind, nimmst du die strengste. Dann passt es für alle.",
		example:
			"DORA will die erste Meldung nach 4 Stunden, die DSGVO nach 72 Stunden. Wer 4 Stunden schafft, erfüllt beides.",
		href: "/controls",
		place: "Controls",
	},
	{
		key: "proof",
		title: "Ein Nachweis für alle",
		what: "Du legst jeden Nachweis einmal ab. Er zählt bei jeder Prüfung, die ihn braucht.",
		example:
			"Das Melde-Handbuch zählt für die Prüfung der Aufsicht und für das ISO-Audit.",
		href: "/nachweise",
		place: "Nachweise",
	},
	{
		key: "audit",
		title: "Jede Prüfung bekommt ihren Teil",
		what: "Bei einer Prüfung zeigt Klick nur, was dieses Rahmenwerk verlangt, mit seinen eigenen Nummern.",
		example:
			"Gemeldet wird trotzdem getrennt: an die Aufsicht nach DORA und an die Datenschutzbehörde nach der DSGVO.",
		href: "/ueberblick",
		place: "Prüfungsreife",
	},
];
