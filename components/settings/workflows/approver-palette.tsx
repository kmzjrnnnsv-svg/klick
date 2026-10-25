"use client";

import { useTranslations } from "next-intl";
import { Draggable, DropZone } from "@/components/ui/dnd";
import type { DesignerDrag, DesignerDrop } from "@/lib/approvals/designer-dnd";

type Opt = { value: string; label: string };
type Group = { label: string; options: Opt[] };

// Palette der Stellen für den Freigabe-Designer (individueller Modus):
// in eine Stufe ziehen = hinzufügen, auf „Neue Stufe“ = neue Stufe, aus einer
// Stufe hierher zurück = entfernen. Ab Tablet-Breite; am Handy bleibt die
// Auswahl in jeder Stufe.
export function ApproverPalette({
	groups,
	disabled,
}: {
	groups: Group[];
	disabled: boolean;
}) {
	const t = useTranslations("Workflows");
	const drop: DesignerDrop = { type: "palette" };
	const everyone: DesignerDrag = { type: "everyone" };
	const chip =
		"flex min-h-(--control-h-sm) items-center rounded-xl bg-muted px-3 text-subhead";
	return (
		<DropZone
			id="palette"
			target={{
				label: t("paletteRemove"),
				accepts: ["assigned"],
				payload: drop,
			}}
			disabled={disabled}
			className="sticky top-20 hidden max-h-[calc(100dvh-7rem)] flex-col gap-4 self-start overflow-y-auto rounded-2xl bg-card p-3 md:flex"
		>
			<div className="flex flex-col gap-0.5">
				<h3 className="font-semibold text-subhead">{t("paletteTitle")}</h3>
				<p className="text-muted-foreground text-footnote">
					{t("paletteLead")}
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<h4 className="text-muted-foreground text-footnote">
					{t("paletteStep")}
				</h4>
				<Draggable
					id="palette:everyone"
					item={{
						kind: "everyone",
						label: t("paletteEveryone"),
						payload: everyone,
					}}
					disabled={disabled}
					className={`${chip} self-start`}
				>
					{t("paletteEveryone")}
				</Draggable>
			</div>
			{groups.map((g) => (
				<div key={g.label} className="flex flex-col gap-1.5">
					<h4 className="text-muted-foreground text-footnote">{g.label}</h4>
					<ul className="flex flex-wrap gap-1.5">
						{g.options.map((o) => {
							const payload: DesignerDrag = { type: "rule", rule: o.value };
							return (
								<li key={o.value} className="min-w-0 max-w-full">
									<Draggable
										id={`palette:${o.value}`}
										item={{ kind: "rule", label: o.label, payload }}
										disabled={disabled}
										className={`${chip} max-w-full py-1`}
									>
										<span className="min-w-0 hyphens-auto break-words">
											{o.label}
										</span>
									</Draggable>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</DropZone>
	);
}
