import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/entity/status-badge";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgPage } from "@/lib/auth/gates";
import { BASELINE, CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { CONTROL_STATUS } from "@/lib/entities/control";

// Mandant 0: was die Plattform selbst umgesetzt hat — der lebende Nachweis.
export default async function BaselinePage() {
	await requireOrgPage();
	const t = await getTranslations("Baseline");
	const tc = await getTranslations("Controls");
	const ts = await getTranslations("Status");
	const counts = { implemented: 0, inProgress: 0, planned: 0, open: 0 };
	for (const c of BASELINE.controls) {
		if (c.status === "implemented") counts.implemented += 1;
		else if (c.status === "in_progress") counts.inProgress += 1;
		else if (c.status === "planned") counts.planned += 1;
		else counts.open += 1;
	}
	return (
		<>
			<PageHeader
				eyebrow={t("eyebrow")}
				title={t("title")}
				lead={t("lead", { date: BASELINE.asOf })}
			/>
			<p className="mb-6 text-muted-foreground text-sm">
				{t("summary", {
					implemented: counts.implemented,
					inProgress: counts.inProgress,
					planned: counts.planned,
					open: counts.open,
				})}
			</p>
			<div className="grid gap-4 md:grid-cols-2">
				{BASELINE.narrative.map((n) => (
					<Card key={n.domain}>
						<CardHeader>
							<CardTitle className="text-base">{n.title}</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 text-sm">
							<div>
								<p className="lv-eyebrow mb-1 text-[0.52rem] text-success">
									{t("present")}
								</p>
								<ul className="list-disc pl-5">
									{n.present.map((p) => (
										<li key={p}>{p}</li>
									))}
								</ul>
							</div>
							<div>
								<p className="lv-eyebrow mb-1 text-[0.52rem] text-destructive">
									{t("gaps")}
								</p>
								<ul className="list-disc pl-5 text-muted-foreground">
									{n.gaps.map((g) => (
										<li key={g}>{g}</li>
									))}
								</ul>
							</div>
							<div>
								<p className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
									{t("next")}
								</p>
								<ul className="list-disc pl-5 text-muted-foreground">
									{n.next.map((x) => (
										<li key={x}>{x}</li>
									))}
								</ul>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			<h2 className="lv-eyebrow mt-10 mb-3 text-[0.6rem] text-muted-foreground">
				{t("controlsTitle")}
			</h2>
			<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
				{BASELINE.controls.map((b) => {
					const c = CONTROL_BY_CODE.get(b.code);
					return (
						<li
							key={b.code}
							className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:gap-3"
						>
							<Link
								href={`/controls/${b.code}`}
								className="w-28 shrink-0 font-mono text-xs hover:underline"
							>
								{b.code}
							</Link>
							<div className="min-w-0 flex-1">
								<p className="font-medium">{c?.title ?? b.code}</p>
								<p className="text-muted-foreground text-xs">{b.note}</p>
								{b.evidence && b.evidence.length > 0 && (
									<p className="mt-1 flex flex-wrap gap-1">
										{b.evidence.map((e) => (
											<Badge
												key={e}
												variant="muted"
												className="font-mono normal-case tracking-normal"
											>
												{e}
											</Badge>
										))}
									</p>
								)}
							</div>
							<StatusBadge
								machine={CONTROL_STATUS}
								status={b.status}
								label={ts(CONTROL_STATUS.labelKey[b.status] as "notStarted")}
								className="shrink-0"
							/>
						</li>
					);
				})}
			</ul>

			<div className="mt-10 grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("providers")}</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-2 text-sm">
							{BASELINE.providers.map((p) => (
								<li key={p.name}>
									<span className="font-medium">{p.name}</span>
									<span className="text-muted-foreground">
										{" "}
										· {p.serviceDescription} · {p.country} · {p.criticality}
									</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("assets")}</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-2 text-sm">
							{BASELINE.assets.map((a) => (
								<li key={a.name}>
									<span className="font-medium">{a.name}</span>
									<span className="text-muted-foreground">
										{" "}
										· {a.description} · {a.classification}
									</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			</div>
			<p className="mt-6 text-muted-foreground text-xs">{tc("lead")}</p>
		</>
	);
}
