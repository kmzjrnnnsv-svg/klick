"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	addedControls,
	bestReuse,
	exampleFor,
	type PickerFramework,
	synergyOf,
} from "@/lib/marketing/synergy";
import s from "./framework-picker.module.css";

const num = new Intl.NumberFormat("de-DE");

// Ausschnitt aus Klick: Rahmenwerke wählen und sehen, wie viele Controls die
// Anforderungen gemeinsam abdecken — gerechnet mit dem echten Katalog. Die
// Zahl an jedem nicht gewählten Rahmenwerk zeigt, was es neu dazubrächte;
// so ergibt die Auswahl schon mit einem Rahmenwerk Sinn. Die Texte sagen
// „Maßnahmen“, der App-Begriff „Controls“ steht einmal in Klammern. Ohne
// Skript bleibt die Vorauswahl stehen (der Server rendert sie).
export function FrameworkPicker({
	frameworks,
	initial,
}: {
	frameworks: PickerFramework[];
	initial: string[];
}) {
	const t = useTranslations("Features");
	const [selected, setSelected] = useState<string[]>(initial);
	const r = synergyOf(frameworks, selected);
	const added = addedControls(frameworks, selected);
	const next = selected.length === 1 ? bestReuse(frameworks, selected) : null;
	// Anforderung und Control zählen verschieden (ein Artikel kann viele
	// Controls brauchen): mit einem echten Beispiel aus der Auswahl erklären
	const example = exampleFor(frameworks, selected);
	const toggle = (slug: string) =>
		setSelected((cur) =>
			cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug],
		);
	return (
		<div className={s.panel} data-ui="">
			<div className={s.head}>
				<span className={s.title}>{t("pickerTitle")}</span>
				<span className={s.hint}>
					{t("pickerSelected", { n: selected.length })}
				</span>
			</div>
			<ul className={s.chips} aria-label={t("pickerLabel")}>
				{frameworks.map((f) => {
					const on = selected.includes(f.slug);
					const n = added.get(f.slug)?.added ?? 0;
					return (
						<li key={f.slug}>
							<button
								type="button"
								className={s.chip}
								aria-pressed={on}
								onClick={() => toggle(f.slug)}
							>
								{f.label}
								{on ? (
									<Check className={s.check} aria-hidden="true" />
								) : (
									<>
										<span className={s.chipCount} aria-hidden="true">
											+{num.format(n)}
										</span>
										<span className="sr-only">, {t("pickerAdded", { n })}</span>
									</>
								)}
							</button>
						</li>
					);
				})}
			</ul>
			<p className={s.legend}>{t("pickerLegend")}</p>
			<div aria-live="polite">
				<dl className={s.result}>
					<div className={s.row}>
						<dt>{t("pickerRequirements")}</dt>
						<dd>{num.format(r.requirements)}</dd>
					</div>
					<div className={s.row}>
						<dt>{t("pickerControls")}</dt>
						<dd className={s.strong}>{num.format(r.controls)}</dd>
					</div>
					{selected.length > 1 && (
						<div className={s.row}>
							<dt>{t("pickerShared")}</dt>
							<dd>{num.format(r.shared)}</dd>
						</div>
					)}
				</dl>
				{example && (
					<p className={s.explain}>
						{t("pickerExample", {
							name: `${example.label} ${example.code}`,
							title: example.title,
							n: example.controls,
						})}
					</p>
				)}
				<p className={s.note}>
					{selected.length === 0
						? t("pickerNone")
						: selected.length > 1
							? t("pickerCompare", {
									separate: num.format(r.separate),
									controls: num.format(r.controls),
								})
							: next
								? t("pickerSingle", {
										name: next.label,
										reused: num.format(next.reused),
										total: num.format(next.total),
									})
								: t("pickerSingleNone")}
				</p>
			</div>
		</div>
	);
}
