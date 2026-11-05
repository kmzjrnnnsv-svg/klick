import {
	ISMS_PROGRAMME,
	type IsmsItem,
	type IsmsSection,
	type Range,
} from "@/lib/compliance/catalog/isms-programme";
import {
	type AdjustedRow,
	applyIsmsPlan,
	type IsmsItemAdjust,
	type IsmsOff,
	type IsmsPlanSettings,
} from "./adjust";
import type { IsmsNumbers } from "./adjust-math";
import {
	type IsmsRollup,
	ismsTree,
	itemWithChildren,
	rollupIsms,
} from "./rollup";
import {
	countStates,
	type IsmsFacts,
	type IsmsStatus,
	ismsStatus,
	type StateCounts,
} from "./status";

// Der ISMS-Jahresplan einer Org, fertig gerechnet (pure): Vorlage, Anpassungen
// der Org (P2b) und Stand aus Klick (P2a). Seite und Exporte (CSV, PDF) lesen
// dasselbe Modell, damit sie dieselben Zahlen zeigen.

export type PlanRow = {
	item: IsmsItem;
	depth: number;
	// Summe mit Unterpunkten, nur bei Punkten mit Unterpunkten
	withChildren?: Range;
	// Stand aus Klick; null, wenn der Punkt entfällt
	status: IsmsStatus | null;
	numbers: IsmsNumbers;
	adjust: IsmsItemAdjust | null;
	off: IsmsOff | null;
};

export type IsmsPlanView = {
	rollup: IsmsRollup;
	// Baum je Abschnitt in Katalog-Reihenfolge, Unterpunkte nach ihrem Punkt
	sections: { section: IsmsSection; rows: PlanRow[] }[];
	counts: StateCounts;
	offCount: number;
	workdays: number;
};

export function buildIsmsPlanView(
	settings: IsmsPlanSettings,
	facts: IsmsFacts,
	items: readonly IsmsItem[] = ISMS_PROGRAMME,
): IsmsPlanView {
	const plan = applyIsmsPlan(items, settings);
	const statuses = new Map<string, IsmsStatus>();
	for (const i of items)
		if (!plan.rows.get(i.key)?.off) statuses.set(i.key, ismsStatus(i, facts));
	const rollup = rollupIsms(plan.active, { workdays: settings.workdays });
	const tree = ismsTree(items);

	function rowsOf(list: IsmsItem[] | undefined, depth: number): PlanRow[] {
		return (list ?? []).flatMap((item) => {
			const kids = tree.get(item.key);
			const row = plan.rows.get(item.key) as AdjustedRow;
			const off = row.off;
			return [
				{
					item,
					depth,
					status: off
						? null
						: (statuses.get(item.key) ?? { state: "none", code: "manual" }),
					numbers: row.numbers,
					adjust: row.adjust,
					off,
					withChildren:
						kids?.length && !off
							? itemWithChildren(item.key, plan.active).year
							: undefined,
				},
				...rowsOf(kids, depth + 1),
			];
		});
	}
	const roots = tree.get(null) ?? [];
	return {
		rollup,
		sections: rollup.sections.map((s) => ({
			section: s.section,
			rows: rowsOf(
				roots.filter((i) => i.section === s.section),
				0,
			),
		})),
		counts: countStates([...statuses.values()]),
		offCount: items.length - statuses.size,
		workdays: settings.workdays,
	};
}
