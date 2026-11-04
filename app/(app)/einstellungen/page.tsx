import { and, desc, eq, sql } from "drizzle-orm";
import {
	Bell,
	BookOpen,
	Building2,
	ChevronLeft,
	ClipboardCheck,
	Gauge,
	GitBranch,
	Hash,
	History,
	KeyRound,
	Layers,
	LockKeyhole,
	Network,
	Plug,
	Receipt,
	ShieldCheck,
	ShieldHalf,
	Sparkles,
	Truck,
	Users,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CustomFrameworkList } from "@/components/custom-frameworks/framework-list";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { AiPanel } from "@/components/settings/ai-panel";
import { AuditRegimesPanel } from "@/components/settings/audit-regimes-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DlpPanel } from "@/components/settings/dlp-panel";
import { EntityProfilePanel } from "@/components/settings/entity-profile-panel";
import { FrameworksPanel } from "@/components/settings/frameworks-panel";
import { IdentityPanel } from "@/components/settings/identity-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { LedgerPanel } from "@/components/settings/ledger-panel";
import { NetworkPanel } from "@/components/settings/network-panel";
import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { NumberingPanel } from "@/components/settings/numbering-panel";
import { PlatformAccessPanel } from "@/components/settings/platform-access-panel";
import { PolicyPortalPanel } from "@/components/settings/policy-portal-panel";
import { RiskMethodPanel } from "@/components/settings/risk-method-panel";
import { RolesPanel } from "@/components/settings/roles-panel";
import { SecurityChangesPanel } from "@/components/settings/security-changes-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { SignaturePolicyPanel } from "@/components/settings/signature-policy-panel";
import { SiteTunnelsSection } from "@/components/settings/site-tunnels-section";
import { SsoPanel } from "@/components/settings/sso-panel";
import { StagePanel } from "@/components/settings/stage-panel";
import { SubscriptionPanel } from "@/components/settings/subscription-panel";
import { SupplierMethodPanel } from "@/components/settings/supplier-method-panel";
import { TeamsPanel } from "@/components/settings/teams-panel";
import { WalletLinkPanel } from "@/components/settings/wallet-link-panel";
import { WorkflowsPanel } from "@/components/settings/workflows-panel";
import { KeepActiveVisible } from "@/components/ui/keep-active-visible";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { ListSearch } from "@/components/ui/list-search";
import {
	SourceItem,
	SourceList,
	SourceSection,
} from "@/components/ui/source-list";
import { SplitPane } from "@/components/ui/split-pane";
import {
	approvalWorkflows,
	auditLog,
	orgSettings,
	platformAccessGrants,
	securityChanges,
} from "@/db/schema";
import { latestCredential } from "@/lib/ai/credentials";
import { aiAdminOf } from "@/lib/ai/policy";
import { loadAiPolicy } from "@/lib/ai/service";
import {
	factInfos,
	ruleNames,
	triggerTexts,
} from "@/lib/approvals/designer-labels";
import { governanceModeOf } from "@/lib/approvals/governance-mode";
import { WORKFLOW_PRESETS } from "@/lib/approvals/presets";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import { TRIGGER_BY_KEY, TRIGGERS, triggerOf } from "@/lib/approvals/triggers";
import { requireOrgPage } from "@/lib/auth/gates";
import { getSessionCtx, toOrgCtx } from "@/lib/auth/guards";
import {
	getOrgSummary,
	listOrgMembers,
	listSsoProvidersForOrg,
} from "@/lib/auth/org";
import {
	canHoldOwnRole,
	grantablePresetOf,
	permissionCatalog,
} from "@/lib/auth/permission-catalog";
import { allows, roleStatements } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/server";
import { normalizeRole } from "@/lib/auth/session-rules";
import { orgSsoPolicy } from "@/lib/auth/sso-provisioning";
import { setupRequests } from "@/lib/auth/sso-setup-link";
import { providerStates } from "@/lib/auth/sso-setup-service";
import { ledgerExportAllowed } from "@/lib/auth/visibility";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import { requiredDuties } from "@/lib/compliance/catalog/approval-duties";
import { WORKFLOW_BY_KIND } from "@/lib/compliance/catalog/approval-workflows";
import { defaultSupplierMethod } from "@/lib/compliance/catalog/supplier-criteria";
import { CATALOG_EDGES, CATALOG_REQ_REFS } from "@/lib/compliance/catalog-view";
import { frameworkRemovalImpact } from "@/lib/compliance/framework-removal";
import { governanceChecks } from "@/lib/compliance/governance-checks";
import { activeFrameworkSlugs } from "@/lib/compliance/initialize-org";
import { getOrgCoverageCached } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import {
	loadAuditRegimeContext,
	regimeViews,
} from "@/lib/compliance/queries-audit-regimes";
import { listRisks } from "@/lib/compliance/queries-p2";
import { listProductOptions } from "@/lib/compliance/queries-products";
import { loadRecommendInput } from "@/lib/compliance/queries-recommend";
import { listAccessTokens } from "@/lib/compliance/queries-security";
import {
	defaultRiskMethod,
	presetRiskMethod,
	resolveRiskMethod,
} from "@/lib/compliance/risk-method";
import { resolveSupplierMethod } from "@/lib/compliance/supplier-rating";
import { topManagementOf } from "@/lib/compliance/top-management";
import { listCustomFrameworks } from "@/lib/custom-frameworks/service";
import { orgAiRow } from "@/lib/db/org-accounts";
import { userLabels } from "@/lib/db/platform-access";
import { loadPriceTable } from "@/lib/db/pricing";
import { flushQueuedAudits, readOrg, withOrg } from "@/lib/db/with-org";
import { withDlpDefaults } from "@/lib/dlp/policy";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { GOOGLE_SCOPES } from "@/lib/google/token";
import { entraConfigured, googleClientId } from "@/lib/identity/config";
import {
	type IdentitySourceView,
	identityPolicyFor,
	identitySourceViews,
} from "@/lib/identity/queries";
import { KIND_LABELS } from "@/lib/jobs/digest";
import { orgLedger } from "@/lib/ledger/export";
import { recommendServices } from "@/lib/marketing/recommend";
import { normalizeIp } from "@/lib/net/ip";
import { networkPolicyOf } from "@/lib/net/network-policy";
import {
	channelList,
	channelsFor,
	PERSONAL_NOTIFICATION_KINDS,
} from "@/lib/notifications/channels";
import { IMMEDIATE_MAIL_KINDS } from "@/lib/notifications/notify";
import { loadChannelPrefs, teamsActiveFor } from "@/lib/notifications/prefs";
import { oktaDomainOf } from "@/lib/okta/http";
import {
	getOrgSettings,
	listOpenAuditScopes,
	listOrgFrameworks,
	listRetiredFrameworkSlugs,
} from "@/lib/org/queries";
import { listOrgRoles } from "@/lib/org/roles";
import { grantState, reportOverdue } from "@/lib/platform-access/rules";
import { portalOf, portalReaders } from "@/lib/policy-portal/admin";
import { pushConfig } from "@/lib/push/config";
import { devicesOf, endpointRef } from "@/lib/push/service";
import {
	canCancelChange,
	canDecideChange,
	changeState,
	isOpen,
} from "@/lib/security-changes/rules";
import { changeDeciders } from "@/lib/security-changes/service";
import {
	resolveSettingsSection,
	type SettingsSectionKey,
	settingsGroups,
	settingsTerms,
	visibleSettingsSections,
} from "@/lib/settings/sections";
import { orgSignaturePolicy } from "@/lib/signatures/policy-server";
import { effectiveNets } from "@/lib/site-tunnels/rules";
import { siteTunnelsForOrg } from "@/lib/site-tunnels/service";
import { teamsConfigured } from "@/lib/teams/config";
import { teamsIntegrationOf } from "@/lib/teams/service";
import { cn } from "@/lib/utils";
import { listWalletLinks } from "@/lib/wallet-link-ingest/queries";

