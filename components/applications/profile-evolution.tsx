import { ArrowRight, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ApplicationProfileSnapshot } from "@/db/schema";

type CurrentProfile = {
	displayName?: string | null;
	headline?: string | null;
	location?: string | null;
	yearsExperience?: number | null;
	salaryDesired?: number | null;
	skills?: { name: string; level?: number }[];
	summary?: string | null;
	industries?: string[] | null;
};

type Change =
	| {
			kind: "scalar";
			field: string;
			before: string | number | null | undefined;
			after: string | number | null | undefined;
	  }
	| {
			kind: "skills";
			added: { name: string; level?: number }[];
			removed: { name: string; level?: number }[];
			leveledUp: { name: string; before?: number; after?: number }[];
	  }
	| {
			kind: "list";
			field: string;
			added: string[];
			removed: string[];
	  };

function computeDiff(
	snap: ApplicationProfileSnapshot,
	current: CurrentProfile,
): Change[] {
	const out: Change[] = [];

	const scalarFields: Array<
		keyof CurrentProfile & keyof ApplicationProfileSnapshot
	> = ["headline", "location", "yearsExperience", "salaryDesired", "summary"];
	for (const f of scalarFields) {
		const before = snap[f] ?? null;
		const after = current[f] ?? null;
		// Strings vergleichen wir trim-getrimmt; bei null/undefined keine Diff.
		const norm = (v: unknown) =>
			typeof v === "string" ? v.trim() : (v ?? null);
		if (norm(before) !== norm(after) && (before || after)) {
			out.push({
				kind: "scalar",
				field: f,
				before: before as string | number | null,
				after: after as string | number | null,
			});
		}
	}

	// Skills-Diff: added / removed / level-up.
	const snapSkills = new Map(
		(snap.skills ?? []).map((s) => [s.name.toLowerCase(), s]),
	);
	const currentSkills = new Map(
		(current.skills ?? []).map((s) => [s.name.toLowerCase(), s]),
	);
	const added: { name: string; level?: number }[] = [];
	const removed: { name: string; level?: number }[] = [];
	const leveledUp: { name: string; before?: number; after?: number }[] = [];
	for (const [k, c] of currentSkills) {
		const s = snapSkills.get(k);
		if (!s) added.push(c);
		else if ((s.level ?? 0) < (c.level ?? 0)) {
			leveledUp.push({ name: c.name, before: s.level, after: c.level });
		}
	}
	for (const [k, s] of snapSkills) {
		if (!currentSkills.has(k)) removed.push(s);
	}
	if (added.length || removed.length || leveledUp.length) {
		out.push({ kind: "skills", added, removed, leveledUp });
	}

	// Industries-Diff (string[]).
	const snapInd = new Set((snap.industries ?? []).map((s) => s.toLowerCase()));
	const curInd = new Set(
		(current.industries ?? []).map((s) => s.toLowerCase()),
	);
	const indAdded = (current.industries ?? []).filter(
		(s) => !snapInd.has(s.toLowerCase()),
	);
	const indRemoved = (snap.industries ?? []).filter(
		(s) => !curInd.has(s.toLowerCase()),
	);
	if (indAdded.length || indRemoved.length) {
		out.push({
			kind: "list",
			field: "industries",
			added: indAdded,
			removed: indRemoved,
		});
	}

	return out;
}

export function ProfileEvolution({
	snap,
	current,
}: {
	snap: ApplicationProfileSnapshot;
	current: CurrentProfile;
}) {
	const t = useTranslations("Applications");
	const changes = computeDiff(snap, current);

	if (changes.length === 0) {
		return (
			<div className="rounded-sm border border-border border-dashed bg-muted/30 p-4 text-muted-foreground text-xs leading-relaxed">
				{t("evolutionNoChanges")}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("evolutionHint")}
			</p>
			<ul className="space-y-2">
				{changes.map((c) => {
					if (c.kind === "scalar") {
						return (
							<li
								key={c.field}
								className="rounded-sm border border-border bg-background p-3"
							>
								<p className="lv-eyebrow text-[0.5rem] text-muted-foreground">
									{t(`evolutionField.${c.field}`)}
								</p>
								<div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs">
									<span className="break-words text-muted-foreground line-through">
										{c.before == null || c.before === ""
											? t("evolutionEmpty")
											: typeof c.before === "number"
												? c.before.toLocaleString()
												: String(c.before)}
									</span>
									<ArrowRight
										className="h-3.5 w-3.5 text-primary"
										strokeWidth={1.5}
									/>
									<span className="break-words text-emerald-700 dark:text-emerald-300">
										{c.after == null || c.after === ""
											? t("evolutionEmpty")
											: typeof c.after === "number"
												? c.after.toLocaleString()
												: String(c.after)}
									</span>
								</div>
							</li>
						);
					}
					if (c.kind === "skills") {
						return (
							<li
								key="skills"
								className="rounded-sm border border-border bg-background p-3"
							>
								<p className="lv-eyebrow text-[0.5rem] text-muted-foreground">
									{t("evolutionSkillsTitle")}
								</p>
								{c.added.length > 0 && (
									<div className="mt-2">
										<p className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
											{t("evolutionSkillsAdded", { n: c.added.length })}
										</p>
										<ul className="mt-1 flex flex-wrap gap-1.5">
											{c.added.map((s) => (
												<li
													key={s.name}
													className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
												>
													<Plus className="h-2.5 w-2.5" strokeWidth={2} />
													{s.name}
													{s.level ? ` · ${s.level}` : ""}
												</li>
											))}
										</ul>
									</div>
								)}
								{c.leveledUp.length > 0 && (
									<div className="mt-2">
										<p className="font-mono text-[10px] text-primary">
											{t("evolutionSkillsLeveled", { n: c.leveledUp.length })}
										</p>
										<ul className="mt-1 flex flex-wrap gap-1.5">
											{c.leveledUp.map((s) => (
												<li
													key={s.name}
													className="rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-[11px] text-primary"
												>
													{s.name}: {s.before ?? "?"} → {s.after ?? "?"}
												</li>
											))}
										</ul>
									</div>
								)}
								{c.removed.length > 0 && (
									<div className="mt-2">
										<p className="font-mono text-[10px] text-muted-foreground">
											{t("evolutionSkillsRemoved", { n: c.removed.length })}
										</p>
										<ul className="mt-1 flex flex-wrap gap-1.5">
											{c.removed.map((s) => (
												<li
													key={s.name}
													className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground line-through"
												>
													<Minus className="h-2.5 w-2.5" strokeWidth={2} />
													{s.name}
												</li>
											))}
										</ul>
									</div>
								)}
							</li>
						);
					}
					return (
						<li
							key={c.field}
							className="rounded-sm border border-border bg-background p-3"
						>
							<p className="lv-eyebrow text-[0.5rem] text-muted-foreground">
								{t(`evolutionField.${c.field}`)}
							</p>
							<div className="mt-2 flex flex-wrap gap-1.5">
								{c.removed.map((x) => (
									<span
										key={`r-${x}`}
										className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground line-through"
									>
										{x}
									</span>
								))}
								{c.added.map((x) => (
									<span
										key={`a-${x}`}
										className="rounded-sm bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
									>
										+ {x}
									</span>
								))}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
