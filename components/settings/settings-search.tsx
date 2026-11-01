"use client";

import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import {
	matchSettings,
	type SettingsSectionKey,
} from "@/lib/settings/sections";

type Item = {
	key: SettingsSectionKey;
	title: string;
	hint: string;
	href: string;
	icon: ReactNode;
};

// Suchfeld über der Liste der Einstellungen (S3): filtert im Browser nach
// Name, Satz und Suchwörtern. Ohne Eingabe bleibt die gruppierte Liste.
export function SettingsSearch({
	items,
	labels,
	children,
}: {
	items: Item[];
	labels: { placeholder: string; results: string; empty: string };
	children: ReactNode;
}) {
	const [query, setQuery] = useState("");
	const hits = query.trim() ? matchSettings(query, items) : null;
	return (
		<div className="flex flex-col gap-4">
			<label className="relative block">
				<span className="sr-only">{labels.placeholder}</span>
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={labels.placeholder}
					autoComplete="off"
					spellCheck={false}
					className="pl-9"
				/>
			</label>
			{hits === null ? (
				children
			) : (
				<div aria-live="polite">
					<ListSection title={labels.results}>
						{hits.length === 0 ? (
							<ListRow title={labels.empty} />
						) : (
							hits.map((i) => (
								<ListRow
									key={i.key}
									icon={i.icon}
									title={i.title}
									subtitle={i.hint}
									href={i.href}
								/>
							))
						)}
					</ListSection>
				</div>
			)}
		</div>
	);
}
