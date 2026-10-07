import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { DependencyNode } from "@/lib/compliance/queries-p3";
import { providerConcentration } from "@/lib/compliance/queries-p3";

const CRIT_TONE = {
	critical: "destructive",
	important: "warning",
	standard: "outline",
} as const;

// Abhängigkeitskarte Prozess → System → Dienstleister, generiert aus den
// Verknüpfungen (DORA Art. 8(1)/(4), Businessplan 17.12 AP3). Desktop-first.
export function DependencyMap({
	nodes,
	labels,
}: {
	nodes: DependencyNode[];
	labels: {
		assets: string;
		providers: string;
		none: string;
		concentration: string;
		concentrationLead: string;
		criticalProcesses: string;
		processes: string;
		rto: string;
		crit: Record<string, string>;
	};
}) {
	const conc = providerConcentration(nodes);
	return (
		<div className="flex flex-col gap-8">
			<ol className="flex flex-col gap-3">
				{nodes.map((n) => (
					<li
						key={n.id}
						className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
					>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<Link
									href={`/prozesse/${encodeURIComponent(n.code)}`}
									className="font-mono text-xs hover:underline"
								>
									{n.code}
								</Link>
								<Badge
									variant={
										CRIT_TONE[n.criticality as keyof typeof CRIT_TONE] ??
										"outline"
									}
								>
									{labels.crit[n.criticality] ?? n.criticality}
								</Badge>
								{n.rtoHours !== null && (
									<span className="text-muted-foreground text-xs">
										{labels.rto} {n.rtoHours} h
									</span>
								)}
							</div>
							<p className="mt-1 font-medium">{n.name}</p>
						</div>
						<div className="min-w-0 border-border/60 md:border-l md:pl-3">
							<p className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
								{labels.assets}
							</p>
							{n.assets.length === 0 ? (
								<p className="text-muted-foreground text-xs">{labels.none}</p>
							) : (
								<ul className="flex flex-col gap-0.5 text-xs">
									{n.assets.map((a) => (
										<li key={a.id} className="truncate">
											{a.name}
											<span className="text-muted-foreground">
												{" "}
												· {a.type}
												{a.providerName ? ` → ${a.providerName}` : ""}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
						<div className="min-w-0 border-border/60 md:border-l md:pl-3">
							<p className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
								{labels.providers}
							</p>
							{n.providers.length === 0 ? (
								<p className="text-muted-foreground text-xs">{labels.none}</p>
							) : (
								<ul className="flex flex-wrap gap-1">
									{n.providers.map((p) => (
										<li key={p.id}>
											<Badge
												variant={
													CRIT_TONE[p.criticality as keyof typeof CRIT_TONE] ??
													"outline"
												}
												className="normal-case tracking-normal"
											>
												{p.name}
											</Badge>
										</li>
									))}
								</ul>
							)}
						</div>
					</li>
				))}
			</ol>
			{conc.length > 0 && (
				<section>
					<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
						{labels.concentration}
					</h2>
					<p className="mt-1 mb-3 text-muted-foreground text-xs">
						{labels.concentrationLead}
					</p>
					<ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
						{conc.map((c) => (
							<li
								key={c.id}
								className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
							>
								<Link
									href="/dienstleister"
									className="min-w-0 truncate hover:underline"
								>
									{c.name}
								</Link>
								<span className="shrink-0 text-xs">
									<span
										className={
											c.critical > 0 ? "font-medium text-destructive" : ""
										}
									>
										{c.critical} {labels.criticalProcesses}
									</span>
									<span className="text-muted-foreground">
										{" "}
										· {c.total} {labels.processes}
									</span>
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
