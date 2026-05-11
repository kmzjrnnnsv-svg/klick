"use client";

import { useState } from "react";
import { TranslateButton } from "@/components/translate/translate-button";

type Skill = { name: string; level?: number };

// Eingefrorene Skills aus dem Bewerbungs-Snapshot. Wenn die UI-Locale
// nicht zur Snapshot-Sprache passt, kann der Kandidat / Arbeitgeber per
// Klick übersetzen lassen. Heuristik: wenn mindestens ein Skill-Name
// nicht-ASCII-Buchstaben (ä/ö/ü/ß) enthält ODER auf -ung/-keit endet,
// nehmen wir an, dass die Source-Sprache Deutsch ist. Sonst Englisch.
function detectSnapshotLocale(skills: Skill[]): "de" | "en" {
	const text = skills
		.map((s) => s.name)
		.join(" ")
		.toLowerCase();
	if (/[äöüß]/.test(text)) return "de";
	if (/\b(und|der|die|das|für|mit|von|über)\b/.test(text)) return "de";
	if (/(ung|keit|heit|schaft|tigung)\b/.test(text)) return "de";
	return "en";
}

export function SnapshotSkillList({ skills }: { skills: Skill[] }) {
	const [items, setItems] = useState(skills);
	if (items.length === 0) return null;
	const from = detectSnapshotLocale(items);

	return (
		<div>
			<div className="mb-2 flex items-center justify-end">
				<TranslateButton
					original={items.map((s) => s.name)}
					from={from}
					context="Skill-Bezeichnungen aus einem Bewerbungs-Snapshot. Halte Stack-Namen (TypeScript, AWS) unverändert."
					onTranslated={(translated) => {
						if (!Array.isArray(translated)) return;
						setItems((prev) =>
							prev.map((s, i) => ({
								...s,
								name: translated[i] ?? s.name,
							})),
						);
					}}
				/>
			</div>
			<ul className="flex flex-wrap gap-1.5">
				{items.map((s) => (
					<li
						key={s.name}
						className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px]"
					>
						{s.name}
						{s.level ? ` · ${s.level}` : ""}
					</li>
				))}
			</ul>
		</div>
	);
}
