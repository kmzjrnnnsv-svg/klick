import { eq } from "drizzle-orm";
import {
	Bell,
	Building2,
	ChevronLeft,
	ClipboardCheck,
	Gauge,
	GitBranch,
	Hash,
	KeyRound,
	Layers,
	Plug,
	Receipt,
	ShieldCheck,
	Truck,
	Users,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { AuditRegimesPanel } from "@/components/settings/audit-regimes-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DlpPanel } from "@/components/settings/dlp-panel";
import { EntityProfilePanel } from "@/components/settings/entity-profile-panel";
import { FrameworksPanel } from "@/components/settings/frameworks-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { NumberingPanel } from "@/components/settings/numbering-panel";
import { RiskMethodPanel } from "@/components/settings/risk-method-panel";
import { RolesPanel } from "@/components/settings/roles-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { SsoPanel } from "@/components/settings/sso-panel";
import { StagePanel } from "@/components/settings/stage-panel";
import { SubscriptionPanel } from "@/components/settings/subscription-panel";
import { SupplierMethodPanel } from "@/components/settings/supplier-method-panel";
import { WalletLinkPanel } from "@/components/settings/wallet-link-panel";
import { WorkflowsPanel } from "@/components/settings/workflows-panel";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { approvalWorkflows } from "@/db/schema";
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
	resolveRiskMethod,
} from "@/lib/compliance/risk-method";
import { resolveSupplierMethod } from "@/lib/compliance/supplier-rating";
import { loadPriceTable } from "@/lib/db/pricing";
import { flushQueuedAudits, readOrg, withOrg } from "@/lib/db/with-org";
import { withDlpDefaults } from "@/lib/dlp/policy";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { recommendServices } from "@/lib/marketing/recommend";
import {
	getOrgSettings,
	listOpenAuditScopes,
	listOrgFrameworks,
	listRetiredFrameworkSlugs,
} from "@/lib/org/queries";
import { listOrgRoles } from "@/lib/org/roles";
import {
	resolveSettingsSection,
	type SettingsSectionKey,
	settingsGroups,
	visibleSettingsSections,
} from "@/lib/settings/sections";
import { cn } from "@/lib/utils";
import { listWalletLinks } from "@/lib/wallet-link-ingest/queries";

const SECTION_LABEL = {
	security: "tabSecurity",
	notifications: "tabNotifications",
	organisation: "tabOrganisation",
	frameworks: "tabFrameworks",
	rollen: "tabRoles",
	sso: "tabSso",
	integrationen: "tabIntegrations",
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
	integrationen: <Plug />,
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
	methods: "groupMethods",
} as const;

// Einstellungen nach Apple HIG (iOS-Einstellungen): gruppierte Liste der
// Bereiche; am Handy erst die Liste, dann der Bereich mit Rückweg, ab Desktop
// Liste links und Bereich rechts. Geladen wird nur, was der Bereich braucht.
export default async function SettingsPage({
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
	});
	const { key: section, chosen } = resolveSettingsSection(tab, visible);
	const t = await getTranslations("Settings");
	const sectionTitle = t(SECTION_LABEL[section]);
	const panel = await renderSection(section, ctx, {
		canEditSettings,
		t,
	});
	return (
		<>
			<div className={cn(chosen && "hidden lg:block")}>
				<PageHeader title={t("title")} />
			</div>
			{chosen && (
				<div className="lg:hidden">
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
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
				<nav
					aria-label={t("title")}
					// Am Desktop ist die Liste eine Seitenleiste: ohne Pfeile
					className={cn(
						"lg:sticky lg:top-20 lg:[&_.lucide-chevron-right]:hidden",
						chosen && "hidden lg:block",
					)}
				>
					<ListGroup>
						{settingsGroups(visible).map((g) => (
							<ListSection key={g.group} title={t(GROUP_LABEL[g.group])}>
								{g.keys.map((k) => (
									<ListRow
										key={k}
										icon={SECTION_ICON[k]}
										title={t(SECTION_LABEL[k])}
										href={`/einstellungen?tab=${k}`}
										current={chosen && k === section}
										// Ohne Wahl zeigt der Desktop den Standardbereich
										className={cn(
											!chosen &&
												k === section &&
												"lg:bg-primary/12 lg:font-semibold",
										)}
									/>
								))}
							</ListSection>
						))}
					</ListGroup>
				</nav>
				<section
					aria-labelledby="einstellungen-bereich"
					className={cn(
						"flex min-w-0 flex-col gap-6",
						!chosen && "hidden lg:flex",
					)}
				>
					<h2
						id="einstellungen-bereich"
						className="sr-only font-bold text-title-2 lg:not-sr-only"
					>
						{sectionTitle}
					</h2>
					{panel}
				</section>
			</div>
		</>
	);
}

type PageCtx = Awaited<ReturnType<typeof requireOrgPage>>;

async function renderSection(
	section: SettingsSectionKey,
	ctx: PageCtx,
	{
		canEditSettings,
		t,
	}: {
		canEditSettings: boolean;
		t: Awaited<ReturnType<typeof getTranslations<"Settings">>>;
	},
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
		case "notifications":
			return (
				<p className="text-muted-foreground text-subhead">
					{t("notificationsLead")}
				</p>
			);
		case "frameworks": {
			const cov = await getOrgCoverageCached(ctx);
			if (!cov) return null;
			const { settings, orgFws, retiredSlugs, openAudits } = await readOrg(
				octx,
				async (tx) => {
					const rows = await listOrgFrameworks(tx, ctx.orgId);
					const names = await userNames(
						tx,
						rows.map((r) => r.ownerUserId),
					);
					return {
						settings: await getOrgSettings(tx, ctx.orgId),
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
				},
			);
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
							nis2Status: cov.profile.nis2Status,
						}}
						canEdit={canEditSettings}
					/>
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
			return (
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
		case "sso":
			return (
				<SsoPanel
					providers={await listSsoProvidersForOrg(ctx.orgId)}
					callbackBase={callbackBase()}
					canEdit={ctx.orgRole === "owner"}
				/>
			);
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
			return (
				<>
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

function callbackBase(): string {
	return (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}
