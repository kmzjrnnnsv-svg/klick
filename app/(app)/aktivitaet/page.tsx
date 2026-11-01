import { getTranslations } from "next-intl/server";
import { ActivityStream } from "@/components/entity/activity-stream";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { listOrgMembers } from "@/lib/auth/org";
import { orgActivity } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { mergeActivity, toHistoryItems } from "@/lib/history";

// Org-weiter Feed: Statuswechsel, Freigaben, Kommentare, Nachweise.
export default async function ActivityPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Activity");
	const te = await getTranslations("Entity");
	const [{ audit, comments, names }, members] = await Promise.all([
		readOrg(toOrgCtx(ctx), (tx) => orgActivity(tx, ctx.orgId, 150)),
		listOrgMembers(ctx.orgId),
	]);
	const external = new Set(
		members.filter((m) => isExternal(m.role)).map((m) => m.userId),
	);
	const entries = mergeActivity(
		toHistoryItems(
			audit.map((a) => ({
				...a,
				action: a.target ? `${a.action} · ${a.target}` : a.action,
			})),
		),
		comments.map((c) => ({
			type: "comment" as const,
			at: c.createdAt,
			comment: {
				id: c.id,
				authorUserId: c.authorUserId,
				bodyMarkdown: c.bodyMarkdown,
				parentId: c.parentId,
				editedAt: c.editedAt,
			},
		})),
	);
	return (
		<>
			<SectionSwitch group="team" current="/aktivitaet" ctx={ctx} />

			<PageHeader title={t("title")} lead={t("lead")} />
			<div className="max-w-3xl">
				<ActivityStream
					entries={entries}
					names={names}
					external={external}
					labels={{
						empty: t("empty"),
						changed: te("changed"),
						commented: te("commented"),
						system: te("system"),
					}}
				/>
			</div>
		</>
	);
}