const SECTION_LABEL = {
	security: "tabSecurity",
	notifications: "tabNotifications",
	organisation: "tabOrganisation",
	frameworks: "tabFrameworks",
	rollen: "tabRoles",
	sso: "tabSso",
	portal: "tabPortal",
	integrationen: "tabIntegrations",
	zugriffe: "tabPlatformAccess",
	sicherheitsaenderungen: "tabSecurityChanges",
	netzwerk: "tabNetwork",
	ki: "tabAi",
	verlauf: "tabLedger",
	abo: "tabSubscription",
	workflows: "tabWorkflows",
	audits: "tabAudits",
	risk: "tabRiskScales",
	lieferanten: "tabSupplierMethod",
	numbering: "tabNumbering",
} as const satisfies Record<SettingsSectionKey, string>;

const SECTION_ICON: Record<SettingsSectionKey, React.ReactNode> = {
	security: <ShieldCheck />,
	notifications: <Bell />,
	organisation: <Building2 />,
	frameworks: <Layers />,
	rollen: <Users />,
	sso: <KeyRound />,
	portal: <BookOpen />,
	integrationen: <Plug />,
	zugriffe: <LockKeyhole />,
	sicherheitsaenderungen: <ShieldHalf />,
	netzwerk: <Network />,
	ki: <Sparkles />,
	verlauf: <History />,
	abo: <Receipt />,
	workflows: <GitBranch />,
	audits: <ClipboardCheck />,
	risk: <Gauge />,
	lieferanten: <Truck />,
	numbering: <Hash />,
};

const GROUP_LABEL = {
	account: "groupAccount",
	org: "groupOrg",
	security: "groupSecurity",
	connections: "groupConnections",
	methods: "groupMethods",
} as const;

