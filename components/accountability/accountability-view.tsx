import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/compliance/page-data";

// Rechenschaftssicht einer Person: alles, wofür sie verantwortlich (Owner/A)
// ist oder was bei ihr liegt — druckbar für die Managementbewertung
// (DSGVO Art. 5(2), DORA Art. 5, ZAG-MaRisk AT 4.4).

export type AccountabilityItem = {
	id: string;
	href: string;
	code?: string | null;
	title: string;
	meta?: string | null;
	dueAt?: string | Date | null;
	overdue?: boolean;
	status?: string | null;
};

export type AccountabilitySection = {
	key: string;
	title: string;
	hint?: string;
	items: AccountabilityItem[];
};

export function AccountabilityView({
	sections,
	labels,
}: {
	sections: AccountabilitySection[];
	labels: { none: string; overdue: string; total: string };
}) {
	const total = sections.reduce((n, s) => n + s.items.length, 0);
	const overdue = sections.reduce(
		(n, s) => n + s.items.filter((i) => i.overdue).length,
		0,
	);
	return (
		<div className="flex flex-col gap-6 print:text-black">
			<p className="text-muted-foreground text-sm print:text-black">
				{labels.total}: {total}
				{overdue > 0 && (
					<span className="ml-2 text-destructive">
						· {overdue} {labels.overdue}
					</span>
				)}
			</p>
			<div className="grid gap-4 md:grid-cols-2 print:grid-cols-1">
				{sections.map((s) => (
					<section
						key={s.key}
						className="break-inside-avoid rounded-md border p-3 print:rounded-none"
					>
						<h2 className="lv-eyebrow mb-1 flex items-center justify-between text-[0.6rem] text-muted-foreground print:text-black">
							{s.title}
							<span>{s.items.length}</span>
						</h2>
						{s.hint && (
							<p className="mb-2 text-muted-foreground text-xs">{s.hint}</p>
						)}
						{s.items.length === 0 ? (
							<p className="text-muted-foreground text-xs">{labels.none}</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/60 text-sm">
								{s.items.map((i) => (
									<li
										key={i.id}
										className="flex items-center justify-between gap-2 py-1.5"
									>
										<Link
											href={i.href}
											className="min-w-0 truncate hover:underline"
										>
											{i.code && (
												<span className="mr-1 font-mono text-xs">{i.code}</span>
											)}
											{i.title}
											{i.meta && (
												<span className="text-muted-foreground">
													{" "}
													· {i.meta}
												</span>
											)}
										</Link>
										<span className="flex shrink-0 items-center gap-2 text-xs">
											{i.dueAt && (
												<span
													className={
														i.overdue
															? "text-destructive"
															: "text-muted-foreground"
													}
												>
													{fmtDate.format(new Date(i.dueAt))}
												</span>
											)}
											{i.status && (
												<Badge
													variant={i.overdue ? "destructive" : "outline"}
													className="normal-case tracking-normal"
												>
													{i.status}
												</Badge>
											)}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>
				))}
			</div>
		</div>
	);
}
