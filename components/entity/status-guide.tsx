import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MACHINES, type MachineKind } from "@/lib/entities/machines";
import { statusPath } from "@/lib/entities/status-machine";
import type { StatusMachine } from "@/lib/entities/types";
import { cn } from "@/lib/utils";

// Schritt-Leiste + „Was jetzt?“ unter dem Kopf einer Detailseite. Der Weg
// kommt aus der Maschine (happyPath bzw. Primärübergänge); Nebenzustände wie
// „blockiert“ oder „nicht anwendbar“ erscheinen als eigenes Label.
export async function StatusGuide({
	kind,
	status,
	extra,
}: {
	kind: MachineKind;
	status: string;
	// z. B. „wartet auf Anna (Compliance)“ aus der Freigabe
	extra?: string;
}) {
	const t = await getTranslations("Status");
	const machine = MACHINES[kind] as StatusMachine<string>;
	const path = statusPath(machine);
	const at = path.indexOf(status);
	const label = (s: string) => t(machine.labelKey[s] as "notStarted");
	const hint = machine.hintKey?.[status];
	return (
		<div className="flex flex-col gap-2">
			<ol
				aria-label={t("stepsLabel")}
				className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
			>
				{path.map((s, i) => {
					const done = at >= 0 && i < at;
					const current = i === at;
					return (
						<li key={s} className="flex items-center gap-2">
							{i > 0 && (
								<span
									aria-hidden="true"
									className={cn(
										"h-px w-5 sm:w-8",
										done || current ? "bg-primary" : "bg-border",
									)}
								/>
							)}
							<span
								aria-current={current ? "step" : undefined}
								className={cn(
									"inline-flex items-center gap-1.5",
									current
										? "font-medium text-foreground"
										: done
											? "text-foreground/70"
											: "text-muted-foreground",
								)}
							>
								<span
									aria-hidden="true"
									className={cn(
										"flex size-4 items-center justify-center rounded-full border",
										current
											? "border-primary bg-primary text-primary-foreground"
											: done
												? "border-primary text-primary"
												: "border-border",
									)}
								>
									{done && <Check className="size-2.5" />}
								</span>
								{label(s)}
							</span>
						</li>
					);
				})}
				{at < 0 && (
					<li className="ml-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-warning">
						{t("sideState", { state: label(status) })}
					</li>
				)}
			</ol>
			{(hint || extra) && (
				<p className="max-w-3xl text-muted-foreground text-sm">
					{hint ? t(hint as "hint_task_todo") : null}
					{hint && extra ? " " : null}
					{extra}
				</p>
			)}
		</div>
	);
}
