import { ChevronRight } from "lucide-react";
import { BASIC_PICTURE } from "@/lib/compliance/catalog/framework-profiles";

// Das Grundbild (Teil Z1): Compliance mit den Regeln fürs Radfahren
// erklärt. Gleich in der App, auf der Website und in der Hilfe.

export function BasicPicture({
	headingLevel = 2,
	collapsedTitle,
}: {
	headingLevel?: 2 | 3;
	// gesetzt = zugeklappt mit diesem Titel (App: der Ablauf steht oben)
	collapsedTitle?: string;
}) {
	const H = headingLevel === 2 ? "h2" : "h3";
	const body = (
		<>
			<p className="text-body">{BASIC_PICTURE.lead}</p>
			<dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
				{BASIC_PICTURE.points.map((p) => (
					<div key={p.term} className="flex flex-col gap-1">
						<dt className="font-semibold text-subhead">{p.term}</dt>
						<dd className="text-muted-foreground text-subhead">{p.text}</dd>
					</div>
				))}
			</dl>
		</>
	);
	if (collapsedTitle)
		return (
			<details className="group rounded-2xl bg-card">
				<summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold text-headline [&::-webkit-details-marker]:hidden">
					<ChevronRight
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
					/>
					{collapsedTitle}
				</summary>
				<div className="flex flex-col gap-3 border-border/70 border-t px-4 py-4">
					{body}
				</div>
			</details>
		);
	return (
		<section className="flex flex-col gap-3 rounded-2xl bg-card p-4 sm:p-6">
			<H className="font-semibold text-title-3">{BASIC_PICTURE.title}</H>
			{body}
		</section>
	);
}
