import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountabilityView } from "@/components/accountability/accountability-view";
import { PrintButton } from "@/components/organisation/print-button";
import { PageHeader } from "@/components/page-header";
import { normalizeRole, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers } from "@/lib/auth/org";
import { buildAccountabilitySections } from "@/lib/compliance/accountability";
import { accountabilityFor } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";

// Rechenschaftssicht eines Teammitglieds (für Owner) — ohne persönliche
// Freigaben/Kenntnisnahmen, die nur die Person selbst sieht.
export default async function MemberAccountabilityPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const { userId } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
	const ctx = await requireOrg({ member: ["read"] });
	if (ctx.orgRole !== "owner" && ctx.userId !== userId) notFound();
	const t = await getTranslations("Accountability");
	const tt = await getTranslations("Team");
	const members = await listOrgMembers(ctx.orgId);
	const m = members.find((x) => x.userId === userId);
	if (!m) notFound();
	const today = new Date().toISOString().slice(0, 10);
	const acc = await readOrg(toOrgCtx(ctx), (tx) =>
		accountabilityFor(tx, ctx.orgId, userId, today),
	);
	const sections = buildAccountabilitySections(
		{ acc, approvals: [], acks: [] },
		today,
		{
			controls: t("controls"),
			overdueReviews: t("overdueReviews"),
			processes: t("processes"),
			documents: t("documents"),
			risks: t("risks"),
			tasks: t("tasks"),
			approvals: t("approvals"),
			acks: t("acks"),
			nonconformities: t("nonconformities"),
			obligations: t("obligations"),
			audits: t("audits"),
		},
	).filter((s) => s.key !== "approvals" && s.key !== "acks");
	const role = normalizeRole(m.role);
	return (
		<>
			<div className="print:hidden">
				<PageHeader
					eyebrow={`${tt(`role${role[0]?.toUpperCase()}${role.slice(1)}` as "roleOwner")} · ${m.email}`}
					title={m.name}
					lead={t("memberLead")}
					actions={
						<div className="flex gap-2">
							<Link
								href="/team"
								className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
							>
								← {tt("title")}
							</Link>
							<PrintButton label={t("print")} />
						</div>
					}
				/>
			</div>
			<h1 className="mb-4 hidden font-serif-display text-2xl print:block">
				{t("title")} — {m.name}
			</h1>
			<AccountabilityView
				sections={sections}
				labels={{ none: t("none"), overdue: t("overdue"), total: t("total") }}
			/>
		</>
	);
}
