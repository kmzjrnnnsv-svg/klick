import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DlpPanel } from "@/components/settings/dlp-panel";
import { EntityProfilePanel } from "@/components/settings/entity-profile-panel";
import { FrameworksPanel } from "@/components/settings/frameworks-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { NumberingPanel } from "@/components/settings/numbering-panel";
import { RiskMethodPanel } from "@/components/settings/risk-method-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { SsoPanel } from "@/components/settings/sso-panel";
import { StagePanel } from "@/components/settings/stage-panel";
import { SubscriptionPanel } from "@/components/settings/subscription-panel";
import { WorkflowsPanel } from "@/components/settings/workflows-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { approvalWorkflows } from "@/db/schema";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import { requireOrgPage } from "@/lib/auth/gates";
import { getSessionCtx, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary, listSsoProvidersForOrg } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/server";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import { APPROVAL_WORKFLOW_TEMPLATES } from "@/lib/compliance/catalog/approval-workflows";
import { CATALOG_EDGES, CATALOG_REQ_REFS } from "@/lib/compliance/catalog-view";
import { frameworkRemovalImpact } from "@/lib/compliance/framework-removal";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { listRisks } from "@/lib/compliance/queries-p2";
import { listProductOptions } from "@/lib/compliance/queries-products";
import { listAccessTokens } from "@/lib/compliance/queries-security";
import {
	defaultRiskMethod,
	resolveRiskMethod,
} from "@/lib/compliance/risk-method";
import { loadPriceTable } from "@/lib/db/pricing";
import { readOrg, withOrg } from "@/lib/db/with-org";
import { withDlpDefaults } from "@/lib/dlp/policy";
import {
	getOrgSettings,
	listOpenAuditScopes,
	listOrgFrameworks,
	listRetiredFrameworkSlugs,
} from "@/lib/org/queries";

export default async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab } = await searchParams;
	const ctx = await requireOrgPage();
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
	const canReadIntegrations = roleAllows(ctx.orgRole, {
		integration: ["read"],
	});
	const { tokens, productOptions } = canReadIntegrations
		? await readOrg(toOrgCtx(ctx), async (tx) => ({
				tokens: await listAccessTokens(tx, ctx.orgId),
				productOptions: await listProductOptions(tx, ctx.orgId),
			}))
		: { tokens: [], productOptions: [] };
	const { orgFws, retiredSlugs, openAudits, riskPoints } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const rows = await listOrgFrameworks(tx, ctx.orgId);
			const names = await userNames(
				tx,
				rows.map((r) => r.ownerUserId),
			);
			return {
				orgFws: rows.map((r) => ({
					...r,
					ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				})),
				retiredSlugs: new Set(await listRetiredFrameworkSlugs(tx, ctx.orgId)),
				openAudits: await listOpenAuditScopes(tx, ctx.orgId),
				riskPoints: (await listRisks(tx, ctx.orgId)).map((r) => ({
					likelihood: r.likelihood,
					impact: r.impact,
					residualLikelihood: r.residualLikelihood,
					residualImpact: r.residualImpact,
				})),
			};
		},
	);
	const activeSlugs = new Set(orgFws.map((f) => f.slug));
	const applicability = new Map(
		[...(cov?.applicabilityDetail ?? [])].map(([k, d]) => [k, d.applicable]),
	);
	const removalFor = (slug: string) =>
		cov
			? frameworkRemovalImpact({
					slug,
					activeSlugs: cov.frameworks,
					licenceStage: cov.profile.licenceStage,
					tlptDesignated: cov.profile.tlptDesignated,
					requirements: CATALOG_REQ_REFS,
					edges: CATALOG_EDGES,
					applicability,
					implStatus: cov.implStatus,
					openAudits,
				})
			: undefined;
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
		removal: removalFor(f.slug),
	}));
	const availableItems = CATALOG_FRAMEWORKS.filter(
		(f) => !activeSlugs.has(f.slug),
	).map((f) => ({ ...toItem(f.slug), retired: retiredSlugs.has(f.slug) }));
	const canEditSettings = roleAllows(ctx.orgRole, { settings: ["update"] });
	const { prices } = canEditSettings
		? await loadPriceTable(settings?.priceGroupId)
		: { prices: null };
	const orgSummary = await getOrgSummary(ctx.orgId);
	const ssoProviders = await listSsoProvidersForOrg(ctx.orgId);
	const callbackBase = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
	const sctx = await getSessionCtx();
	const t = await getTranslations("Settings");
	const h = await headers();
	const [sessions, passkeys] = await Promise.all([
		auth.api.listSessions({ headers: h }),
		auth.api.listPasskeys({ headers: h }).catch(() => []),
	]);
	return (
		<>
			<PageHeader title={t("title")} />
			<Tabs
				defaultValue={
					tab &&
					[
						"frameworks",
						"workflows",
						"risk",
						"numbering",
						"organisation",
						"sso",
						"notifications",
						...(canReadIntegrations ? ["integrationen"] : []),
						...(canEditSettings ? ["abo"] : []),
					].includes(tab)
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
					<TabsTrigger value="organisation">{t("tabOrganisation")}</TabsTrigger>
					<TabsTrigger value="sso">{t("tabSso")}</TabsTrigger>
					<TabsTrigger value="notifications">
						{t("tabNotifications")}
					</TabsTrigger>
					{canReadIntegrations && (
						<TabsTrigger value="integrationen">
							{t("tabIntegrations")}
						</TabsTrigger>
					)}
					{prices && (
						<TabsTrigger value="abo">{t("tabSubscription")}</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="security" className="flex flex-col gap-6">
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
					<DlpPanel
						policy={withDlpDefaults(settings?.dlpPolicy)}
						canEdit={canEditSettings}
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
					<RiskMethodPanel
						method={resolveRiskMethod(settings, cov?.frameworks ?? [])}
						stored={Boolean(settings?.riskMethod)}
						template={defaultRiskMethod(cov?.frameworks ?? [])}
						risks={riskPoints}
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
				<TabsContent value="organisation" className="flex flex-col gap-8">
					<EntityProfilePanel
						orgName={orgSummary?.name ?? ""}
						profile={settings?.entityProfile ?? {}}
						canEdit={canEditSettings}
					/>
					{ctx.orgRole === "owner" && (
						<DangerZonePanel orgSlug={orgSummary?.slug ?? ""} canDelete />
					)}
				</TabsContent>
				<TabsContent value="sso">
					<SsoPanel
						providers={ssoProviders}
						callbackBase={callbackBase}
						canEdit={ctx.orgRole === "owner"}
					/>
				</TabsContent>
				<TabsContent value="notifications">
					<p className="text-muted-foreground text-sm">
						{t("notificationsLead")}
					</p>
				</TabsContent>
				{canReadIntegrations && (
					<TabsContent value="integrationen">
						<IntegrationsPanel
							tokens={tokens}
							products={productOptions}
							baseUrl={callbackBase}
							canCreate={roleAllows(ctx.orgRole, { integration: ["create"] })}
							canRevoke={roleAllows(ctx.orgRole, { integration: ["revoke"] })}
						/>
					</TabsContent>
				)}
				{prices && (
					<TabsContent value="abo">
						<SubscriptionPanel
							plan={settings?.plan ?? "start"}
							prices={prices}
							email={ctx.email}
						/>
					</TabsContent>
				)}
			</Tabs>
		</>
	);
}
