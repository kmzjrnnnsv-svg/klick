import { getTranslations } from "next-intl/server";
import {
	EmergencyReportForm,
	RequestAccessDialog,
} from "@/components/admin/platform-access-admin";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import type { PlatformAccessGrant } from "@/db/schema/platform-access";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import {
	listOrganizationsWithCounts,
	listUserMemberships,
	listUsers,
} from "@/lib/db/global";
import { allGrants, userLabels } from "@/lib/db/platform-access";
import {
	type GrantState,
	grantState,
	reportOverdue,
} from "@/lib/platform-access/rules";

// Admin > Zugriffe (Lockbox, Härtung A3): alle Anträge der Plattform an die
// Orgs mit Stand; Inhalte der Orgs stehen hier nicht, nur die Anträge.
// Gruppierte Liste statt Tabelle, damit Begründung und Notfall-Bericht auch
// am Handy Platz haben.

const STATE_VARIANT: Record<GrantState, "success" | "warning" | "muted"> = {
	requested: "warning",
	waiting: "warning",
	active: "success",
	expired: "muted",
	denied: "muted",
	cancelled: "muted",
	revoked: "muted",
};

export default async function AdminAccessPage() {
	await requirePlatformAdminPage();
	const t = await getTranslations("AdminLockbox");
	const tp = await getTranslations("PlatformAccess");
	const [orgs, memberships, users, grants] = await Promise.all([
		listOrganizationsWithCounts(),
		listUserMemberships(),
		listUsers(1000),
		allGrants(200),
	]);
	const names = new Map(users.map((u) => [u.id, u.name || u.email]));
	const labels = await userLabels(grants.map((g) => g.targetUserId));
	const orgName = new Map(orgs.map((o) => [o.id, o.name]));
	const options = orgs.map((o) => ({
		id: o.id,
		name: o.name,
		members: memberships
			.filter((m) => m.orgId === o.id)
			.map((m) => ({ id: m.userId, name: names.get(m.userId) ?? m.userId })),
	}));
	const now = new Date();
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const rows = grants.map((g) => ({
		g,
		state: grantState(g, now),
		overdue: reportOverdue(g, now),
	}));
	const open = rows.filter(
		(r) => r.state === "requested" || r.state === "waiting",
	);
	const active = rows.filter((r) => r.state === "active");
	// Notfälle ohne Bericht stehen oben, auch wenn der Zugriff schon vorbei ist
	const reportDue = rows.filter(
		(r) => r.g.emergencyCategory && !r.g.reportedAt && r.state !== "active",
	);
	const past = rows.filter(
		(r) => !open.includes(r) && !active.includes(r) && !reportDue.includes(r),
	);

	const row = ({
		g,
		state,
		overdue,
	}: {
		g: PlatformAccessGrant;
		state: GrantState;
		overdue: boolean;
	}) => {
		const target = g.targetUserId ? labels.get(g.targetUserId) : null;
		const meta = [
			t("requestedAt", { when: fmt.format(g.requestedAt) }),
			g.expiresAt ? t("until", { when: fmt.format(g.expiresAt) }) : null,
			g.emergencyCategory ? tp(`emergency_${g.emergencyCategory}`) : null,
		].filter(Boolean);
		return (
			<ListRow key={g.id}>
				<div className="flex min-w-0 flex-col gap-2 py-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-body sm:text-subhead">
							{orgName.get(g.organizationId) ?? g.organizationId.slice(0, 8)}
						</span>
						<Badge variant={STATE_VARIANT[state]}>{tp(`state_${state}`)}</Badge>
						{g.emergencyCategory && (
							<Badge variant="destructive">{tp("emergency")}</Badge>
						)}
						{overdue && (
							<Badge variant="destructive">{tp("reportOverdue")}</Badge>
						)}
					</div>
					<p className="text-subhead">
						{target
							? tp("rowTitle", { scope: tp(`scope_${g.scope}`), name: target })
							: tp(`scope_${g.scope}`)}
					</p>
					<p className="break-words text-footnote text-muted-foreground">
						{g.reason}
					</p>
					<p className="text-footnote text-muted-foreground">
						{meta.join(" · ")}
					</p>
					{g.emergencyCategory && !g.reportedAt && (
						<EmergencyReportForm id={g.id} />
					)}
					{g.report && (
						<p className="whitespace-pre-line break-words rounded-xl bg-muted/50 p-3 text-footnote">
							<span className="font-medium">{t("report")}: </span>
							{g.report}
						</p>
					)}
				</div>
			</ListRow>
		);
	};

	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-bold text-title-1">{t("title")}</h1>
					<p className="max-w-2xl text-muted-foreground text-subhead">
						{t("lead")}
					</p>
				</div>
				<RequestAccessDialog orgs={options} />
			</div>
			<ListGroup className="max-w-3xl">
				{reportDue.length > 0 && (
					<ListSection title={t("reportDueTitle")}>
						{reportDue.map(row)}
					</ListSection>
				)}
				<ListSection title={t("activeTitle")}>
					{active.length === 0 && <ListRow subtitle={t("activeEmpty")} />}
					{active.map(row)}
				</ListSection>
				<ListSection title={t("openTitle")}>
					{open.length === 0 && <ListRow subtitle={t("empty")} />}
					{open.map(row)}
				</ListSection>
				{past.length > 0 && (
					<ListSection title={t("historyTitle")}>{past.map(row)}</ListSection>
				)}
			</ListGroup>
		</>
	);
}
