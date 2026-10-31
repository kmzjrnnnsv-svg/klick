import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	COMPLIANCE_PROCESS,
	PROCESS_EXAMPLE,
} from "@/lib/compliance/catalog/compliance-process";

// Der Ablauf als roter Faden (Teil Z7): sechs Schritte mit einem Beispiel,
// das durch alle läuft. In der App führt jeder Schritt zur Stelle in Klick.

export async function ProcessSteps({ links = false }: { links?: boolean }) {
	const t = await getTranslations("Relations");
	return (
		<section aria-labelledby="process-title" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h2 id="process-title" className="font-semibold text-title-3">
					{t("processTitle")}
				</h2>
				<p className="text-muted-foreground text-subhead">
					{t("processLead")} {PROCESS_EXAMPLE}.
				</p>
			</div>
			<ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{COMPLIANCE_PROCESS.map((s, i) => (
					<li
						key={s.key}
						className="flex flex-col gap-2 rounded-2xl bg-card p-4"
					>
						<div className="flex items-center gap-3">
							<span
								aria-hidden="true"
								className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-fill font-semibold text-footnote text-white tabular-nums"
							>
								{i + 1}
							</span>
							<h3 className="font-semibold text-headline">
								<span className="sr-only">
									{t("processStep", { n: i + 1 })}{" "}
								</span>
								{s.title}
							</h3>
						</div>
						<p className="text-subhead">{s.what}</p>
						<p className="rounded-xl bg-muted/60 p-3 text-subhead">
							{s.example}
						</p>
						{links && (
							<Link
								href={s.href}
								className="mt-auto text-primary text-subhead hover:underline underline-offset-4"
							>
								{t("processOpen", { place: s.place })}
							</Link>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}
