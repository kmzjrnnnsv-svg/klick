import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { PersonView } from "@/lib/compliance/function-holders";

// je Person ihre Funktionen, darunter die Hinweise zur Funktionstrennung
export function WhoHoldsWhat({
	people,
	showSod = true,
}: {
	people: PersonView[];
	// /organisation zeigt die Funktionstrennung schon im Kasten darüber
	showSod?: boolean;
}) {
	const t = useTranslations("Setup");
	const conflicts = people.some((p) => p.sod.length > 0);
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-semibold text-headline">{t("whoTitle")}</h2>
			<p className="max-w-2xl text-muted-foreground text-subhead">
				{t("whoLead")}
			</p>
			{people.length === 0 ? (
				<p className="rounded-2xl bg-card p-4 text-muted-foreground text-subhead">
					{t("whoEmpty")}
				</p>
			) : (
				<ul className="list-inset rounded-2xl bg-card text-subhead">
					{people.map((p) => (
						<li key={p.key} className="flex flex-col gap-1 px-4 py-3">
							<p className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{p.name}</span>
								{p.kind === "invite" && (
									<Badge variant="warning">{t("pending")}</Badge>
								)}
								{p.kind === "external" && (
									<Badge variant="muted">{t("external")}</Badge>
								)}
							</p>
							<p className="text-muted-foreground">
								{p.functions
									.map((f) =>
										f.as === "deputy"
											? `${f.title} (${t("asDeputy")})`
											: f.title,
									)
									.join(", ")}
							</p>
							{(showSod ? p.sod : []).map((v) => (
								<p key={v.code} className="flex flex-wrap items-baseline gap-2">
									<Badge
										variant={v.severity === "block" ? "destructive" : "warning"}
									>
										{v.severity === "block" ? t("sodBlock") : t("sodWarn")}
									</Badge>
									<span>{v.text}</span>
								</p>
							))}
						</li>
					))}
				</ul>
			)}
			{showSod && people.length > 0 && !conflicts && (
				<p className="text-muted-foreground text-footnote">{t("sodOk")}</p>
			)}
		</section>
	);
}