// Einstellungen nach Apple HIG (iOS-Einstellungen): gruppierte Liste der
// Bereiche; am Handy erst die Liste, dann der Bereich mit Rückweg, ab Desktop
// Liste links und Bereich rechts. Geladen wird nur, was der Bereich braucht.
async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab } = await searchParams;
	// Mitarbeitende: nur „Dein Konto“ (Passkeys, Benachrichtigungen)
	const ctx = await requireOrgPage(undefined, { employees: true });
	const canEditSettings = allows(ctx, { settings: ["update"] });
	const canReadIntegrations = allows(ctx, { integration: ["read"] });
	const visible = visibleSettingsSections({
		settings: canEditSettings,
		integrations: canReadIntegrations,
		accountOnly: ctx.orgRole === "employee",
		auditor: ctx.orgRole === "auditor",
	});
	const { key: section, chosen } = resolveSettingsSection(tab, visible);
	const t = await getTranslations("Settings");
	const sectionTitle = t(SECTION_LABEL[section]);
	const panel = await renderSection(section, ctx, { canEditSettings });
	return (
		// Wie Einstellungen in macOS/iPadOS:
		// - Handy: erst die Liste, dann der Bereich (mit Zurück)
		// - ab 48rem Platz (iPad hochkant): Liste und Bereich nebeneinander,
		//   die Liste klebt unter der Kopfleiste und scrollt für sich. Gemessen
		//   am Platz der Seite in rem (Container-Abfrage, @3xl): bei großer
		//   Schrift bleibt es einspaltig, statt den Inhalt zu quetschen
		// - ab 1024 px: bündig (data-split-page="flush") — die Liste liegt
		//   direkt an der Seitenleiste der App, der Bereich nimmt den Rest der
		//   Breite, beide scrollen je für sich; erst ab 1920 px hat der Inhalt
		//   eine Höchstbreite (links bündig, nahe an der Liste)
		<div data-split-page="flush" className="@container">
			{chosen && (
				<div className="@3xl:hidden">
					<Link
						href="/einstellungen"
						className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-2 text-body text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ChevronLeft aria-hidden="true" className="size-5" />
						{t("title")}
					</Link>
					<PageHeader title={sectionTitle} />
				</div>
			)}
			<div
				data-split-body=""
				className="grid grid-cols-1 gap-8 @3xl:grid-cols-[16rem_minmax(0,1fr)] max-lg:@3xl:gap-6 @5xl:grid-cols-[18rem_minmax(0,1fr)] @7xl:grid-cols-[20rem_minmax(0,1fr)] @min-[100rem]:grid-cols-[22rem_minmax(0,1fr)] lg:gap-0"
			>
				<SplitPane
					as="nav"
					list
					aria-label={t("title")}
					// Neben dem Inhalt ist die Liste eine Seitenleiste: ohne Pfeile,
					// mit eigener Scrollfläche (scrollt für sich, nie den Inhalt mit)
					className={cn(
						// unter 1024 px klebt die Liste unter der Kopfleiste (das Fenster
						// scrollt); darüber scrollt sie als Spalte selbst (styles/base.css)
						"max-lg:@3xl:sticky max-lg:@3xl:top-16 max-lg:@3xl:max-h-[calc(100dvh-8rem)] max-lg:@3xl:self-start max-lg:@3xl:overflow-y-auto max-lg:@3xl:overscroll-contain",
						// ab 1024 px auf der Fläche der Seitenleiste: Menü und Liste
						// wirken wie eine Spalte (gleiche Zeilen, gleicher Grund)
						"lg:px-3 lg:@3xl:border-border/60 lg:@3xl:border-r lg:@3xl:bg-sidebar",
						chosen && "hidden @3xl:block",
					)}
				>
					{/* Abstand oben am Titel, nicht an der Spalte: sonst hielte das
					    klebende Suchfeld ihn frei und Zeilen schienen darüber durch */}
					<div className="lg:px-2 lg:pt-6">
						<PageHeader compact title={t("title")} />
					</div>
					<KeepActiveVisible active={section} />
					<ListSearch
						sticky
						source="wide"
						items={visible.map((k) => ({
							id: k,
							title: t(SECTION_LABEL[k]),
							subtitle: t(`hint_${k}`),
							href: `/einstellungen?tab=${k}`,
							icon: SECTION_ICON[k],
							terms: settingsTerms(k),
							current: k === section,
						}))}
						labels={{
							placeholder: t("searchPlaceholder"),
							results: t("searchResults"),
							empty: t("searchEmpty"),
						}}
					>
						{/* neben dem Inhalt: Zeilen wie im Menü, ohne Satz und Pfeil; der
						    gezeigte Bereich ist gewählt (ohne Wahl der Standardbereich) */}
						<SourceList className="hidden @3xl:flex">
							{settingsGroups(visible).map((g) => (
								<SourceSection key={g.group} title={t(GROUP_LABEL[g.group])}>
									{g.keys.map((k) => (
										<SourceItem
											key={k}
											icon={SECTION_ICON[k]}
											title={t(SECTION_LABEL[k])}
											href={`/einstellungen?tab=${k}`}
											current={k === section}
										/>
									))}
								</SourceSection>
							))}
						</SourceList>
						{/* Handy: gruppierte Liste mit einem Satz je Bereich */}
						<ListGroup className="@3xl:hidden">
							{settingsGroups(visible).map((g) => (
								<ListSection key={g.group} title={t(GROUP_LABEL[g.group])}>
									{g.keys.map((k) => (
										<ListRow
											key={k}
											icon={SECTION_ICON[k]}
											title={t(SECTION_LABEL[k])}
											subtitle={t(`hint_${k}`)}
											href={`/einstellungen?tab=${k}`}
										/>
									))}
								</ListSection>
							))}
						</ListGroup>
					</ListSearch>
				</SplitPane>
				{/* key: ein anderer Bereich beginnt oben */}
				<SplitPane
					key={section}
					as="section"
					main
					aria-labelledby="einstellungen-bereich"
					className={cn(
						"lg:px-8 lg:pt-6 lg:pb-6 xl:px-10",
						!chosen && "hidden @3xl:block",
					)}
				>
					{/* füllt die restliche Breite; erst auf sehr breiten Monitoren eine
					    Grenze, damit Zeilen nicht endlos lang werden */}
					<div className="flex w-full flex-col gap-6 min-[120rem]:max-w-[110rem]">
						<h2
							id="einstellungen-bereich"
							className="sr-only font-bold text-title-2 @3xl:not-sr-only"
						>
							{sectionTitle}
						</h2>
						<p className="-mt-4 text-callout text-muted-foreground">
							{t(`hint_${section}`)}
						</p>
						{panel}
					</div>
				</SplitPane>
			</div>
		</div>
	);
}

type PageCtx = Awaited<ReturnType<typeof requireOrgPage>>;

