import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { WorkflowEditor } from "@/components/settings/workflows/workflow-editor";
import { BackLink } from "@/components/ui/back-link";
import { approvalWorkflows, orgSettings } from "@/db/schema";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { APPROVER_BASE_ROLES } from "@/lib/approvals/designer";
import {
	factInfos,
	ruleNames,
	triggerTexts,
} from "@/lib/approvals/designer-labels";
import { ensureOrgWorkflows, loadCandidates } from "@/lib/approvals/service";
import { TRIGGER_BY_KEY, triggerOf } from "@/lib/approvals/triggers";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { ROLE_LABEL } from "@/lib/auth/memberships";
import { listOrgMembers } from "@/lib/auth/org";
import { flushQueuedAudits, withOrg } from "@/lib/db/with-org";
import { listOrgRoles } from "@/lib/org/roles";

// Freigabe-Designer: Ablauf bearbeiten bzw. neue Variante (?ausloeser=…).
// Nur Inhaber:innen; Speichern mit Step-up (app/actions/workflows.ts).
export default async function WorkflowEditorPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ ausloeser?: string }>;
}) {
	const { id } = await params;
	const { ausloeser } = await searchParams;
	const isNew = id === "neu";
	if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ settings: ["update"] });
	const octx = toOrgCtx(ctx);
	const data = await withOrg(octx, async (tx) => {
		const [s] = await tx
			.select({ stage: orgSettings.licenceStage })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		await ensureOrgWorkflows(tx, ctx.orgId, s?.stage ?? "0_vorbereitung");
		await flushQueuedAudits(tx, octx);
		const rows = await tx
			.select()
			.from(approvalWorkflows)
			.where(eq(approvalWorkflows.organizationId, ctx.orgId));
		const row = isNew ? null : rows.find((r) => r.id === id);
		if (!isNew && !row) return null;
		const trigger = row ? triggerOf(row) : (ausloeser ?? null);
		const def = trigger ? TRIGGER_BY_KEY.get(trigger) : undefined;
		if (!trigger || !def?.wired) return null;
		// neue Variante startet mit den Stufen des Standard-Ablaufs
		const standard = rows.find((r) => !r.custom && triggerOf(r) === trigger);
		const [roles, candidates] = await Promise.all([
			listOrgRoles(tx, ctx.orgId),
			loadCandidates(tx, ctx.orgId),
		]);
		return { row, def, standard, roles, candidates };
	});
	if (!data) notFound();
	const { row, def, standard, roles, candidates } = data;
	const members = await listOrgMembers(ctx.orgId);
	const nameOf = new Map(members.map((m) => [m.userId, m.name || m.email]));
	const [t, tf, texts, facts, names] = await Promise.all([
		getTranslations("Workflows"),
		getTranslations("Functions"),
		triggerTexts(),
		factInfos(),
		ruleNames({ roles, users: nameOf }),
	]);
	const deciders = new Set(
		candidates.filter((c) => c.canDecide).map((c) => c.userId),
	);
	const text = texts[def.key];
	const initial = row ?? null;
	return (
		<>
			<BackLink href="/einstellungen?tab=workflows" label={t("back")} />
			<PageHeader
				eyebrow={`${t("trigger")}: ${text?.label ?? def.key}`}
				title={initial ? initial.name : t("newTitle")}
				lead={text?.hint}
			/>
			<WorkflowEditor
				trigger={{ key: def.key, mode: def.mode }}
				facts={facts[def.key] ?? []}
				names={names}
				initial={{
					id: initial?.id,
					custom: initial ? initial.custom : true,
					name: initial?.name ?? `${text?.label ?? def.key} – ${t("variant")}`,
					description: initial?.description ?? "",
					enabled: initial?.enabled ?? false,
					priority: initial?.priority ?? 10,
					conditions: initial?.conditions ?? [],
					steps: initial?.steps ?? standard?.steps ?? [],
				}}
				options={{
					roles: roles.map((r) => ({ value: `role:${r.id}`, label: r.name })),
					base: APPROVER_BASE_ROLES.map((r) => ({
						value: `role:${r}`,
						label: ROLE_LABEL[r],
					})),
					skipBase: (["viewer", "auditor", "consultant"] as const).map((r) => ({
						value: `role:${r}`,
						label: ROLE_LABEL[r],
					})),
					functions: ROLE_FUNCTIONS.map((f) => ({
						value: `function:${f}`,
						label: tf(f),
					})),
					users: members
						.filter((m) => deciders.has(m.userId))
						.map((m) => ({
							value: `user:${m.userId}`,
							label: m.name || m.email,
						})),
					allUsers: members.map((m) => ({
						value: `user:${m.userId}`,
						label: m.name || m.email,
					})),
				}}
				people={members.map((m) => ({
					userId: m.userId,
					name: m.name || m.email,
				}))}
				requesterDefault={ctx.userId}
			/>
		</>
	);
}
