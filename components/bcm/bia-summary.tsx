import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProcessBia } from "@/db/schema/registers";
import {
	type BiaDimension,
	type BiaIssue,
	biaCurve,
	durationParts,
	suggestTargets,
} from "@/lib/bcm/bia";

// Ergebnis der geführten BIA am Prozess: Verlauf des Schadens über die Zeit,
// Vorschlag aus dem Verlauf, Hinweise. Ohne BIA ein Satz und der Einstieg.

export async function BiaDuration({ hours }: { hours: number }) {
	const t = await getTranslations("Bcm");
	const { unit, count } = durationParts(hours);
	return <>{t(`dur_${unit}`, { count })}</>;
}

export async function BiaSummary({
	code,
	bia,
	dimensions,
	impactLabels,
	issues,
	canEdit,
	current,
}: {
	code: string;
	bia: ProcessBia | null;
	dimensions: BiaDimension[];
	// Bezeichnung je Stufe der Risikomethode (1 … n)
	impactLabels: string[];
	issues: BiaIssue[];
	canEdit: boolean;
	current: { rtoHours: number | null; mtpdHours: number | null };
}) {
	const t = await getTranslations("Bcm");
	const href = `/prozesse/${encodeURIComponent(code)}/bia`;
	const labelOf = new Map(dimensions.map((d) => [d.key, d.label]));
	const curve = bia ? biaCurve(bia, dimensions) : [];
	const s = bia ? suggestTargets(bia, dimensions) : null;
	const differs =
		s !== null &&
		(s.mtpdHours !== current.mtpdHours || s.rtoHours !== current.rtoHours);
	return (
		<div className="mt-4 flex flex-col gap-3">
			{issues.length > 0 && (
				<ul className="flex flex-wrap gap-2">
					{issues.map((i) => (
						<li key={i}>
							<Badge
								variant={
									i === "rto_over_mtpd" || i === "critical_without_targets"
										? "destructive"
										: "warning"
								}
							>
								{t(`issue_${i}`)}
							</Badge>
						</li>
					))}
				</ul>
			)}
			{!bia ? (
				<p className="text-muted-foreground text-subhead">{t("biaNone")}</p>
			) : (
				<>
					<p className="text-muted-foreground text-footnote">
						{t("biaCurveLead")}
					</p>
					<ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
						{curve.map((p) => {
							const over = p.level >= bia.threshold;
							return (
								<li
									key={p.hours}
									className={
										over
											? "rounded-lg bg-destructive/10 px-2.5 py-2"
											: "rounded-lg bg-muted px-2.5 py-2"
									}
								>
									<p className="font-semibold text-footnote tabular-nums">
										<BiaDuration hours={p.hours} />
									</p>
									<p className="text-subhead">
										{p.level > 0
											? (impactLabels[p.level - 1] ?? p.level)
											: t("levelNone")}
									</p>
									{p.decisive.length > 0 && (
										<p className="truncate text-muted-foreground text-caption-1">
											{p.decisive.map((k) => labelOf.get(k) ?? k).join(", ")}
										</p>
									)}
								</li>
							);
						})}
					</ol>
					{s && (
						<p className="text-subhead">
							{s.mtpdHours === null ? (
								t("suggestNone")
							) : (
								<>
									{t("suggestLead")} MTPD <BiaDuration hours={s.mtpdHours} />
									{s.rtoHours !== null && (
										<>
											{" · "}RTO <BiaDuration hours={s.rtoHours} />
										</>
									)}
									{s.rpoHours !== null && (
										<>
											{" · "}RPO <BiaDuration hours={s.rpoHours} />
										</>
									)}
									{differs && (
										<span className="text-muted-foreground">
											{" "}
											{t("suggestDiffers")}
										</span>
									)}
								</>
							)}
						</p>
					)}
				</>
			)}
			{canEdit && (
				<div>
					<Button asChild size="sm" variant={bia ? "outline" : "default"}>
						<Link href={href}>{bia ? t("biaRedo") : t("biaStart")}</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
