import { getTranslations } from "next-intl/server";
import { ListRow, ListSection } from "@/components/ui/list";
import type { NextStep } from "@/lib/compliance/next-steps";

// „Als Nächstes“ auf /heute und /ueberblick (S2): höchstens fünf Schritte,
// geordnet nach Wirkung, als gruppierte Liste mit Drill-down.
export async function NextStepsList({
	steps,
	className,
}: {
	steps: NextStep[];
	className?: string;
}) {
	const t = await getTranslations("NextSteps");
	const tsu = await getTranslations("Setup");
	const tr = await getTranslations("Readiness");
	// Werte, die selbst übersetzt werden (Schritt der Einrichtung, Art des Blockers)
	const values = (s: NextStep) => {
		const v = { ...s.values };
		if (s.key === "setup")
			v.step = tsu(`step_${String(v.step)}` as Parameters<typeof tsu>[0]);
		if (s.key === "readiness")
			v.kind = tr(`kind_${String(v.kind)}` as Parameters<typeof tr>[0]);
		return v;
	};
	return (
		<ListSection
			title={t("title")}
			footer={steps.length > 0 ? t("footer") : undefined}
			className={className}
		>
			{steps.length === 0 ? (
				<ListRow title={t("empty")} />
			) : (
				steps.map((s) => {
					const v = values(s);
					return (
						<ListRow
							key={s.key}
							href={s.href}
							title={t(`step_${s.key}`, v)}
							subtitle={t(`detail_${s.key}`, v)}
						/>
					);
				})
			)}
		</ListSection>
	);
}
