import { useTranslations } from "next-intl";
import type { ProfileEducation } from "@/db/schema";

const DEGREE_TYPE_LABEL: Record<NonNullable<ProfileEducation["degreeType"]>, string> = {
	school: "Schule",
	apprenticeship: "Ausbildung",
	bachelor: "Bachelor",
	master: "Master",
	phd: "PhD",
	mba: "MBA",
	other: "Sonstige",
};

export function EducationCard({ items }: { items: ProfileEducation[] }) {
	const t = useTranslations("Profile");
	return (
		<ul className="space-y-2">
			{items.map((e) => (
				<li
					key={`${e.institution}-${e.degree}-${e.start ?? ""}`}
					className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between"
				>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span className="font-medium text-sm">{e.degree}</span>
							{e.degreeType && (
								<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
									{DEGREE_TYPE_LABEL[e.degreeType]}
								</span>
							)}
						</div>
						<div className="text-muted-foreground text-xs">
							{e.institution}
							{e.start ? ` · ${e.start}` : ""}
							{e.end ? ` – ${e.end}` : ""}
						</div>
						{e.focus && (
							<div className="text-foreground/80 text-xs">
								<span className="text-muted-foreground">{t("focus")}: </span>
								{e.focus}
							</div>
						)}
						{e.thesisTitle && (
							<div className="text-foreground/80 text-xs">
								<span className="text-muted-foreground">{t("thesis")}: </span>“
								{e.thesisTitle}”
							</div>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{e.grade && (
							<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-300">
								{t("grade")} {e.grade}
							</span>
						)}
						{e.completed === false && (
							<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-300">
								{t("noDegree")}
							</span>
						)}
					</div>
				</li>
			))}
		</ul>
	);
}
