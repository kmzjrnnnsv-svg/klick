import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { FrameworksPanel } from "@/components/settings/frameworks-panel";
import { NumberingPanel } from "@/components/settings/numbering-panel";
import { RiskSettingsPanel } from "@/components/settings/risk-settings-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { StagePanel } from "@/components/settings/stage-panel";
import { WorkflowsPanel } from "@/components/settings/workflows-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { approvalWorkflows } from "@/db/schema";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import { getSessionCtx, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/server";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import {
	DEFAULT_RISK_APPETITE,
	DEFAULT_RISK_SCALES,
} from "@/lib/compliance/risk";
import { readOrg, withOrg } from "@/lib/db/with-org";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";

export default async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab } = await searchParams;
	const ctx = await requireOrg();
	const cov = await getOrgCoverageCached(ctx);
	// Workflows je Org sicherstellen (Seed) und laden.
	const { settings, workflows } = await withOrg(toOrgCtx(ctx), async (tx) => {
		const settings = await getOrgSettings(tx, ctx.orgId);
		await ensureOrgWorkflows(
			tx,
			ctx.orgId,
			settings?.licenceStage ?? "0_vorbereitung",
		);
		const rows = await tx
			.select()
			.from(approvalWorkflows)
			.where(eq(approvalWorkflows.organizationId, ctx.orgId));
		const workflows = APPROVAL_WORKFLOW_TEMPLATES.map((tpl) => {
			const row = rows.find((r) => r.kind === tpl.kind);
			return {
				kind: tpl.kind,
				name: tpl.name,
				description: tpl.description,
				steps: row?.steps ?? tpl.steps,
				enabled: row?.enabled ?? tpl.defaultEnabled,
			};
		});
		return { settings, workflows };
	});
	const orgFws = await readOrg(toOrgCtx(ctx), async (tx) => {
		const rows = await listOrgFrameworks(tx, ctx.orgId);
		const names = await userNames(
			tx,
			rows.map((r) => r.ownerUserId),
		);
		return rows.map((r) => ({
			...r,
			ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		}));
	});
	const activeSlugs = new Set(orgFws.map((f) => f.slug));
	const toItem = (slug: string) => {
		const meta = CATALOG_FRAMEWORKS.find((f) => f.slug === slug);
		return {
			slug,
			name: meta?.name ?? slug,
			description: meta?.description ?? null,
			hasIndex: (meta?.requirements.length ?? 0) > 0,
			coveragePct: cov?.result.byFramework.get(slug)?.coveragePct ?? null,
		};
	};
	const activeItems = orgFws.map((f) => ({
		...toItem(f.slug),
		ownerName: f.ownerName,
	}));
	const availableItems = CATALOG_FRAMEWORKS.filter(
		(f) => !activeSlugs.has(f.slug),
	).map((f) => toItem(f.slug));
	const canEditSettings = roleAllows(ctx.orgRole, { settings: ["update"] });
	const sctx = await getSessionCtx();
	const t = await getTranslations("Settings");
	const h = await headers();
	const [sessions, passkeys] = await Promise.all([
		auth.api.listSessions({ headers: h }),
		auth.api.listPasskeys({ headers: h }).catch(() => []),
	]);
	const tabs = [
		{ v: "organisation", l: t("tabOrganisation") },
		{ v: "notifications", l: t("tabNotifications") },
	];
	return (
		<>
			<PageHeader title={t("title")} />
			<Tabs
				defaultValue={
					tab && ["frameworks", "workflows", "risk", "numbering"].includes(tab)
						? tab
						: "security"
				}
			>
				<TabsList>
					<TabsTrigger value="security">{t("tabSecurity")}</TabsTrigger>
					<TabsTrigger value="frameworks">{t("tabFrameworks")}</TabsTrigger>
					<TabsTrigger value="workflows">{t("tabWorkflows")}</TabsTrigger>
					<TabsTrigger value="risk">{t("tabRiskScales")}</TabsTrigger>
					<TabsTrigger value="numbering">{t("tabNumbering")}</TabsTrigger>
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
				<TabsContent value="frameworks" className="flex flex-col gap-6">
					{cov && (
						<StagePanel
							licenceStage={cov.profile.licenceStage}
							caspServices={[...cov.profile.caspServices]}
							tlptDesignated={cov.profile.tlptDesignated}
							tlptConfirmedAt={settings?.setupFlags?.tlptConfirmedAt ?? null}
							canEdit={canEditSettings}
						/>
					)}
					{cov && (
						<FrameworksPanel
							active={activeItems}
							available={availableItems}
							profile={{
								sector: cov.profile.sector,
								licenceStage: cov.profile.licenceStage,
								caspServices: [...cov.profile.caspServices],
								tlptDesignated: cov.profile.tlptDesignated,
								nis2Status: cov.profile.nis2Status,
							}}
							canEdit={canEditSettings}
						/>
					)}
				</TabsContent>
				<TabsContent value="workflows">
					<WorkflowsPanel workflows={workflows} canEdit={canEditSettings} />
				</TabsContent>
				<TabsContent value="risk">
					<RiskSettingsPanel
						likelihood={
							(settings?.riskScales ?? DEFAULT_RISK_SCALES).likelihood
						}
						impact={(settings?.riskScales ?? DEFAULT_RISK_SCALES).impact}
						acceptable={
							(settings?.riskAppetite ?? DEFAULT_RISK_APPETITE).acceptable
						}
						tolerable={
							(settings?.riskAppetite ?? DEFAULT_RISK_APPETITE).tolerable
						}
						allowSelfApproval={settings?.allowSelfApproval ?? true}
						canEdit={canEditSettings}
					/>
				</TabsContent>
				<TabsContent value="numbering">
					<NumberingPanel
						numbering={settings?.documentNumbering ?? {}}
						canEdit={canEditSettings}
					/>
				</TabsContent>
				{tabs.map((tab) => (
					<TabsContent key={tab.v} value={tab.v}>
						<p className="text-muted-foreground text-sm">
							{tab.v === "notifications"
								? t("notificationsLead")
								: t("comingSoon")}
						</p>
					</TabsContent>
				))}
			</Tabs>
		</>
	);
}
