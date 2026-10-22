"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { type PickerFramework, synergyOf } from "@/lib/marketing/synergy";
import s from "./framework-picker.module.css";

const num = new Intl.NumberFormat("de-DE");

// Ausschnitt aus Klick: Rahmenwerke wählen und sehen, wie viele Controls die
// Anforderungen gemeinsam abdecken — gerechnet mit dem echten Katalog. Ohne
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
	const saved = r.separate - r.controls;
	const toggle = (slug: string) =>
		setSelected((cur) =>
			cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug],
		);
	return (
		<div className={s.panel} data-ui="">
			<div className={s.head}>
				<span className={s.title}>{t("pickerTitle")}</span>
				<span className={s.hint}>
					{t("pickerSelected", {
						n: selected.length,
						total: frameworks.length,
					})}
				</span>
			</div>
			<ul className={s.chips} aria-label={t("pickerLabel")}>
				{frameworks.map((f) => {
					const on = selected.includes(f.slug);
					return (
						<li key={f.slug}>
							<button
								type="button"
								className={s.chip}
								aria-pressed={on}
								onClick={() => toggle(f.slug)}
							>
								{f.label}
								<span className={s.chipCount}>{f.requirements}</span>
							</button>
						</li>
					);
				})}
			</ul>
			<dl className={s.result} aria-live="polite">
				<div className={s.row}>
					<dt>{t("pickerRequirements")}</dt>
					<dd>{num.format(r.requirements)}</dd>
				</div>
				<div className={s.row}>
					<dt>{t("pickerControls")}</dt>
					<dd className={s.strong}>{num.format(r.controls)}</dd>
				</div>
				<div className={s.row}>
					<dt>{t("pickerShared")}</dt>
					<dd>{num.format(r.shared)}</dd>
				</div>
				<div className={s.row}>
					<dt>{t("pickerSeparate")}</dt>
					<dd>{num.format(r.separate)}</dd>
				</div>
			</dl>
			<p className={s.note}>
				{selected.length === 0
					? t("pickerNone")
					: saved > 0
						? t("pickerSaved", { n: num.format(saved) })
						: t("pickerSingle")}
			</p>
		</div>
	);
}