async function renderSection(
	section: SettingsSectionKey,
	ctx: PageCtx,
	{ canEditSettings }: { canEditSettings: boolean },
): Promise<React.ReactNode> {
	const octx = toOrgCtx(ctx);
	switch (section) {
		case "security": {
			const h = await headers();
			const [sctx, settings, sessions, passkeys] = await Promise.all([
				getSessionCtx(),
				readOrg(octx, (tx) => getOrgSettings(tx, ctx.orgId)),
				auth.api.listSessions({ headers: h }),
				auth.api.listPasskeys({ headers: h }).catch(() => []),
			]);
			return (
				<>
					<SecurityPanel
						mfaEnabled={
							Boolean(sctx?.user.twoFactorEnabled) || passkeys.length > 0
						}
						hasTotp={Boolean(sctx?.user.twoFactorEnabled)}
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
							backedUp: p.backedUp,
						}))}
					/>
					{ctx.orgRole !== "employee" && (
						<DlpPanel
							policy={withDlpDefaults(settings?.dlpPolicy)}
							canEdit={canEditSettings}
						/>
					)}
				</>
			);
		}
		case "notifications": {
			const push = pushConfig();
			const { prefs, teamsActive, devices } = await readOrg(
				octx,
				async (tx) => ({
					prefs: (await loadChannelPrefs(tx, ctx.orgId)).get(ctx.userId),
					teamsActive: await teamsActiveFor(tx, ctx.orgId),
					devices: push ? await devicesOf(tx, ctx.orgId, ctx.userId) : [],
				}),
			);
			const immediate = new Set<string>(IMMEDIATE_MAIL_KINDS);
			return (
				<NotificationPrefsPanel
					kinds={PERSONAL_NOTIFICATION_KINDS.map((kind) => ({
						kind,
						label: KIND_LABELS[kind],
						immediate: immediate.has(kind),
					}))}
					initial={{
						channels: Object.fromEntries(
							PERSONAL_NOTIFICATION_KINDS.map((k) => [
								k,
								channelList(channelsFor(prefs, k)),
							]),
						),
						digestEnabled: prefs?.digestEnabled ?? true,
					}}
					teamsActive={teamsActive}
					push={
						push
							? {
									publicKey: push.publicKey,
									// Endpunkt (Kennung beim Push-Dienst) bleibt am Server
									devices: devices.map((d) => ({
										id: d.id,
										label: d.label,
										createdAt: d.createdAt,
										lastSuccessAt: d.lastSuccessAt,
										lastError: d.lastError,
										host: new URL(d.endpoint).hostname,
										ref: endpointRef(d.endpoint),
									})),
								}
							: null
					}
				/>
			);
		}
		case "frameworks": {
			const cov = await getOrgCoverageCached(ctx);
			if (!cov) return null;
			const { settings, orgFws, retiredSlugs, openAudits, customFws } =
				await readOrg(octx, async (tx) => {
					const rows = await listOrgFrameworks(tx, ctx.orgId);
					const names = await userNames(
						tx,
						rows.map((r) => r.ownerUserId),
					);
					return {
						settings: await getOrgSettings(tx, ctx.orgId),
						customFws: allows(ctx, { custom_framework: ["read"] })
							? await listCustomFrameworks(tx, ctx.orgId)
							: null,
						orgFws: rows.map((r) => ({
							...r,
							ownerName: r.ownerUserId
								? (names.get(r.ownerUserId) ?? null)
								: null,
						})),
						retiredSlugs: new Set(
							await listRetiredFrameworkSlugs(tx, ctx.orgId),
						),
						openAudits: await listOpenAuditScopes(tx, ctx.orgId),
					};
				});
			const activeSlugs = new Set(orgFws.map((f) => f.slug));
			const applicability = new Map(
				[...cov.applicabilityDetail].map(([k, d]) => [k, d.applicable]),
			);
			const toItem = (slug: string) => {
				const meta = CATALOG_FRAMEWORKS.find((f) => f.slug === slug);
				return {
					slug,
					name: meta?.name ?? slug,
					description: meta?.description ?? null,
					hasIndex: (meta?.requirements.length ?? 0) > 0,
					coveragePct: cov.result.byFramework.get(slug)?.coveragePct ?? null,
					variants: meta?.variants,
					variantLabel: meta?.variantLabel,
				};
			};
			const activeItems = orgFws.map((f) => ({
				...toItem(f.slug),
				ownerName: f.ownerName,
				removal: frameworkRemovalImpact({
					slug: f.slug,
					activeSlugs: cov.frameworks,
					licenceStage: cov.profile.licenceStage,
					tlptDesignated: cov.profile.tlptDesignated,
					requirements: CATALOG_REQ_REFS,
					edges: CATALOG_EDGES,
					applicability,
					implStatus: cov.implStatus,
					openAudits,
				}),
			}));
			const availableItems = CATALOG_FRAMEWORKS.filter(
				(f) => !activeSlugs.has(f.slug),
			).map((f) => ({ ...toItem(f.slug), retired: retiredSlugs.has(f.slug) }));
			return (
				<>
					<StagePanel
						licenceStage={cov.profile.licenceStage}
						caspServices={[...cov.profile.caspServices]}
						tlptDesignated={cov.profile.tlptDesignated}
						tlptConfirmedAt={settings?.setupFlags?.tlptConfirmedAt ?? null}
						canEdit={canEditSettings}
					/>
					<FrameworksPanel
						active={activeItems}
						available={availableItems}
						profile={{
							sector: cov.profile.sector,
							licenceStage: cov.profile.licenceStage,
							caspServices: [...cov.profile.caspServices],
							tlptDesignated: cov.profile.tlptDesignated,
							frameworkVariants: cov.profile.frameworkVariants ?? {},
							nis2Status: cov.profile.nis2Status,
						}}
						canEdit={canEditSettings}
					/>
					{customFws && (
						<CustomFrameworkList
							items={customFws.map((f) => ({
								id: f.id,
								name: f.name,
								status: f.status,
								requirements: f.requirements,
								mapped: f.mapped,
							}))}
							canCreate={allows(ctx, { custom_framework: ["create"] })}
							copyOptions={CATALOG_FRAMEWORKS.filter(
								(f) => f.requirements.length > 0,
							).map((f) => ({
								slug: f.slug,
								name: f.name,
								requirements: f.requirements.length,
							}))}
						/>
					)}
				</>
			);
		}
		case "rollen": {
			const tt = await getTranslations("Team");
			const [{ roles, mode }, members] = await Promise.all([
				readOrg(octx, async (tx) => ({
					roles: await listOrgRoles(tx, ctx.orgId),
					mode: await governanceModeOf(tx, ctx.orgId),
				})),
				listOrgMembers(ctx.orgId),
			]);
			const memberOf = new Map(members.map((m) => [m.userId, m.memberId]));
			const cap = (r: string) => `${r[0]?.toUpperCase()}${r.slice(1)}`;
			// Besetzung aus der Bestellung (ADR-024): bestellt oder vorgeschlagen
			const heldBy = (
				r: (typeof roles)[number],
				pick: (s: (typeof r.holders)[number]["status"]) => boolean,
			) =>
				r.holders
					.filter((h) => h.userId && pick(h.status))
					.flatMap((h) => {
						const id = memberOf.get(h.userId as string);
						return id ? [id] : [];
					});
			return (
				<RolesPanel
					individual={mode === "individual"}
					roles={roles.map((r) => ({
						id: r.id,
						name: r.name,
						description: r.description,
						tasks: r.tasks,
						permissions: r.permissions,
						memberIds: heldBy(r, () => true),
						waitingMemberIds: heldBy(r, (s) => s === "proposed"),
						pendingEmails: r.holders
							.map((h) => (h.userId ? null : h.pendingEmail))
							.filter((x): x is string => Boolean(x)),
					}))}
					members={members
						.filter((m) => canHoldOwnRole(normalizeRole(m.role)))
						.map((m) => ({ memberId: m.memberId, name: m.name || m.email }))}
					catalog={permissionCatalog()}
					editorPreset={grantablePresetOf("editor")}
					baseRoles={(
						["owner", "editor", "viewer", "auditor", "consultant"] as const
					).map((role) => ({
						role,
						label: tt(`role${cap(role)}` as "roleOwner"),
						hint: tt(`role${cap(role)}Hint` as "roleOwnerHint"),
						// Better-Auth-interne Ressourcen (Team, Einladungen, …) ausblenden
						permissions: Object.fromEntries(
							Object.entries(roleStatements(role)).filter(
								([res]) =>
									![
										"organization",
										"member",
										"invitation",
										"team",
										"ac",
									].includes(res),
							),
						),
					}))}
					canEdit={canEditSettings}
				/>
			);
		}
		case "workflows": {
			// Workflows je Org sicherstellen (Seed) und laden
			const { workflows, workflowNames, mode, findings } = await withOrg(
				octx,
				async (tx) => {
					const settings = await getOrgSettings(tx, ctx.orgId);
					await ensureOrgWorkflows(
						tx,
						ctx.orgId,
						settings?.licenceStage ?? "0_vorbereitung",
					);
					await flushQueuedAudits(tx, octx);
					const rows = await tx
						.select()
						.from(approvalWorkflows)
						.where(eq(approvalWorkflows.organizationId, ctx.orgId));
					// Fundstellen der gewählten Rahmenwerke je Ablauf (approval-duties.ts)
					const stageNum =
						Number.parseInt(
							(settings?.licenceStage ?? "0_vorbereitung").charAt(0),
							10,
						) || 0;
					const fws = await activeFrameworkSlugs(tx, ctx.orgId);
					const basisByKind = new Map(
						requiredDuties(fws, stageNum).map((d) => [d.kind, d.basis]),
					);
					// Pflichten prüfen statt erzwingen (ADR-024)
					const mode = await governanceModeOf(tx, ctx.orgId);
					const findings = governanceChecks({
						frameworks: fws,
						stage: stageNum,
						workflows: rows,
					}).map((f) => ({
						...f,
						name: WORKFLOW_BY_KIND.get(f.kind)?.name ?? f.kind,
						id: rows.find((r) => r.kind === f.kind)?.id ?? null,
					}));
					// nur angeschlossene Auslöser (Designer, lib/approvals/triggers.ts)
					const workflows = rows.flatMap((r) => {
						const trigger = triggerOf(r);
						if (!trigger || !TRIGGER_BY_KEY.get(trigger)?.wired) return [];
						return [
							{
								id: r.id,
								kind: r.kind,
								name: r.name,
								description: r.description,
								trigger,
								custom: r.custom,
								enabled: r.enabled,
								priority: r.priority,
								conditions: r.conditions,
								steps: r.steps,
								requiredBy: r.custom ? [] : (basisByKind.get(r.kind) ?? []),
							},
						];
					});
					const [roles, members] = await Promise.all([
						listOrgRoles(tx, ctx.orgId),
						userNames(
							tx,
							rows.flatMap((r) =>
								r.steps.flatMap((s) =>
									[...(s.approvers ?? [s.approverRule]), ...(s.skipIf ?? [])]
										.filter((x) => x.startsWith("user:"))
										.map((x) => x.slice(5)),
								),
							),
						),
					]);
					return {
						workflows,
						workflowNames: await ruleNames({ roles, users: members }),
						mode,
						findings,
					};
				},
			);
			const signaturePolicy = await orgSignaturePolicy(octx);
			return (
				<div className="flex flex-col gap-8">
					<SignaturePolicyPanel
						securityKeysOnly={signaturePolicy.securityKeysOnly}
						isOwner={ctx.orgRole === "owner"}
					/>
					<WorkflowsPanel
						triggers={TRIGGERS.filter((x) => x.wired).map((x) => ({
							key: x.key,
							area: x.area,
							mode: x.mode,
						}))}
						texts={await triggerTexts()}
						facts={await factInfos()}
						workflows={workflows}
						names={workflowNames}
						presets={WORKFLOW_PRESETS.map((p) => ({
							key: p.key,
							trigger: p.trigger,
							name: p.name,
							description: p.description,
							variant: Boolean(p.variant),
							roles: p.roles.map((r) => r.name),
						}))}
						canEdit={canEditSettings}
						mode={mode}
						findings={findings}
						isOwner={ctx.orgRole === "owner"}
					/>
				</div>
			);
		}
		case "audits": {
			const [cov, auditCtx] = await Promise.all([
				getOrgCoverageCached(ctx),
				readOrg(octx, (tx) => loadAuditRegimeContext(tx, ctx.orgId)),
			]);
			return (
				<AuditRegimesPanel
					regimes={regimeViews(
						cov?.frameworks ?? [],
						auditCtx.settings,
						auditCtx.registered,
						berlinToday(),
					)}
					canEdit={canEditSettings}
				/>
			);
		}
		case "risk": {
			const [cov, { settings, riskPoints }] = await Promise.all([
				getOrgCoverageCached(ctx),
				readOrg(octx, async (tx) => ({
					settings: await getOrgSettings(tx, ctx.orgId),
					riskPoints: (await listRisks(tx, ctx.orgId)).map((r) => ({
						likelihood: r.likelihood,
						impact: r.impact,
						residualLikelihood: r.residualLikelihood,
						residualImpact: r.residualImpact,
					})),
				})),
			]);
			return (
				<RiskMethodPanel
					method={resolveRiskMethod(settings, cov?.frameworks ?? [])}
					stored={Boolean(settings?.riskMethod)}
					template={defaultRiskMethod(cov?.frameworks ?? [])}
					presets={{
						standard: presetRiskMethod("standard", cov?.frameworks ?? []),
						"bsi-200-3": presetRiskMethod("bsi-200-3", cov?.frameworks ?? []),
					}}
					risks={riskPoints}
					allowSelfApproval={settings?.allowSelfApproval ?? true}
					canEdit={canEditSettings}
				/>
			);
		}
		case "lieferanten": {
			const settings = await readOrg(octx, (tx) =>
				getOrgSettings(tx, ctx.orgId),
			);
			return (
				<SupplierMethodPanel
					method={resolveSupplierMethod(settings)}
					stored={Boolean(settings?.supplierMethod)}
					template={defaultSupplierMethod()}
					canEdit={canEditSettings}
				/>
			);
		}
		case "numbering": {
			const settings = await readOrg(octx, (tx) =>
				getOrgSettings(tx, ctx.orgId),
			);
			return (
				<NumberingPanel
					numbering={settings?.documentNumbering ?? {}}
					canEdit={canEditSettings}
				/>
			);
		}
		case "organisation": {
			const [settings, orgSummary] = await Promise.all([
				readOrg(octx, (tx) => getOrgSettings(tx, ctx.orgId)),
				getOrgSummary(ctx.orgId),
			]);
			return (
				<div className="flex flex-col gap-8">
					<EntityProfilePanel
						orgName={orgSummary?.name ?? ""}
						profile={settings?.entityProfile ?? {}}
						canEdit={canEditSettings}
					/>
					{ctx.orgRole === "owner" && (
						<DangerZonePanel orgSlug={orgSummary?.slug ?? ""} canDelete />
					)}
				</div>
			);
		}
		case "sso": {
			const [list, states, setups] = await Promise.all([
				listSsoProvidersForOrg(ctx.orgId),
				readOrg(octx, (tx) => providerStates(tx, ctx.orgId)),
				readOrg(octx, (tx) => setupRequests(tx, ctx.orgId)),
			]);
			const now = new Date();
			const byId = new Map(states.map((s) => [s.providerId, s]));
			return (
				<SsoPanel
					providers={list.map((p) => {
						const st = byId.get(p.providerId);
						return {
							...p,
							vendor: st?.vendor ?? null,
							certNotAfter: st?.certNotAfter?.toISOString() ?? null,
							metadataUrl: st?.metadataUrl ?? null,
							probeOkAt: st?.probeOkAt?.toISOString() ?? null,
							nextCert: Boolean(st?.nextCertFingerprints),
							nextCertNotAfter: st?.nextCertNotAfter?.toISOString() ?? null,
							lastFetchError: st?.lastFetchError ?? null,
						};
					})}
					callbackBase={callbackBase()}
					canEdit={ctx.orgRole === "owner"}
					policy={await orgSsoPolicy(ctx.orgId)}
					setupRequests={setups
						.filter(
							(r) =>
								(r.status === "open" || r.status === "submitted") &&
								r.expiresAt > now,
						)
						.map((r) => ({
							id: r.id,
							vendor: r.vendor,
							domain: r.domain,
							status: r.status,
							contactName: r.contactName,
							submittedAt: r.submittedAt?.toISOString() ?? null,
							expiresAt: r.expiresAt.toISOString(),
						}))}
				/>
			);
		}
		case "portal": {
			const [{ portal, readers }, sso] = await Promise.all([
				readOrg(octx, async (tx) => ({
					portal: await portalOf(tx, ctx.orgId),
					readers: await portalReaders(tx, ctx.orgId),
				})),
				listSsoProvidersForOrg(ctx.orgId),
			]);
			return (
				<PolicyPortalPanel
					origin={callbackBase()}
					portal={
						portal && {
							enabled: portal.enabled,
							slug: portal.slug,
							sessionDays: portal.sessionDays,
							domains: portal.domains,
						}
					}
					readers={readers.map((r) => ({
						...r,
						confirmedAt: r.confirmedAt?.toISOString() ?? null,
						lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
					}))}
					ssoDomains={sso
						.filter((p) => p.domainVerified)
						.map((p) => p.domain.toLowerCase())}
				/>
			);
		}
		case "zugriffe": {
			const { grants, mayDecide } = await readOrg(octx, async (tx) => ({
				grants: await tx
					.select()
					.from(platformAccessGrants)
					.where(eq(platformAccessGrants.organizationId, ctx.orgId))
					.orderBy(desc(platformAccessGrants.requestedAt))
					.limit(100),
				mayDecide:
					ctx.orgRole === "owner" ||
					(await topManagementOf(tx, ctx.orgId, ctx.userId)).isTopManagement,
			}));
			const names = await userLabels(
				grants.flatMap((g) => [g.targetUserId, g.requestedBy, g.decidedBy]),
			);
			const now = new Date();
			const iso = (d: Date | null) => d?.toISOString() ?? null;
			return (
				<PlatformAccessPanel
					mayDecide={mayDecide}
					grants={grants.map((g) => ({
						id: g.id,
						scope: g.scope,
						state: grantState(g, now),
						reason: g.reason,
						durationMinutes: g.durationMinutes,
						targetName: g.targetUserId
							? (names.get(g.targetUserId) ?? null)
							: null,
						targetIsMe: g.targetUserId === ctx.userId,
						requestedByName: g.requestedBy
							? (names.get(g.requestedBy) ?? null)
							: null,
						requestedAt: g.requestedAt.toISOString(),
						applyAfter: iso(g.applyAfter),
						expiresAt: iso(g.expiresAt),
						emergencyCategory: g.emergencyCategory,
						decidedByName: g.decidedBy
							? (names.get(g.decidedBy) ?? null)
							: null,
						decidedAt: iso(g.decidedAt),
						usedAt: iso(g.usedAt),
						report: g.report,
						reportOverdue: reportOverdue(g, now),
					}))}
				/>
			);
		}
		case "sicherheitsaenderungen": {
			const { rows, deciders } = await readOrg(octx, async (tx) => ({
				rows: await tx
					.select()
					.from(securityChanges)
					.where(eq(securityChanges.organizationId, ctx.orgId))
					.orderBy(desc(securityChanges.requestedAt))
					.limit(100),
				deciders: await changeDeciders(tx, ctx.orgId),
			}));
			const names = await userLabels(
				rows.flatMap((r) => [r.requestedBy, r.decidedBy]),
			);
			const now = new Date();
			const iso = (d: Date | null) => d?.toISOString() ?? null;
			return (
				<SecurityChangesPanel
					changes={rows.map((r) => ({
						id: r.id,
						kind: r.kind,
						summary: r.summary,
						state: changeState(r, now),
						requestedByName: r.requestedBy
							? (names.get(r.requestedBy) ?? null)
							: null,
						requestedByMe: r.requestedBy === ctx.userId,
						requestedAt: r.requestedAt.toISOString(),
						applyAfter: iso(r.applyAfter),
						permitUntil: iso(r.permitUntil),
						decidedByName: r.decidedBy
							? (names.get(r.decidedBy) ?? null)
							: null,
						decidedAt: iso(r.decidedAt),
						decisionNote: r.decisionNote,
						appliedAt: iso(r.appliedAt),
						mayDecide: canDecideChange(r, ctx.userId, deciders, now) === null,
						mayCancel: canCancelChange(r, ctx.userId, deciders, now) === null,
					}))}
				/>
			);
		}
		case "netzwerk": {
			const { row, open } = await readOrg(octx, async (tx) => {
				const [row] = await tx
					.select({ networkPolicy: orgSettings.networkPolicy })
					.from(orgSettings)
					.where(eq(orgSettings.organizationId, ctx.orgId))
					.limit(1);
				const changes = await tx
					.select()
					.from(securityChanges)
					.where(
						and(
							eq(securityChanges.organizationId, ctx.orgId),
							eq(securityChanges.kind, "network_policy"),
						),
					);
				return { row, open: changes.some((c) => isOpen(c, new Date())) };
			});
			const tunnels = await siteTunnelsForOrg(octx);
			const owner = ctx.orgRole === "owner";
			return (
				<NetworkPanel
					policy={networkPolicyOf(row?.networkPolicy)}
					myIp={normalizeIp(ctx.ip)}
					canEdit={owner}
					pendingChange={open}
					sites={tunnels
						.filter((tn) => tn.state === "connected")
						.map((tn) => ({
							name: tn.name,
							nets: effectiveNets(tn),
						}))}
					siteSection={
						tunnels.length > 0 ? (
							<SiteTunnelsSection tunnels={tunnels} canEdit={owner} />
						) : null
					}
				/>
			);
		}
		case "ki": {
			const [aiRow, data] = await Promise.all([
				orgAiRow(ctx.orgId),
				readOrg(octx, async (tx) => {
					const policy = await loadAiPolicy(tx, ctx.orgId);
					const latest = await latestCredential(tx, ctx.orgId);
					const changes = await tx
						.select()
						.from(securityChanges)
						.where(
							and(
								eq(securityChanges.organizationId, ctx.orgId),
								eq(securityChanges.kind, "ai_policy"),
							),
						);
					return {
						policy,
						latest,
						open: changes.some((c) => isOpen(c, new Date())),
					};
				}),
			]);
			return (
				<AiPanel
					admin={aiAdminOf(aiRow)}
					policy={data.policy}
					keyView={
						data.latest
							? {
									id: data.latest.id,
									provider: data.latest.provider,
									keyHint: data.latest.keyHint,
									active: data.latest.id === data.policy.credentialId,
									lastTestOk: data.latest.lastTestOk,
								}
							: null
					}
					canEdit={ctx.orgRole === "owner"}
					pendingChange={data.open}
				/>
			);
		}
		case "verlauf": {
			const [[stats], ledger] = await Promise.all([
				readOrg(octx, (tx) =>
					tx
						.select({
							n: sql<number>`count(*)::int`,
							last: sql<string | null>`max(${auditLog.at})`,
						})
						.from(auditLog)
						.where(eq(auditLog.organizationId, ctx.orgId)),
				),
				orgLedger(octx, 20),
			]);
			return (
				<LedgerPanel
					entries={stats?.n ?? 0}
					lastEntryAt={stats?.last ? new Date(stats.last).toISOString() : null}
					canExport={ledgerExportAllowed(ctx.orgRole)}
					anchors={ledger.heads.flatMap((h) =>
						h.anchor
							? [
									{
										id: h.anchorId,
										createdAt: h.createdAt.toISOString(),
										status: h.anchor.status as
											| "pending"
											| "confirmed"
											| "failed",
										reason: h.anchor.reason,
										count: h.count,
										head: h.head,
										root: h.anchor.root,
										bitcoinHeight: h.anchor.bitcoinHeight,
										bitcoinMerkleRoot: h.anchor.bitcoinMerkleRoot,
									},
								]
							: [],
					)}
				/>
			);
		}
		case "integrationen": {
			const { tokens, productOptions, walletLinks } = await readOrg(
				octx,
				async (tx) => ({
					tokens: await listAccessTokens(tx, ctx.orgId),
					productOptions: await listProductOptions(tx, ctx.orgId),
					walletLinks: await listWalletLinks(tx, ctx.orgId),
				}),
			);
			const canCreate = allows(ctx, { integration: ["create"] });
			const canRevoke = allows(ctx, { integration: ["revoke"] });
			const [teams, sso, identity] = await Promise.all([
				readOrg(octx, (tx) => teamsIntegrationOf(tx, ctx.orgId)),
				listSsoProvidersForOrg(ctx.orgId),
				readOrg(octx, async (tx) => ({
					sources: await identitySourceViews(tx, ctx.orgId),
					policy: await identityPolicyFor(tx, ctx.orgId),
				})),
			]);
			const entra = identity.sources.find((s) => s.provider === "entra");
			const google = identity.sources.find((s) => s.provider === "google");
			const okta = identity.sources.find((s) => s.provider === "okta");
			const oktaSuggested =
				sso.map((p) => oktaDomainOf(p.issuer ?? "")).find(Boolean) ?? null;
			const entraTenant =
				sso
					.map((p) =>
						/login\.microsoftonline\.com\/([0-9a-f-]{36})/i.exec(
							p.issuer ?? "",
						),
					)
					.find(Boolean)?.[1] ?? null;
			return (
				<>
					<TeamsPanel
						configured={teamsConfigured()}
						isOwner={ctx.orgRole === "owner"}
						integration={
							teams && {
								tenantId: teams.tenantId,
								status: teams.status,
								enabled: teams.enabled,
								consentedAt: teams.consentedAt,
								lastError: teams.lastError,
							}
						}
						suggestedTenant={entraTenant}
					/>
					<IdentityPanel
						isOwner={ctx.orgRole === "owner"}
						canSync={allows(ctx, { identity: ["update"] })}
						entra={{
							configured: entraConfigured(),
							source: entra ? sourcePanelView(entra) : null,
							suggestedTenant: entraTenant,
						}}
						google={{
							clientId: googleClientId(),
							scopes: GOOGLE_SCOPES,
							source: google ? sourcePanelView(google) : null,
						}}
						okta={{
							source: okta ? sourcePanelView(okta) : null,
							suggestedDomain: oktaSuggested,
						}}
						policy={identity.policy}
					/>
					<WalletLinkPanel
						links={walletLinks}
						origin={callbackBase()}
						canCreate={canCreate}
						canRevoke={canRevoke}
					/>
					<IntegrationsPanel
						tokens={tokens}
						products={productOptions}
						baseUrl={callbackBase()}
						canCreate={canCreate}
						canRevoke={canRevoke}
					/>
				</>
			);
		}
		case "abo": {
			const [cov, settings, members] = await Promise.all([
				getOrgCoverageCached(ctx),
				readOrg(octx, (tx) => getOrgSettings(tx, ctx.orgId)),
				listOrgMembers(ctx.orgId),
			]);
			const { prices } = await loadPriceTable(settings?.priceGroupId);
			// „Für dich empfohlen“ (nur Inhaber:innen sehen den Bereich)
			const recommendations = recommendServices(
				await readOrg(octx, (tx) =>
					loadRecommendInput(tx, ctx.orgId, cov?.frameworks ?? []),
				),
			);
			const now = Date.now();
			return (
				<SubscriptionPanel
					plan={settings?.plan ?? "start"}
					prices={prices}
					// Berater-Zugänge (ADR-018) kosten ab Start — nur gültige zählen
					consultantSeats={
						members.filter(
							(m) =>
								normalizeRole(m.role) === "consultant" &&
								(!m.accessUntil || m.accessUntil.getTime() > now),
						).length
					}
					email={ctx.email}
					recommendations={recommendations}
				/>
			);
		}
	}
}

