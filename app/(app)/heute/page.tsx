import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/guards";

export default async function TodayPage() {
	const ctx = await requireOrg();
	const t = await getTranslations("Today");
	const sections = [
		t("approvals"),
		t("tasks"),
		t("due"),
		t("acknowledgements"),
		t("mentions"),
	];
	return (
		<>
			<PageHeader
				eyebrow={new Intl.DateTimeFormat("de-DE", {
					dateStyle: "full",
					timeZone: "Europe/Berlin",
				}).format(new Date())}
				title={t("greeting", { name: ctx.name.split(" ")[0] ?? ctx.name })}
			/>
			<div className="grid gap-4 md:grid-cols-2">
				{sections.map((s) => (
					<Card key={s}>
						<CardHeader>
							<CardTitle className="text-base">{s}</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								{t("emptySection")}
							</p>
						</CardContent>
					</Card>
				))}
			</div>
			<p className="mt-8 text-muted-foreground text-xs">{t("phaseHint")}</p>
		</>
	);
}
