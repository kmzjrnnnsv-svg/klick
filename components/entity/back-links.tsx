import { LinkChips } from "./link-chips";

export type BackLinkGroup = {
	label: string;
	items: { key: string; label: string; href: string; title?: string }[];
};

// Rückverknüpfungen einer Detailseite („Verwendet in“, „Betroffen“): je Art
// eine Zeile mit Links; leere Arten fallen weg.
export function BackLinks({
	groups,
	empty,
}: {
	groups: BackLinkGroup[];
	empty: string;
}) {
	const shown = groups.filter((g) => g.items.length > 0);
	if (shown.length === 0)
		return <p className="text-muted-foreground text-sm">{empty}</p>;
	return (
		<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
			{shown.map((g) => (
				<div key={g.label} className="contents">
					<dt className="text-muted-foreground text-xs sm:pt-0.5">{g.label}</dt>
					<dd>
						<LinkChips items={g.items} max={12} />
					</dd>
				</div>
			))}
		</dl>
	);
}
