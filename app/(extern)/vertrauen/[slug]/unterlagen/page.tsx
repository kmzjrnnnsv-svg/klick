import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TrustAccessGate } from "@/components/trust-center/access-gate";
import { publicTrustCenter } from "@/lib/db/trust";

// /vertrauen/<slug>/unterlagen — vertrauliche Unterlagen nach Freigabe. Der
// Token kommt im Fragment (#klk_trust_…) und wird im Browser gegen ein
// Cookie getauscht; die Seite selbst zeigt nur die Titel aus dem Snapshot.

export const metadata: Metadata = {
	title: "Unterlagen · Trust Center",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default async function TrustDocumentsPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const center = await publicTrustCenter(slug);
	if (!center) notFound();
	const s = center.snapshot;
	const t = await getTranslations("TrustCenter");
	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs uppercase tracking-wider">
					{t("publicEyebrow", { org: s.orgName })}
				</p>
				<h1 className="text-balance font-serif-display text-3xl text-primary leading-tight">
					{t("gateTitle")}
				</h1>
				<p className="max-w-2xl text-muted-foreground text-sm">
					{t("gateIntro", { org: s.orgName })}
				</p>
			</header>
			<TrustAccessGate
				slug={center.slug}
				docs={s.documents
					.filter((d) => d.access === "nda")
					.map((d) => ({
						versionId: d.versionId,
						docNumber: d.docNumber,
						title: d.title,
						version: d.version,
					}))}
			/>
		</div>
	);
}
