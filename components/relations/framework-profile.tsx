import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import {
	FRAMEWORK_PROFILES,
	ISSUER_LABEL,
	ISSUER_MUST,
} from "@/lib/compliance/catalog/framework-profiles";

// „Einfach erklärt“ oben auf der Seite eines Rahmenwerks (Teil Z2):
// wozu, für wen, wer es verlangt, was ohne passiert, wie man es zeigt.
// Server-Komponente; die Texte stehen in framework-profiles.ts.

export async function FrameworkProfileCard({ slug }: { slug: string }) {
	const p = FRAMEWORK_PROFILES[slug];
	if (!p) return null;
	const t = await getTranslations("Relations");
	const must = ISSUER_MUST[p.issuer];
	const rows: { label: string; value: string }[] = [
		{ label: t("labelWhy"), value: p.why },
		{ label: t("labelForWhom"), value: p.forWhom },
		{
			label: t("labelIssuer"),
			value: `${ISSUER_LABEL[p.issuer]}. ${t(`must_${must}`)}`,
		},
		{ label: t("labelIfNot"), value: p.ifNot },
		{ label: t("labelProof"), value: p.proof },
	];
	return (
		<Section title={t("simpleTitle")}>
			<div className="flex flex-col gap-4 rounded-2xl bg-card p-4">
				<div className="flex flex-col gap-1">
					<p className="font-semibold text-body">{p.simple}</p>
					<p className="text-muted-foreground text-subhead">{p.example}</p>
				</div>
				<dl className="flex flex-col gap-3 text-subhead">
					{rows.map((r) => (
						<div
							key={r.label}
							className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4"
						>
							<dt className="font-medium text-muted-foreground">{r.label}</dt>
							<dd>{r.value}</dd>
						</div>
					))}
				</dl>
			</div>
		</Section>
	);
}
