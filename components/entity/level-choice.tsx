"use client";

import { cn } from "@/lib/utils";

export type LevelOption = {
	value: number;
	label: string;
	anchor?: string;
};

// Auswahl einer Stufe als Karten mit Ankertext (Risiko-Assistent,
// Lieferantenbewertung, AML-Faktoren). Native Radios — Tastatur und
// Screenreader funktionieren ohne Zusatz.
export function LevelChoice({
	name,
	legend,
	hint,
	options,
	value,
	onChange,
	disabled,
	compact,
	className,
}: {
	name: string;
	legend: React.ReactNode;
	hint?: React.ReactNode;
	options: LevelOption[];
	value: number | null | undefined;
	onChange: (v: number) => void;
	disabled?: boolean;
	compact?: boolean;
	className?: string;
}) {
	return (
		<fieldset className={cn("flex flex-col gap-2", className)}>
			<legend className="mb-1 font-medium text-sm">{legend}</legend>
			{hint && <p className="-mt-1 text-muted-foreground text-xs">{hint}</p>}
			<div
				className={cn(
					"grid gap-2",
					compact ? "sm:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-5",
				)}
			>
				{options.map((o) => (
					<label
						key={o.value}
						className={cn(
							"flex cursor-pointer flex-col gap-1 rounded-md border bg-background p-2.5 text-xs transition-colors hover:border-foreground/40",
							"has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
							disabled && "cursor-default opacity-70",
						)}
					>
						<span className="flex items-center gap-2 font-medium text-sm">
							<input
								type="radio"
								name={name}
								value={o.value}
								checked={value === o.value}
								disabled={disabled}
								onChange={() => onChange(o.value)}
								className="accent-primary"
							/>
							<span className="tabular-nums">{o.value}</span>
							<span>{o.label}</span>
						</span>
						{o.anchor && !compact && (
							<span className="text-muted-foreground leading-snug">
								{o.anchor}
							</span>
						)}
					</label>
				))}
			</div>
		</fieldset>
	);
}
