"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { AudienceView } from "@/lib/marketing/audiences";
import s from "./audience-guide.module.css";

const LEVEL_KEY = {
	must: "levelMust",
	depends: "levelDepends",
	indirect: "levelIndirect",
	voluntary: "levelVoluntary",
} as const;

// „Was gilt für dich?“: Art des Unternehmens wählen, darunter je Stufe
// (Pflicht, je nach Größe, über Kund:innen, freiwillig) die Rahmenwerke mit
// Begründung. Daten aus lib/marketing/audiences.ts, vom Server aufbereitet.
// Ohne Skript bleibt die Standardgruppe stehen (der Server rendert sie).
export function AudienceGuide({
	audiences,
	initial,
}: {
	audiences: AudienceView[];
	initial: AudienceView["key"];
}) {
	const t = useTranslations("Features");
	const [key, setKey] = useState(initial);
	const current = audiences.find((a) => a.key === key) ?? audiences[0];
	if (!current) return null;
	return (
		<div className={s.guide}>
			<fieldset className={s.choices}>
				<legend className="sr-only">{t("audienceLabel")}</legend>
				{audiences.map((a) => (
					<button
						key={a.key}
						type="button"
						className={s.choice}
						aria-pressed={a.key === current.key}
						onClick={() => setKey(a.key)}
					>
						{a.label}
					</button>
				))}
			</fieldset>
			<div aria-live="polite">
				<p className={s.hint}>{current.hint}</p>
				<div className={s.groups}>
					{current.groups.map((g) => (
						<section
							key={g.level}
							className={s.group}
							aria-label={t(LEVEL_KEY[g.level])}
						>
							<h3 className={s.groupHead}>
								{t(LEVEL_KEY[g.level])}
								<span className={s.count}>{g.entries.length}</span>
							</h3>
							<ul className={s.rows}>
								{g.entries.map((e) => (
									<li key={e.slug} className={s.row}>
										<span className={s.name}>{e.label}</span>
										<span className={s.why}>{e.why}</span>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
