import { getTranslations } from "next-intl/server";
import {
	AnnouncementDialog,
	WithdrawAnnouncementButton,
} from "@/components/admin/announcement-dialog";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListRow, ListSection } from "@/components/ui/list";
import {
	ANNOUNCEMENT_TEMPLATES,
	type AnnouncementState,
	announcementState,
	needsAcknowledgement,
} from "@/lib/announcements/rules";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import {
	acknowledgementCounts,
	listAnnouncements,
} from "@/lib/db/announcements";
import { listOrganizationsWithCounts } from "@/lib/db/global";
import { withPlatform } from "@/lib/db/with-org";

const STATE_BADGE: Record<
	AnnouncementState,
	"success" | "secondary" | "muted" | "warning"
> = {
	active: "success",
	scheduled: "secondary",
	ended: "muted",
	withdrawn: "muted",
};

// Admin > Mitteilungen (Admin-Portal, Teil 6): Hinweise an alle oder
// ausgewählte Organisationen. Ein Sicherheitsvorfall geht sofort per Mail
// an Inhaber:innen und Geschäftsleitung, jede Org nimmt ihn zur Kenntnis.
async function AdminAnnouncementsPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("AdminAnnouncements");
	const ta = await getTranslations("Admin");
	const now = new Date();
	const [list, orgs] = await Promise.all([
		listAnnouncements(),
		listOrganizationsWithCounts(),
	]);
	const acks = await withPlatform(
		{
			userId: admin.userId,
			ip: admin.ip,
			userAgent: admin.userAgent,
			reason: "Admin: Mitteilungen (Kenntnisnahmen, nur Zähler)",
		},
		(tx) =>
			acknowledgementCounts(
				tx,
				list.filter((a) => needsAcknowledgement(a.kind)).map((a) => a.id),
			),
	);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const templates = (
		Object.entries(ANNOUNCEMENT_TEMPLATES) as [
			keyof typeof ANNOUNCEMENT_TEMPLATES,
			(typeof ANNOUNCEMENT_TEMPLATES)[keyof typeof ANNOUNCEMENT_TEMPLATES],
		][]
	).map(([key, v]) => ({ key, ...v }));

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader
				title={ta("announcements")}
				lead={t("lead")}
				actions={
					<AnnouncementDialog
						orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
						templates={templates}
					/>
				}
			/>
			<ListSection>
				{list.length === 0 ? (
					<ListRow title={t("listEmpty")} />
				) : (
					list.map((a) => {
						const state = announcementState(a, now);
						const target = a.orgIds === null ? orgs.length : a.orgIds.length;
						return (
							<ListRow
								key={a.id}
								title={a.title}
								subtitle={
									<>
										{[
											t(`kind_${a.kind}`),
											a.endsAt
												? t("window", {
														start: fmt.format(a.startsAt),
														end: fmt.format(a.endsAt),
													})
												: t("windowOpen", { start: fmt.format(a.startsAt) }),
											a.orgIds === null
												? t("forAll")
												: t("forSome", { n: a.orgIds.length }),
										].join(" · ")}
										{needsAcknowledgement(a.kind) && (
											<span className="block tabular-nums">
												{t("acks", { n: acks.get(a.id) ?? 0, of: target })}
											</span>
										)}
									</>
								}
								accessory={
									<span className="flex items-center gap-2">
										<Badge
											variant={
												a.kind === "incident" && state === "active"
													? "warning"
													: STATE_BADGE[state]
											}
										>
											{t(`state_${state}`)}
										</Badge>
										{(state === "active" || state === "scheduled") && (
											<WithdrawAnnouncementButton id={a.id} />
										)}
									</span>
								}
							/>
						);
					})
				)}
			</ListSection>
		</div>
	);
}

export default withMessages(AdminAnnouncementsPage, [
	"AdminAnnouncements",
	"Auth",
	"Common",
]);