// Stand einer Identitätsquelle für die Client-Komponente (Zeitpunkte als Text)
function sourcePanelView(s: IdentitySourceView) {
	return {
		id: s.id,
		tenantKey: s.tenantKey,
		status: s.status,
		connectedAt: s.connectedAt?.toISOString() ?? null,
		domains: s.domains,
		capabilities: s.capabilities,
		lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
		lastSyncOk: s.lastSyncOk,
		accountCount: s.accountCount,
		lastError: s.lastError,
		consentOpen: s.consentOpen,
		tokenHint: s.tokenHint,
	};
}

function callbackBase(): string {
	return (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}

export default withMessages(SettingsPage, [
	"AiSettings",
	"Approvals",
	"AuditRegimes",
	"Auth",
	"Common",
	"CustomFrameworks",
	"Documents",
	"Entity",
	"Frameworks",
	"Functions",
	"Identity",
	"Integrations",
	"Ledger",
	"NetworkSettings",
	"NotificationPrefs",
	"Onboarding",
	"Organisation",
	"Permissions",
	"PlatformAccess",
	"PolicyPortal",
	"RiskMethod",
	"Roles",
	"SecurityChanges",
	"Settings",
	"Setup",
	"SignaturePolicy",
	"SiteTunnels",
	"SsoSetup",
	"SupplierMethod",
	"Teams",
	"WalletLink",
	"Workflows",
]);
