import type { EntityKind } from "@/db/schema/enums";

// Entitäts-Definitionen: eine Konfiguration je Entität, drei Seitentypen
// (Register, Detail, Tab-Seite) werden daraus gebaut. Status wechselt per
// Button mit dem nächsten sinnvollen Übergang, nicht per Dropdown.

export type Tone = "muted" | "default" | "warning" | "success" | "destructive";

export type Transition<S extends string> = {
	from: S;
	to: S;
	// i18n-Key in "Status" (z. B. "startWork")
	labelKey: string;
	// Pflicht-Begründung oder Freigabe-Workflow
	requires?: "note" | `approval:${string}`;
	// Erster Übergang je Status ist der Primär-Button
	primary?: boolean;
	// Passiert von selbst (z. B. letzte Freigabe) — kein Button, nicht von
	// Hand auslösbar; steht nur für Weg-Anzeige und Hinweise in der Maschine.
	auto?: boolean;
};

export type StatusMachine<S extends string> = {
	states: readonly S[];
	initial: S;
	// i18n-Keys in "Status"
	labelKey: Record<S, string>;
	tone: Record<S, Tone>;
	transitions: readonly Transition<S>[];
	// Endzustände zählen als „erledigt"
	done: readonly S[];
	// „Was jetzt?“ je Status (i18n-Keys in "Status")
	hintKey?: Partial<Record<S, string>>;
	// Weg für die Schritt-Leiste; fehlt er, folgt die Leiste den
	// Primärübergängen ab `initial` (lib/entities/status-machine.ts statusPath)
	happyPath?: readonly S[];
};

export type EntityDef<S extends string> = {
	kind: EntityKind;
	// Basisroute, z. B. "/controls"
	route: string;
	// i18n-Namespace mit singular/plural
	i18nNamespace: string;
	statusMachine: StatusMachine<S>;
};

export type TransitionContext = {
	hasNote?: boolean;
	// Darf der/die Handelnde Freigaben erteilen bzw. ist der Workflow erfüllt?
	approvalsSatisfied?: boolean;
};
