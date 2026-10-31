import { and, eq } from "drizzle-orm";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { ssoProbes } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleLabel } from "@/lib/auth/memberships";
import type { ProbeResult } from "@/lib/auth/sso-probe";
import { probeErrorKey } from "@/lib/auth/sso-probe-errors";
import { readOrg } from "@/lib/db/with-org";

// Probe-Anmeldung (AP10b): was vom Anbieter ankam, ohne Konto und ohne
// Sitzung. Nur Inhaber:innen der Org, Ergebnis aus sso_probes.
export default async function SsoProbePage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ settings: ["update"] });
	if (ctx.orgRole !== "owner") notFound();
	const [probe] = await readOrg(toOrgCtx(ctx), (tx) =>
		tx
			.select()
			.from(ssoProbes)
			.where(and(eq(ssoProbes.organizationId, ctx.orgId), eq(ssoProbes.id, id)))
			.limit(1),
	);
	if (!probe) notFound();
	const sp = await searchParams;
	const t = await getTranslations("SsoProbe");
	const format = await getFormatter();
	const result = probe.result as
		| (Partial<ProbeResult> & { ok: boolean; error: string | null })
		| null;
	const errorKey =
		result && !result.ok && result.error
			? probeErrorKey(
					result.error === "domain" ? "SSO_DOMAIN_MISMATCH" : result.error,
					null,
				)
			: probeErrorKey(sp.error, sp.error_description);
	const ok = Boolean(result?.ok) && !errorKey;
	const expired = !result && !errorKey && probe.expiresAt < new Date();
	const yes = t("yes");
	const no = t("no");
	const back = { href: "/einstellungen?tab=sso", label: t("back") };

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader title={t("title")} back={back} />
			<section
				role="status"
				className="flex items-start gap-3 rounded-2xl bg-card p-4"
			>
				{ok ? (
					<CircleCheck
						className="mt-0.5 size-5 shrink-0 text-success"
						aria-hidden="true"
					/>
				) : (
					<CircleAlert
						className="mt-0.5 size-5 shrink-0 text-warning"
						aria-hidden="true"
					/>
				)}
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-headline">
						{ok
							? t("okTitle")
							: errorKey
								? t("failTitle")
								: expired
									? t("expiredTitle")
									: t("pendingTitle")}
					</h2>
					<p className="text-muted-foreground text-subhead">
						{ok
							? t("okLead")
							: errorKey
								? t(`err_${errorKey}`)
								: expired
									? t("expiredLead")
									: t("pendingLead")}
					</p>
					<p className="text-footnote text-muted-foreground">
						{t("nothingCreated")}
					</p>
				</div>
			</section>

			{result && "email" in result && (
				<ListGroup>
					<ListSection title={t("arrived")}>
						<ListRow title={t("email")} value={result.email ?? "–"} />
						<ListRow title={t("name")} value={result.name ?? "–"} />
						<ListRow title={t("nameId")} value={result.nameId ?? "–"} />
						<ListRow
							title={t("groups")}
							value={
								result.groups && result.groups.length > 0
									? t("groupsCount", { count: result.groups.length })
									: t("groupsNone")
							}
						/>
						<ListRow title={t("mfa")} value={result.mfa ? yes : no} />
					</ListSection>
					<ListSection title={t("inKlick")} footer={t("inKlickHint")}>
						<ListRow title={t("domainOk")} value={result.domainOk ? yes : no} />
						<ListRow
							title={t("account")}
							value={t(`account_${result.account ?? "new"}`, {
								role: result.memberRole ? roleLabel(result.memberRole) : "",
							})}
						/>
						<ListRow
							title={t("role")}
							value={
								result.role ? t(`role_${result.role}` as "role_viewer") : "–"
							}
						/>
					</ListSection>
					{result.groups && result.groups.length > 0 && (
						<ListSection title={t("groups")}>
							{result.groups.map((g) => (
								<ListRow key={g} title={<span translate="no">{g}</span>} />
							))}
						</ListSection>
					)}
					{result.attributeNames && result.attributeNames.length > 0 && (
						<ListSection title={t("attributes")} footer={t("attributesHint")}>
							{result.attributeNames.map((a) => (
								<ListRow
									key={a}
									title={
										<span
											className="break-all font-mono text-footnote"
											translate="no"
										>
											{a}
										</span>
									}
								/>
							))}
						</ListSection>
					)}
				</ListGroup>
			)}

			<p className="text-footnote text-muted-foreground">
				{t("startedAt", {
					date: format.dateTime(probe.createdAt, {
						dateStyle: "medium",
						timeStyle: "short",
					}),
				})}{" "}
				<Link
					href={back.href}
					className="text-primary underline-offset-2 hover:underline"
				>
					{ok ? t("next") : t("retry")}
				</Link>
			</p>
		</div>
	);
}
