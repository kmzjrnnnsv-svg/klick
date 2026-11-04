// Zugriffsprüfung (Teil D I2): Inhalt für den Nachweis „Rezertifizierung
// von Zugriffsrechten“ (RL-REZERTIFIZIERUNG) aus einer abgeschlossenen
// Prüfung. Rein. Der Entwurf wird danach wie jeder Rohling geprüft,
// unterschrieben und abgeschlossen.

import type { AuthoredContent } from "@/lib/evidence-authoring/content";
import type { ReviewDecision, ReviewProgress } from "./review-rules";

// Zeilen der Tabelle (Vorlage: höchstens 500); entzogene und angepasste
// zuerst, dann Admins, dann der Rest
export const EVIDENCE_MAX_ROWS = 500;

const DECISION_LABEL: Record<ReviewDecision, string> = {
	confirm: "bestätigt",
	adjust: "angepasst",
	revoke: "entzogen",
};

const PROVIDER_LABEL: Record<string, string> = {
	entra: "Microsoft Entra ID",
	google: "Google Workspace",
	okta: "Okta",
};

export type EvidenceItem = {
	snapshot: {
		name?: string;
		email?: string | null;
		kind?: "member" | "guest";
		admin?: boolean;
		roles?: string[];
	};
	decision: ReviewDecision | null;
	note: string | null;
};

const rank = (i: EvidenceItem) =>
	i.decision === "revoke"
		? 0
		: i.decision === "adjust"
			? 1
			: i.snapshot.admin
				? 2
				: 3;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function reviewEvidenceContent(input: {
	review: {
		title: string;
		provider: string | null;
		startedAt: Date;
		closedAt: Date | null;
	};
	progress: ReviewProgress;
	items: readonly EvidenceItem[];
	me: string;
	today: string;
}): AuthoredContent {
	const { progress: p } = input;
	const sorted = [...input.items].sort((a, b) => rank(a) - rank(b));
	const rows = sorted
		.slice(0, EVIDENCE_MAX_ROWS)
		.map((i) => [
			(i.snapshot.email ?? i.snapshot.name ?? "").slice(0, 200),
			(i.snapshot.name ?? "").slice(0, 200),
			(i.snapshot.roles && i.snapshot.roles.length > 0
				? i.snapshot.roles.join(", ")
				: i.snapshot.kind === "guest"
					? "Gast"
					: "Mitglied"
			).slice(0, 500),
			i.decision ? DECISION_LABEL[i.decision] : "",
			"",
		]);
	const system =
		(input.review.provider && PROVIDER_LABEL[input.review.provider]) ??
		"Verzeichnisdienst";
	const omitted = input.items.length - rows.length;
	const summary = [
		`${p.total} Konten geprüft: ${p.confirm} bestätigt, ${p.adjust} angepasst, ${p.revoke} entzogen.`,
		p.adjust + p.revoke > 0
			? "Anpassen und Entziehen sind als Aufgaben in Klick angelegt; trag in der Tabelle ein, wann es umgesetzt ist."
			: "Keine Änderungen nötig.",
		omitted > 0
			? `Die Tabelle zeigt ${rows.length} Konten (alle entzogenen und angepassten zuerst); ${omitted} weitere bestätigte stehen in der Zugriffsprüfung in Klick.`
			: "",
	]
		.filter(Boolean)
		.join(" ");
	return {
		v: 1,
		blocks: {
			head: {
				kind: "fields",
				values: {
					system,
					listDate: day(input.review.startedAt),
					source:
						`Abruf aus ${system} über Klick (Zugriffsprüfung „${input.review.title}“)`.slice(
							0,
							500,
						),
					date: input.review.closedAt
						? day(input.review.closedAt)
						: input.today,
					by: input.me.slice(0, 500),
					owner: "",
				},
			},
			accounts: { kind: "table", rows },
			summary: { kind: "text", text: summary },
			result: {
				kind: "result",
				value: p.adjust + p.revoke > 0 ? "partial" : "pass",
				note: "",
			},
			measures: { kind: "measures", rows: [] },
		},
	};
}
