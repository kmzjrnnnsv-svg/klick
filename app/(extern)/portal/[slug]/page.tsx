import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PolicyList } from "@/components/policies/policy-list";
import {
	PortalSignIn,
	PortalSignOut,
} from "@/components/policy-portal/portal-client";
import { portalCookieName } from "@/lib/policy-portal/rules";
import {
	publicPortal,
	readerPolicies,
	readerSharedEvidence,
	resolvePortalReader,
} from "@/lib/policy-portal/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Richtlinien-Portal (M2): ohne Konto, Zugang per Einmal-Code an eine
// bestätigte Firmen-Domain. Gezeigt wird, was der Verteiler „alle“ oder
// „Mitarbeitende“ erreicht, dazu die freigegebenen Nachweise.
export default async function PortalPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const portal = await publicPortal(slug);
	if (!portal) notFound();
	const t = await getTranslations("PolicyPortal");
	const tp = await getTranslations("Policies");
	const reader = await resolvePortalReader(
		portal,
		(await cookies()).get(portalCookieName(slug))?.value,
	);
	if (!reader)
		return (
			<>
				<PageHeader
					title={t("publicTitle", { org: portal.orgName })}
					lead={t("publicLead")}
				/>
				<PortalSignIn slug={slug} org={portal.orgName} />
			</>
		);
	const [policies, shared] = await Promise.all([
		readerPolicies(portal, reader),
		readerSharedEvidence(portal),
	]);
	const open = policies.filter((p) => !p.acknowledgedAt).length;
	return (
		<>
			<PageHeader
				title={t("publicTitle", { org: portal.orgName })}
				lead={open > 0 ? tp("leadOpen", { count: open }) : tp("leadDone")}
			/>
			<div className="flex flex-col gap-6">
				<PolicyList
					policies={policies}
					shared={shared}
					detailBase={`/portal/${slug}`}
					evidenceBase={`/portal/${slug}/nachweis`}
				/>
				<PortalSignOut slug={slug} email={reader.email} />
			</div>
		</>
	);
}
