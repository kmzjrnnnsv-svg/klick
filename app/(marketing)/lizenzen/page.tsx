import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import licenses from "@/lib/legal/licenses.json";

// Lizenzhinweise: Schriften, eigene Bilder und alle ausgelieferten Pakete
// (erzeugt mit `pnpm legal:licenses`, scripts/gen-licenses.ts).
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Licenses");
	return { title: t("title") };
}

type Row = {
	name: string;
	version: string;
	license: string;
	author?: string;
	homepage?: string;
};

const FONTS = [
	{ name: "Jost", by: "Owen Earl (indestructible type*)" },
	{ name: "Cormorant Garamond", by: "Christian Thalmann (Catharsis Fonts)" },
	{ name: "JetBrains Mono", by: "JetBrains s.r.o." },
];

export default async function LicensesPage() {
	const t = await getTranslations("Licenses");
	const groups = new Map<string, Row[]>();
	for (const row of licenses as Row[]) {
		const list = groups.get(row.license) ?? [];
		list.push(row);
		groups.set(row.license, list);
	}
	const sorted = [...groups.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	);
	return (
		<main
			id="inhalt"
			className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16"
		>
			<h1 className="font-serif-display text-3xl text-primary sm:text-4xl">
				{t("title")}
			</h1>
			<p className="mt-6 leading-relaxed">{t("lead")}</p>

			<h2 className="mt-10 font-medium text-lg">{t("fontsTitle")}</h2>
			<ul className="mt-3 space-y-1">
				{FONTS.map((f) => (
					<li key={f.name}>
						<span translate="no">{f.name}</span> — {f.by}, {t("fontsLicense")}
					</li>
				))}
			</ul>

			<h2 className="mt-10 font-medium text-lg">{t("imagesTitle")}</h2>
			<p className="mt-3 leading-relaxed">{t("images")}</p>

			<h2 className="mt-10 font-medium text-lg">{t("packagesTitle")}</h2>
			<p className="mt-3 text-muted-foreground text-sm">
				{t("packagesLead", { count: licenses.length })}
			</p>
			{sorted.map(([license, rows]) => (
				<section
					key={license}
					className="mt-6 [content-visibility:auto]"
					aria-label={license}
				>
					<h3 className="font-medium" translate="no">
						{license}{" "}
						<span className="font-normal text-muted-foreground text-sm">
							({rows.length})
						</span>
					</h3>
					<ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
						{rows.map((r) => (
							<li
								key={`${r.name}@${r.version}`}
								className="min-w-0 break-words"
							>
								{r.homepage ? (
									<a
										href={r.homepage}
										rel="noopener noreferrer nofollow"
										className="underline-offset-4 hover:underline"
										translate="no"
									>
										{r.name}
									</a>
								) : (
									<span translate="no">{r.name}</span>
								)}{" "}
								<span className="text-muted-foreground tabular-nums">
									{r.version}
								</span>
								{r.author && (
									<span className="text-muted-foreground"> · {r.author}</span>
								)}
							</li>
						))}
					</ul>
				</section>
			))}
		</main>
	);
}
