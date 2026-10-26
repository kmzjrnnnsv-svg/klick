import { SignOutButton } from "@wallet/components/auth/sign-out-button";
import { requireSessionPage } from "@wallet/lib/auth/gates";
import { listMemberships } from "@wallet/lib/orgs/memberships";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { normalizeIp } from "@/lib/net/ip";

export const metadata: Metadata = { title: "Kein Zugang" };

const REASONS = ["network", "security-key", "admin-network"] as const;
type Reason = (typeof REASONS)[number];
const reasonOf = (v: string | undefined): Reason =>
	REASONS.includes(v as Reason) ? (v as Reason) : "network";

// /blocked — Zugangsregeln der Org greifen (Härtung W): IP-Liste, nur
// Sicherheitsschlüssel oder Admin-Netz. Zeigt den Grund, die eigene Adresse
// und den Ausweg (andere Org, abmelden).
export default async function BlockedPage({
	searchParams,
}: {
	searchParams: Promise<{ reason?: string }>;
}) {
	const ctx = await requireSessionPage("/");
	const reason = reasonOf((await searchParams).reason);
	const t = await getTranslations("Blocked");
	const orgs = await listMemberships(ctx.user.id);
	const org =
		orgs.find((o) => o.orgId === ctx.session.activeOrgId)?.name ?? t("thisOrg");
	const ip = normalizeIp(ctx.ip);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-bold text-title-2">
					{reason === "security-key"
						? t("securityKeyTitle")
						: reason === "admin-network"
							? t("adminNetworkTitle")
							: t("networkTitle")}
				</h1>
				<p className="text-muted-foreground">
					{reason === "security-key"
						? t("securityKeyLead", { org })
						: reason === "admin-network"
							? t("adminNetworkLead")
							: t("networkLead", { org })}
				</p>
				{reason === "security-key" && (
					<p className="text-muted-foreground">{t("securityKeySteps")}</p>
				)}
			</div>
			{reason !== "security-key" && (
				<p className="text-subhead">
					{t("yourIp")}:{" "}
					<span className="font-mono" translate="no">
						{ip ?? t("unknownIp")}
					</span>
				</p>
			)}
			<div className="flex flex-wrap gap-3">
				{orgs.length > 1 && (
					<Link
						href="/orgs"
						className={buttonVariants({ variant: "secondary" })}
					>
						{t("otherOrg")}
					</Link>
				)}
				<SignOutButton />
			</div>
		</div>
	);
}
