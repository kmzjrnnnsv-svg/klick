import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListRow, ListSection } from "@/components/ui/list";
import { buildOverview, type Level, type Tile } from "@/lib/admin/overview";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { loadOverviewInput } from "@/lib/db/admin";

const BADGE: Record<
	Level,
	"success" | "warning" | "destructive" | "secondary"
> = {
	ok: "success",
	warn: "warning",
	bad: "destructive",
	unknown: "secondary",
};

// Übersicht des Plattform-Admins: zuerst, was dich braucht (Drill-down zur
// Stelle, wo du handelst), darunter der Zustand der Plattform mit Ampel.
// Nur Plattform-Metadaten, keine Inhalte einer Organisation (Lockbox).
export default async function AdminHome() {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const now = new Date();
	const { todos, tiles } = buildOverview(await loadOverviewInput(now));
	const num = new Intl.NumberFormat("de-DE");
	const when = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});

	const levelLabel = (l: Level) =>
		l === "ok"
			? t("stateOk")
			: l === "warn"
				? t("stateWarn")
				: l === "bad"
					? t("stateBad")
					: t("stateUnknown");

	const tileTitle = (tile: Tile) => {
		switch (tile.key) {
			case "orgs":
				return t("tileOrgs");
			case "users":
				return t("tileUsers");
			case "jobs":
				return t("tileJobs");
			case "anchor":
				return t("tileAnchor");
			case "risks":
				return t("tileRisks");
			case "access":
				return t("tileAccess");
		}
	};
	const tileValue = (tile: Tile) => {
		switch (tile.key) {
			case "orgs":
			case "users":
				return num.format(tile.n);
			case "jobs":
				return tile.failed === null
					? t("jobsUnknown")
					: tile.failed === 0
						? t("jobsOk")
						: t("jobsFailed", { n: tile.failed });
			case "anchor":
				if (tile.state === "none" || !tile.at) return t("anchorNone");
				return tile.state === "confirmed"
					? t("anchorConfirmed", { when: when.format(tile.at) })
					: tile.state === "pending"
						? t("anchorPending", { when: when.format(tile.at) })
						: t("anchorStale", { when: when.format(tile.at) });
			case "risks":
				return tile.risks.length === 0
					? t("risksNone")
					: t("risksSome", {
							n: tile.risks.length,
							list: tile.risks.join(", "),
						});
			case "access":
				return t("accessActive", { n: tile.active });
		}
	};
	const todoText = (key: (typeof todos)[number]["key"], n: number) => {
		switch (key) {
			case "inquiries":
				return t("todoInquiries", { n });
			case "reports":
				return t("todoReports", { n });
			case "requests":
				return t("todoRequests", { n });
			case "jobs":
				return t("todoJobs", { n });
			case "anchor":
				return t("todoAnchor");
			case "risks":
				return t("todoRisks");
		}
	};

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader title={t("title")} lead={t("lead")} />
			<ListSection title={t("needsYou")}>
				{todos.length === 0 ? (
					<ListRow title={t("needsYouEmpty")} />
				) : (
					todos.map((todo) => (
						<ListRow
							key={todo.key}
							href={todo.href}
							title={todoText(todo.key, todo.n)}
							accessory={
								<Badge variant={BADGE[todo.level]}>
									{levelLabel(todo.level)}
								</Badge>
							}
						/>
					))
				)}
			</ListSection>
			<ListSection title={t("state")}>
				{tiles.map((tile) =>
					tile.key === "orgs" || tile.key === "users" ? (
						// Zähler ohne Ampel: Anzahl rechts in Grau
						<ListRow
							key={tile.key}
							href={tile.href}
							title={tileTitle(tile)}
							value={tileValue(tile)}
						/>
					) : (
						<ListRow
							key={tile.key}
							href={tile.href}
							title={tileTitle(tile)}
							subtitle={tileValue(tile)}
							accessory={
								<Badge variant={BADGE[tile.level]}>
									{levelLabel(tile.level)}
								</Badge>
							}
						/>
					),
				)}
			</ListSection>
		</div>
	);
}
