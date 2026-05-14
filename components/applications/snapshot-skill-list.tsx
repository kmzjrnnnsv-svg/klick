type Skill = { name: string; level?: number };

// Eingefrorene Skills aus dem Bewerbungs-Snapshot.
export function SnapshotSkillList({ skills }: { skills: Skill[] }) {
	if (skills.length === 0) return null;

	return (
		<ul className="flex flex-wrap gap-1.5">
			{skills.map((s) => (
				<li
					key={s.name}
					className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px]"
				>
					{s.name}
					{s.level ? ` · ${s.level}` : ""}
				</li>
			))}
		</ul>
	);
}
