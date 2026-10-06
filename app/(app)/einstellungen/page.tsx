import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SecurityPanel } from "@/components/settings/security-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSessionCtx, requireOrg } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

export default async function SettingsPage() {
	const ctx = await requireOrg();
	const sctx = await getSessionCtx();
	const t = await getTranslations("Settings");
	const h = await headers();
	const [sessions, passkeys] = await Promise.all([
		auth.api.listSessions({ headers: h }),
		auth.api.listPasskeys({ headers: h }).catch(() => []),
	]);
	const tabs = [
		{ v: "organisation", l: t("tabOrganisation") },
		{ v: "frameworks", l: t("tabFrameworks") },
		{ v: "workflows", l: t("tabWorkflows") },
		{ v: "risk", l: t("tabRiskScales") },
		{ v: "numbering", l: t("tabNumbering") },
		{ v: "notifications", l: t("tabNotifications") },
	];
	return (
		<>
			<PageHeader title={t("title")} />
			<Tabs defaultValue="security">
				<TabsList>
					<TabsTrigger value="security">{t("tabSecurity")}</TabsTrigger>
					{tabs.map((tab) => (
						<TabsTrigger key={tab.v} value={tab.v}>
							{tab.l}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="security">
					<SecurityPanel
						mfaEnabled={Boolean(sctx?.user.twoFactorEnabled)}
						sessions={sessions.map((s) => ({
							id: s.id,
							token: s.token,
							createdAt: s.createdAt,
							ipAddress: s.ipAddress ?? null,
							userAgent: s.userAgent ?? null,
							current: s.id === ctx.sessionId,
						}))}
						passkeys={passkeys.map((p) => ({
							id: p.id,
							name: p.name ?? null,
							createdAt: p.createdAt ?? null,
							deviceType: p.deviceType,
						}))}
					/>
				</TabsContent>
				{tabs.map((tab) => (
					<TabsContent key={tab.v} value={tab.v}>
						<p className="text-muted-foreground text-sm">{t("comingSoon")}</p>
					</TabsContent>
				))}
			</Tabs>
		</>
	);
}
