import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PolicyBody } from "@/components/policies/policy-list";
import { PortalAckButton } from "@/components/policy-portal/portal-client";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/compliance/page-data";
import { portalCookieName } from "@/lib/policy-portal/rules";
import {
	publicPortal,
	readerPolicies,
	resolvePortalReader,
} from "@/lib/policy-portal/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Eine Richtlinie im Portal: gültige Fassung, Datei, Kenntnisnahme.
export default async function PortalPolicyPage({
	params,
}: {
	params: Promise<{ slug: string; docNumber: string }>;
}) {
	const { slug, docNumber: raw } = await params;
	const docNumber = decodeURIComponent(raw);
	const portal = await publicPortal(slug);
	if (!portal) notFound();
	const reader = await resolvePortalReader(
		portal,
		(await cookies()).get(portalCookieName(slug))?.value,
	);
	if (!reader) redirect(`/portal/${slug}`);
	const policy = (await readerPolicies(portal, reader)).find(
		(p) => p.docNumber === docNumber,
	);
	if (!policy) notFound();
	const t = await getTranslations("Policies");
	const tp = await getTranslations("PolicyPortal");
	return (
		<>
			<BackLink
				href={`/portal/${slug}`}
				label={tp("publicTitle", { org: portal.orgName })}
			/>
			<PageHeader
				eyebrow={t("meta", {
					number: policy.docNumber,
					version: policy.version,
					date: fmtDate.format(policy.publishedAt),
				})}
				title={policy.title}
				actions={
					policy.acknowledgedAt ? (
						<Badge variant="success">
							{t("ackDone", { date: fmtDate.format(policy.acknowledgedAt) })}
						</Badge>
					) : (
						<PortalAckButton slug={slug} versionId={policy.versionId} />
					)
				}
			/>
			<PolicyBody
				policy={policy}
				fileHref={`/portal/${slug}/datei/${policy.versionId}`}
			/>
		</>
	);
}
