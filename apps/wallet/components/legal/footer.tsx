import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Auf jeder Seite: Impressum und Datenschutz (§ 5 DDG, Art. 13 DSGVO)
export async function LegalFooter() {
	const t = await getTranslations("Legal");
	return (
		<footer className="border-t">
			<div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-muted-foreground text-footnote">
				<span translate="no">both.money</span>
				<Link
					href="/roadmap"
					className="hit-area hover:underline focus-visible:underline"
				>
					{t("roadmap")}
				</Link>
				<Link
					href="/imprint"
					className="hit-area hover:underline focus-visible:underline"
				>
					{t("imprint")}
				</Link>
				<Link
					href="/privacy"
					className="hit-area hover:underline focus-visible:underline"
				>
					{t("privacy")}
				</Link>
			</div>
		</footer>
	);
}
