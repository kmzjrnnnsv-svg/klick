import { getTranslations } from "next-intl/server";
import { ActivityStream } from "@/components/entity/activity-stream";
import { PageHeader } from "@/components/page-header";
import { ENTITY_KINDS, type EntityKind } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { orgActivity } from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { entityHref, resolveEntityTitles } from "@/lib/entities/links";
import { mergeActivity, toHistoryItems } from "@/lib/history";

const KINDS: ReadonlySet<string> = new Set(ENTITY_KINDS);
// Audit-Ziel „<art>:<uuid>“ → Entität (andere Ziele, z. B. member:…, bleiben ohne Link).
function parseTarget(
	target: string | null,
): { entityType: EntityKind; entityId: string } | null {
	const m = target?.match(/^([a-z_]+):([0-9a-f-]{36})$/i);
	return m?.[1] && m[2] && KINDS.has(m[1])
		? { entityType: m[1] as EntityKind, entityId: m[2] }
		: null;
}

// Org-weiter Feed: Statuswechsel, Freigaben, Kommentare, Nachweise.
export default async function ActivityPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Activity");
	const te = await getTranslations("Entity");
	const { audit, comments, names, titles } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const a = await orgActivity(tx, ctx.orgId, 150);
			const refs = [
				...a.audit.map((x) => parseTarget(x.target)),
				...a.comments.map((c) => ({
					entityType: c.entityType,
					entityId: c.entityId,
				})),
			].filter((r): r is NonNullable<typeof r> => r !== null);
			return {
				...a,
				titles: await resolveEntityTitles(tx, ctx.orgId, refs),
			};
		},
	);
	const links = new Map<string, { href: string; label: string }>();
	const link = (
		key: string,
		ref: { entityType: EntityKind; entityId: string } | null,
	) => {
		if (!ref) return;
		const title = titles.get(`${ref.entityType}:${ref.entityId}`);
		if (!title) return; // gelöscht oder ohne Titel: kein toter Link
		links.set(key, {
			href: entityHref(ref.entityType, ref.entityId, title),
			label: title,
		});
	};
	for (const a of audit) link(`h-${a.id}`, parseTarget(a.target));
	for (const c of comments)
		link(`c-${c.id}`, { entityType: c.entityType, entityId: c.entityId });
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
			<PageHeader title={t("title")} lead={t("lead")} />
			<div className="max-w-3xl">
				<ActivityStream
					entries={entries}
					names={names}
					links={links}
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
