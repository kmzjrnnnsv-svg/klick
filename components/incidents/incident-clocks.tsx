import { Badge } from "@/components/ui/badge";
import { type ClockState, clockState } from "@/lib/compliance/incident";
import { ReportButton } from "./incident-forms";

const TONE: Record<
	ClockState,
	"success" | "destructive" | "warning" | "outline"
> = {
	done: "success",
	overdue: "destructive",
	soon: "warning",
	due: "outline",
};

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Regime-bewusstes Uhren-Panel: Erstmeldung / Zwischenbericht / Abschluss
// (DORA) bzw. Frühwarnung / Meldung / Abschluss (NIS2), DSGVO 72 h.
export function IncidentClocks({
	incidentId,
	regimes,
	clocks,
	labels,
	canEdit,
	projected,
}: {
	incidentId: string;
	// Anzeigenamen der Regime (übersetzt)
	regimes: string[];
	clocks: {
		key: "initial" | "intermediate" | "final";
		label: string;
		dueAt: Date | null;
		reportedAt: Date | null;
	}[];
	labels: {
		done: string;
		overdue: string;
		soon: string;
		due: string;
		markReported: string;
		projected: string;
	};
	canEdit: boolean;
	projected: boolean;
}) {
	const now = new Date();
	return (
		<div className="flex flex-col gap-2">
			<p className="text-muted-foreground text-footnote">
				{regimes.join(" · ")}
			</p>
			<ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				{clocks
					.filter((c) => c.dueAt)
					.map((c) => {
						const state = clockState(c.dueAt, c.reportedAt, now) ?? "due";
						return (
							<li
								key={c.key}
								className="flex flex-col gap-1 rounded-2xl bg-card p-3 text-subhead"
							>
								<span className="font-medium text-footnote text-muted-foreground">
									{c.label}
								</span>
								<span className="font-medium">
									{c.dueAt ? fmt.format(c.dueAt) : "—"}
								</span>
								<Badge variant={TONE[state]} className="w-fit">
									{labels[state]}
									{state === "done" && c.reportedAt
										? ` ${fmt.format(c.reportedAt)}`
										: ""}
								</Badge>
								{canEdit && state !== "done" && (
									<ReportButton
										incidentId={incidentId}
										report={c.key}
										label={labels.markReported}
									/>
								)}
							</li>
						);
					})}
			</ul>
			{projected && (
				<p className="text-muted-foreground text-footnote">
					{labels.projected}
				</p>
			)}
		</div>
	);
}
