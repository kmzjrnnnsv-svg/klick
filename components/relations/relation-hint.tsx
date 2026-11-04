import { Link2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RelationHint } from "@/lib/compliance/relation-hints";

// „So hängt das zusammen“ im Ablauf (Teil Z7): an einer Frage der
// Gap-Analyse, an einem Control oder Nachweis. Ohne Server-Importe, damit
// auch Client-Komponenten ihn zeigen können.

export function RelationHintBox({
	hint,
	mode = "answer",
}: {
	hint: RelationHint;
	// answer = Frage der Gap-Analyse, control = Seite einer Maßnahme
	mode?: "answer" | "control";
}) {
	const t = useTranslations("Relations");
	if (hint.frameworks.length === 0 && !hint.simple) return null;
	const many = hint.frameworks.length > 1;
	const noted = hint.partial.filter((p) => p.note);
	const bare = hint.partial.filter((p) => !p.note);
	return (
		<aside
			aria-label={t("hintTitle")}
			className="flex flex-col gap-1.5 rounded-xl bg-muted/60 p-3 text-subhead"
		>
			<p className="flex items-center gap-1.5 font-semibold text-footnote text-muted-foreground">
				<Link2 className="size-3.5" aria-hidden="true" />
				{t("hintTitle")}
			</p>
			{hint.simple && <p>{hint.simple}</p>}
			{hint.frameworks.length > 0 && (
				<p>
					{many
						? t(mode === "answer" ? "hintManyAnswer" : "hintMany", {
								names: hint.frameworks.join(", "),
							})
						: t("hintOne", { name: hint.frameworks[0] ?? "" })}
				</p>
			)}
			{hint.strictest.map((s) => (
				<p key={s.topic}>
					{t("hintStrictest", {
						topic: s.topic,
						names: s.names.join(", "),
						count: s.names.length,
						value: s.value,
					})}
				</p>
			))}
			{hint.additions.length > 0 && (
				<div className="flex flex-col gap-1">
					<p className="font-medium">{t("hintAdditions")}</p>
					<ul className="flex list-disc flex-col gap-1 pl-5">
						{hint.additions.map((a) => (
							<li key={a.text}>
								{a.text}{" "}
								<span className="text-muted-foreground">
									({a.names.join(", ")})
								</span>
							</li>
						))}
					</ul>
					{hint.moreAdditions > 0 && (
						<Link
							href={`/controls/${encodeURIComponent(hint.control)}#wer-verlangt-das`}
							className="self-start text-primary hover:underline underline-offset-4"
						>
							{t("hintAdditionsMore", { n: hint.moreAdditions })}
						</Link>
					)}
				</div>
			)}
			{bare.length > 0 && hint.additions.length === 0 && (
				<p className="text-muted-foreground">
					{t("hintPartialMany", {
						names: bare.map((p) => p.name).join(", "),
						count: bare.length,
					})}
				</p>
			)}
			{noted.map((p) => (
				<p key={p.name} className="text-muted-foreground">
					{t("hintPartialNote", { name: p.name, note: p.note ?? "" })}
				</p>
			))}
			{hint.conflicts.map((c) => (
				<p key={c} className="font-medium">
					{t("hintConflict", { hint: c })}
				</p>
			))}
		</aside>
	);
}
