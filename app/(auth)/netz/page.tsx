import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { normalizeIp } from "@/lib/net/ip";

export const metadata: Metadata = { robots: { index: false } };

// Anfrage aus einem Netz, das nicht freigegeben ist (Härtung A2/A5):
// Plattform-Verwaltung nur aus dem Admin-Netz, Organisationen mit IP-Liste
// nur aus ihren Netzen. Die Seite zeigt die eigene Adresse, damit die
// Inhaber:in sie eintragen kann.
export default async function NetworkDeniedPage({
	searchParams,
}: {
	searchParams: Promise<{ bereich?: string }>;
}) {
	const t = await getTranslations("NetworkDenied");
	const { bereich } = await searchParams;
	const admin = bereich === "admin";
	// Portale (Lieferant, Trust Center, Richtlinien) haben keine Anmeldung
	const portal = bereich === "portal";
	const ip = normalizeIp(ipFromHeaders(await headers()));
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-1">{t("title")}</h1>
				<p className="text-body text-muted-foreground">
					{admin ? t("admin") : portal ? t("portal") : t("org")}
				</p>
			</div>
			<div className="rounded-2xl bg-card p-4">
				<p className="text-footnote text-muted-foreground">{t("yourIp")}</p>
				<p className="font-mono text-body" translate="no">
					{ip ?? t("unknown")}
				</p>
			</div>
			<p className="text-subhead text-muted-foreground">
				{admin ? t("adminHint") : portal ? t("portalHint") : t("orgHint")}
			</p>
			{!portal && (
				<Button asChild variant="secondary">
					<Link href="/login">{t("back")}</Link>
				</Button>
			)}
		</div>
	);
}
