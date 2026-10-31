import { ChevronRight } from "lucide-react";
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

// Alle Steckbriefe zum Aufklappen (Website): ein Rahmenwerk je Zeile
export async function FrameworkProfileList({
	frameworks,
	open,
}: {
	frameworks: readonly { slug: string; name: string }[];
	open?: string;
}) {
	const t = await getTranslations("Relations");
	return (
		<div className="flex flex-col gap-3">
			{frameworks.map((f) => {
				const p = FRAMEWORK_PROFILES[f.slug];
				if (!p) return null;
				const rows = [
					{ label: t("labelWhy"), value: p.why },
					{ label: t("labelForWhom"), value: p.forWhom },
					{
						label: t("labelIssuer"),
						value: `${ISSUER_LABEL[p.issuer]}. ${t(`must_${ISSUER_MUST[p.issuer]}`)}`,
					},
					{ label: t("labelIfNot"), value: p.ifNot },
					{ label: t("labelProof"), value: p.proof },
				];
				return (
					<details
						key={f.slug}
						id={`rw-${f.slug}`}
						open={open === f.slug}
						className="group scroll-mt-24 rounded-2xl bg-card"
					>
						<summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
							<ChevronRight
								aria-hidden="true"
								className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
							/>
							<span className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="font-semibold text-headline">{f.name}</span>
								<span className="text-subhead">{p.simple}</span>
							</span>
						</summary>
						<div className="flex flex-col gap-3 border-border/70 border-t px-4 py-3">
							<p className="text-muted-foreground text-subhead">{p.example}</p>
							<dl className="flex flex-col gap-3 text-subhead">
								{rows.map((r) => (
									<div
										key={r.label}
										className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4"
									>
										<dt className="font-medium text-muted-foreground">
											{r.label}
										</dt>
										<dd>{r.value}</dd>
									</div>
								))}
							</dl>
						</div>
					</details>
				);
			})}
		</div>
	);
}
