import type { AssetRedundancy } from "@/db/schema/registers";

// Kette im Notfall (BSI 200-4 Kap. 6.2, DORA Art. 11, ISO 22301 8.4.1):
// ein Prozess läuft erst wieder, wenn alles läuft, wovon er abhängt. Die
// erreichbare Wiederanlaufzeit ist deshalb die langsamste Abhängigkeit, der
// Datenverlust der größte. Pure, ohne Datenbank.

export type ChainProcess = {
	criticality: string;
	rtoHours: number | null;
	rpoHours: number | null;
};

export type ChainDependency = {
	kind: "asset" | "provider";
	id: string;
	name: string;
	rtoHours: number | null;
	rpoHours: number | null;
	// nur Assets: Ausweichweg
	redundancy?: AssetRedundancy | null;
};

export type ChainIssue =
	| "rto_slow"
	| "rpo_loss"
	| "rto_missing"
	| "rpo_missing"
	| "single_point";

export type ChainRow = ChainDependency & {
	issues: ChainIssue[];
};

export type ChainResult = {
	rows: ChainRow[];
	// langsamste bekannte Abhängigkeit (null = keine Werte)
	achievableRtoHours: number | null;
	achievableRpoHours: number | null;
	// Ziel des Prozesses erreichbar? null = nicht prüfbar (Ziel oder Werte fehlen)
	rtoOk: boolean | null;
	rpoOk: boolean | null;
	// Zahl der Abhängigkeiten mit mindestens einem Befund
	findings: number;
};

const critical = (p: ChainProcess) => p.criticality !== "standard";

export function bcmChain(
	p: ChainProcess,
	deps: readonly ChainDependency[],
): ChainResult {
	const rows: ChainRow[] = deps.map((d) => {
		const issues: ChainIssue[] = [];
		if (d.rtoHours !== null && p.rtoHours !== null && d.rtoHours > p.rtoHours)
			issues.push("rto_slow");
		if (d.rpoHours !== null && p.rpoHours !== null && d.rpoHours > p.rpoHours)
			issues.push("rpo_loss");
		// fehlende Werte zählen nur bei kritischen Prozessen mit Ziel
		if (critical(p) && p.rtoHours !== null && d.rtoHours === null)
			issues.push("rto_missing");
		if (
			critical(p) &&
			p.rpoHours !== null &&
			d.kind === "asset" &&
			d.rpoHours === null
		)
			issues.push("rpo_missing");
		// einzelner Punkt: kritischer Prozess, Asset ohne Ausweichweg
		if (critical(p) && d.kind === "asset" && d.redundancy === "none")
			issues.push("single_point");
		return { ...d, issues };
	});
	const max = (xs: (number | null)[]) => {
		const v = xs.filter((x): x is number => x !== null);
		return v.length ? Math.max(...v) : null;
	};
	const achievableRtoHours = max(deps.map((d) => d.rtoHours));
	const achievableRpoHours = max(deps.map((d) => d.rpoHours));
	const complete = (key: "rtoHours" | "rpoHours") =>
		deps.length > 0 && deps.every((d) => d[key] !== null);
	const ok = (
		target: number | null,
		achievable: number | null,
		key: "rtoHours" | "rpoHours",
	): boolean | null => {
		if (target === null || achievable === null) return null;
		if (achievable > target) return false;
		// erst „erreichbar“, wenn alle Abhängigkeiten einen Wert haben
		return complete(key) ? true : null;
	};
	return {
		rows,
		achievableRtoHours,
		achievableRpoHours,
		rtoOk: ok(p.rtoHours, achievableRtoHours, "rtoHours"),
		rpoOk: ok(p.rpoHours, achievableRpoHours, "rpoHours"),
		findings: rows.filter((r) => r.issues.length > 0).length,
	};
}

// Befunde, die das Ziel tatsächlich verfehlen (für Zähler und Hinweise);
// fehlende Werte sind eine Lücke, kein Verfehlen
export function chainBreaks(r: ChainResult): number {
	return r.rows.filter((x) =>
		x.issues.some((i) => i === "rto_slow" || i === "rpo_loss"),
	).length;
}
