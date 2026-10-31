import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ListSection } from "@/components/ui/list";
import {
	FRAMEWORK_RELATIONS,
	RELATION_LABEL,
} from "@/lib/compliance/catalog/framework-relations";
import type { Overlap } from "@/lib/compliance/framework-map";
import { shortFrameworkName } from "@/lib/compliance/framework-names";

// Rahmenwerke untereinander (Teil Z5): gepflegte Beziehungen (baut auf, geht
// vor, löst ab, ergänzt, fast gleich) und die Paare mit den meisten
// gemeinsamen Maßnahmen. compareHref führt in der App zum Vergleich.

const row =
	"relative flex flex-col gap-1 px-4 py-3 before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden";

export async function FrameworkLinks({
	frameworks,
	pairs,
	compareHref,
}: {
	frameworks: readonly string[];
	pairs: readonly Overlap[];
	compareHref?: (a: string, b: string) => string;
}) {
	const t = await getTranslations("Relations");
	const set = new Set(frameworks);
	const relations = FRAMEWORK_RELATIONS.filter(
		(r) => set.has(r.from) && set.has(r.to),
	);
	const pct = (x: number) => `${Math.round(x * 100)} %`;
	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
			{relations.length > 0 && (
				<ListSection title={t("relationsTitle")}>
					{relations.map((r) => (
						<li key={`${r.from}|${r.to}`} className={row}>
							<span className="font-medium text-subhead">
								{shortFrameworkName(r.from)}{" "}
								<span className="text-muted-foreground">
									{RELATION_LABEL[r.kind]}
								</span>{" "}
								{shortFrameworkName(r.to)}
							</span>
							<span className="text-subhead">{r.text}</span>
							{r.basis && (
								<span className="text-footnote text-muted-foreground">
									{r.basis}
								</span>
							)}
						</li>
					))}
				</ListSection>
			)}
			{pairs.length > 0 && (
				<ListSection title={t("pairsTitle")} footer={t("pairsFooter")}>
					{pairs.map((p) => {
						const small =
							p.onlyA.length + p.shared.length <=
							p.onlyB.length + p.shared.length
								? p.a
								: p.b;
						const big = small === p.a ? p.b : p.a;
						const body = (
							<>
								<span className="flex flex-wrap items-baseline justify-between gap-x-3">
									<span className="font-medium text-subhead">
										{t("pairName", {
											a: shortFrameworkName(p.a),
											b: shortFrameworkName(p.b),
										})}
									</span>
									<span className="text-footnote text-muted-foreground tabular-nums">
										{t("pairShared", { n: p.shared.length })}
									</span>
								</span>
								<span className="text-subhead">
									{t("pairShare", {
										small: shortFrameworkName(small),
										big: shortFrameworkName(big),
										pct: pct(p.share),
									})}
								</span>
							</>
						);
						return (
							<li key={`${p.a}|${p.b}`} className={row}>
								{compareHref ? (
									<Link
										href={compareHref(p.a, p.b)}
										className="flex flex-col gap-1 hover:underline underline-offset-4"
									>
										{body}
									</Link>
								) : (
									body
								)}
							</li>
						);
					})}
				</ListSection>
			)}
		</div>
	);
}
