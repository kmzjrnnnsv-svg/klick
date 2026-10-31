import { and, eq, isNull, ne } from "drizzle-orm";
import { Check } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GovernanceModeControl } from "@/components/settings/governance-mode-control";
import { ActivityStep } from "@/components/setup/activity-step";
import { BoardStep } from "@/components/setup/board-step";
import { CompanyStep } from "@/components/setup/company-step";
import { FrameworksStep } from "@/components/setup/frameworks-step";
import { GapStep } from "@/components/setup/gap-step";
import { ItDataStep } from "@/components/setup/it-data-step";
import { RolesStep } from "@/components/setup/roles-step";
import { SitesStep } from "@/components/setup/sites-step";
import { StepFooter } from "@/components/setup/step-footer";
import {
	controlImplementations,
	controls,
	orgSettings,
	providers,
	roleAssignments,
	sites,
} from "@/db/schema";
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";
import { loadAiPolicy } from "@/lib/ai/service";
import { governanceModeOf } from "@/lib/approvals/governance-mode";
import { approvalProgressFor } from "@/lib/approvals/service";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { listPendingInvitations } from "@/lib/auth/org";
import { allows } from "@/lib/auth/permissions";
import { isEffective } from "@/lib/compliance/appointments";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import {
	areaOf,
	RESPONSIBILITY_AREAS,
	suggestAreaFunction,
} from "@/lib/compliance/catalog/domain-functions";
import { FRAMEWORK_PROFILES } from "@/lib/compliance/catalog/framework-profiles";
import { requiredFunctions } from "@/lib/compliance/catalog/required-functions";
import { suggestFrameworks } from "@/lib/compliance/company-profile";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { whoHoldsWhat } from "@/lib/compliance/function-holders";
import { isOwnRoleKey } from "@/lib/compliance/function-key";
import {
	getOrgProfile,
	listMembersForPicker,
	userNames,
} from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { termsAccepted } from "@/lib/legal/terms";
import { loadRoleBoard } from "@/lib/org/role-board-data";
import {
	isSetupStep,
	neighbours,
	SETUP_STEPS,
	setupState,
	stepHref,
} from "@/lib/setup/steps";

// Grundausstattung an Funktionen, solange noch keine Rahmenwerke feststehen
const BASE_FUNCTIONS: readonly RoleFunction[] = [
	"management_body",
	"department_head",
	"isb_ciso",
	"dpo",
	"compliance",
	"risk_control",
	"outsourcing_officer",
	"incident_manager",
	"bcm_manager",
	"internal_audit",
];

export default async function SetupStepPage({
	params,
	searchParams,
}: {
	params: Promise<{ schritt: string }>;
	searchParams: Promise<{ ansicht?: string | string[] }>;
}) {
	const { schritt } = await params;
	if (!isSetupStep(schritt)) notFound();
	const ctx = await requireOrgPage({ settings: ["update"] });
	const { ansicht } = await searchParams;
	const t = await getTranslations("Setup");
	const tf = await getTranslations("Functions");
	const tcl = await getTranslations("Controls");
	// Rollen-Tafel (individuell): offene Einladungen stehen als Personen bereit
	const invitations =
		schritt === "rollen" ? await listPendingInvitations(ctx.orgId) : [];

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const profile = await getOrgProfile(tx, ctx.orgId);
		const [s] = await tx
			.select({
				flags: orgSettings.setupFlags,
				entity: orgSettings.entityProfile,
				areaFunctions: orgSettings.areaFunctions,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		const base = { profile, flags: s?.flags ?? {}, entity: s?.entity ?? {} };
		switch (schritt) {
			case "rollen": {
				const rows = await tx
					.select({
						id: roleAssignments.id,
						function: roleAssignments.function,
						userId: roleAssignments.userId,
						externalName: roleAssignments.externalName,
						pendingEmail: roleAssignments.pendingEmail,
						deputyUserId: roleAssignments.deputyUserId,
						appointedAt: roleAssignments.appointedAt,
						createdAt: roleAssignments.createdAt,
						status: roleAssignments.status,
						decisionNote: roleAssignments.decisionNote,
					})
					.from(roleAssignments)
					.where(
						and(
							eq(roleAssignments.organizationId, ctx.orgId),
							ne(roleAssignments.status, "revoked"),
							// eigene Rollen stehen auf der Rollen-Tafel (individuell)
							isNull(roleAssignments.orgRoleId),
						),
					)
					.orderBy(roleAssignments.appointedAt, roleAssignments.createdAt);
				// Stand der Bestellung (wartet auf die Geschäftsleitung, 1 von 2)
				const progress = await approvalProgressFor(
					tx,
					ctx.orgId,
					"role_assignment",
					rows.filter((r) => r.status !== "appointed").map((r) => r.id),
				);
				const names = await userNames(
					tx,
					rows.flatMap((r) => [r.userId, r.deputyUserId]),
				);
				// Standard oder individuell (ADR-024); individuell mit Rollen-Tafel
				const mode = await governanceModeOf(tx, ctx.orgId);
				return {
					...base,
					mode,
					board:
						mode === "individual" && profile
							? await loadRoleBoard(tx, ctx.orgId, {
									required: requiredFunctions(
										profile.frameworks,
										profile.profile.licenceStage,
									).map((r) => r.function),
									functionLabels: Object.fromEntries(
										ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
									),
									areaLabel: (area) =>
										area === "privacy"
											? t("areaPrivacy")
											: tcl(`domain_${area}` as "domain_governance"),
									invitations,
								})
							: null,
					assignments: rows.map((r) => ({
						...r,
						progress: progress.get(r.id) ?? null,
					})),
					names,
					members: await listMembersForPicker(tx, ctx.orgId),
					areaFunctions: s?.areaFunctions ?? {},
					controlOwners: await tx
						.select({
							code: controls.code,
							domain: controls.domain,
							ownerFunction: controlImplementations.ownerFunction,
							ownerUserId: controlImplementations.ownerUserId,
						})
						.from(controlImplementations)
						.innerJoin(
							controls,
							eq(controls.id, controlImplementations.controlId),
						)
						.where(eq(controlImplementations.organizationId, ctx.orgId)),
				};
			}
			case "standorte":
				return {
					...base,
					sites: await tx
						.select()
						.from(sites)
						.where(eq(sites.organizationId, ctx.orgId))
						.orderBy(sites.createdAt),
				};
			case "it-daten":
				return {
					...base,
					aiMaxClass: (await loadAiPolicy(tx, ctx.orgId)).maxClass,
					providerNames: (
						await tx
							.select({ name: providers.name })
							.from(providers)
							.where(eq(providers.organizationId, ctx.orgId))
					).map((p) => p.name),
				};
			default:
				return base;
		}
	});
	// Vom Klick-Betrieb angelegte Organisation: zuerst Nutzungsbedingungen
	if (ctx.orgRole === "owner" && !termsAccepted(data.flags))
		redirect("/zustimmung");
	if (!data.profile) notFound();
	const { profile, entity } = data;
	const state = setupState(data.flags);
	const done = new Set(state.done);
	const idx = SETUP_STEPS.indexOf(schritt);
	const nav = neighbours(schritt);
	const nextHref = nav.next ? stepHref(nav.next) : "/heute";
	const fwNames = Object.fromEntries(
		CATALOG_FRAMEWORKS.map((f) => [f.slug, f.name]),
	);

	return (
		<div className="flex flex-col gap-8">
			<nav aria-label={t("title")} className="flex flex-col gap-3">
				<p className="font-medium text-footnote text-muted-foreground">
					{t("eyebrow")} ·{" "}
					{t("stepOf", { n: idx + 1, total: SETUP_STEPS.length })}
				</p>
				<ol className="flex flex-wrap gap-1.5">
					{SETUP_STEPS.map((s, i) => (
						<li key={s}>
							<Link
								href={stepHref(s)}
								aria-current={s === schritt ? "step" : undefined}
								className={`inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-full px-3 text-footnote ${
									s === schritt
										? "bg-primary-fill text-white"
										: done.has(s)
											? "bg-success/12 text-foreground hover:bg-success/20"
											: "bg-muted text-muted-foreground hover:bg-foreground/12"
								}`}
							>
								<span className="tabular-nums">
									{done.has(s) ? (
										<>
											<Check aria-hidden="true" className="size-4" />
											<span className="sr-only">{t("stepDone")}</span>
										</>
									) : (
										i + 1
									)}
								</span>
								{t(`step_${s}`)}
							</Link>
						</li>
					))}
				</ol>
			</nav>
			<header className="flex flex-col gap-2">
				<h1 className="font-bold text-title-1">{t(`step_${schritt}`)}</h1>
				<p className="max-w-2xl text-muted-foreground text-subhead">
					{t(`lead_${schritt}`)}
				</p>
			</header>

			{schritt === "rollen" &&
				"assignments" in data &&
				(() => {
					const req = requiredFunctions(
						profile.frameworks,
						profile.profile.licenceStage,
					);
					// oben: Pflichtfunktionen (ohne Rahmenwerke die Grundausstattung)
					// und alles, was schon besetzt ist; der Rest unter „Weitere“
					const main = new Set<RoleFunction>([
						...req.map((r) => r.function),
						...(req.length === 0 ? BASE_FUNCTIONS : []),
						...data.assignments.map((a) => a.function),
					]);
					const order = ROLE_FUNCTIONS.filter((f) => f !== "other");
					const functions = [
						...order.filter((f) => main.has(f)),
						...order.filter((f) => !main.has(f)),
					].map((f) => {
						const r = req.find((x) => x.function === f);
						return {
							function: f,
							title: tf(f),
							hint: r?.hint ?? null,
							legalBasis: r?.legalBasis ?? null,
							required: Boolean(r),
							deputyRequired: Boolean(r?.deputyRequired),
							more: !main.has(f),
						};
					});
					const named = data.assignments.map((a) => ({
						...a,
						userName: a.userId ? (data.names.get(a.userId) ?? null) : null,
						deputyName: a.deputyUserId
							? (data.names.get(a.deputyUserId) ?? null)
							: null,
					}));
					// Bereiche → Funktion: gespeichert, sonst die Funktion, die den
					// Bereich schon trägt, sonst der Vorschlag aus dem Katalog
					const held = new Set(
						data.assignments
							.filter((a) => isEffective(a.status))
							.map((a) => a.function),
					);
					const areas = RESPONSIBILITY_AREAS.map((area) => {
						const rows = data.controlOwners.filter((c) => areaOf(c) === area);
						const counts = new Map<RoleFunction, number>();
						for (const r of rows)
							if (r.ownerFunction && !isOwnRoleKey(r.ownerFunction))
								counts.set(
									r.ownerFunction,
									(counts.get(r.ownerFunction) ?? 0) + 1,
								);
						const current =
							[...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
						// die Einrichtung kennt nur Katalog-Funktionen (eigene Rollen:
						// Rollen-Tafel im individuellen Modus)
						const stored = data.areaFunctions[area] ?? null;
						const saved =
							stored && !isOwnRoleKey(stored) ? (stored as RoleFunction) : null;
						return {
							area,
							label:
								area === "privacy" ? t("areaPrivacy") : tcl(`domain_${area}`),
							total: rows.length,
							open: rows.filter(
								(r) =>
									!r.ownerFunction &&
									(!r.ownerUserId || r.ownerUserId === ctx.userId),
							).length,
							initial:
								(saved && held.has(saved) ? saved : null) ??
								current ??
								suggestAreaFunction(area, held),
						};
					});
					const anyControls = data.controlOwners.length > 0;
					const board =
						data.board &&
						(Array.isArray(ansicht) ? ansicht[0] : ansicht) !== "liste"
							? data.board
							: null;
					return (
						<div className="flex flex-col gap-8">
							<GovernanceModeControl
								mode={data.mode}
								canSwitch={ctx.orgRole === "owner"}
								variant="setup"
							/>
							{data.board && (
								<nav
									aria-label={t("modeTitle")}
									className="grid grid-cols-2 gap-1 self-start rounded-xl bg-muted p-1"
								>
									{(
										[
											["tafel", t("boardBoard")],
											["liste", t("boardList")],
										] as const
									).map(([v, label]) => (
										<Link
											key={v}
											href={
												v === "tafel"
													? stepHref("rollen")
													: `${stepHref("rollen")}?ansicht=liste`
											}
											aria-current={
												(v === "tafel") === Boolean(board) ? "page" : undefined
											}
											className={`flex min-h-(--control-h) items-center justify-center rounded-lg px-3 text-subhead ${
												(v === "tafel") === Boolean(board)
													? "bg-background font-medium shadow-sm"
													: "text-muted-foreground hover:text-foreground"
											}`}
										>
											{label}
										</Link>
									))}
								</nav>
							)}
							{board ? (
								<BoardStep
									{...board}
									canEdit={allows(ctx, { role_assignment: ["update"] })}
									nextHref={nextHref}
								/>
							) : (
								<RolesStep
									functions={functions}
									areas={areas.filter((a) =>
										anyControls ? a.total > 0 : a.initial !== null,
									)}
									heldFunctions={order
										.filter((f) => held.has(f))
										.map((f) => ({ function: f, title: tf(f) }))}
									assignments={named}
									people={whoHoldsWhat(
										named.filter((a) => a.status !== "rejected"),
										(fn) => tf(fn as RoleFunction),
									)}
									members={data.members}
									currentUserId={ctx.userId}
									nextHref={nextHref}
								/>
							)}
						</div>
					);
				})()}
			{schritt === "unternehmen" && (
				<CompanyStep
					initial={entity}
					sector={profile.profile.sector}
					nextHref={nextHref}
				/>
			)}
			{schritt === "standorte" && "sites" in data && (
				<SitesStep
					sites={data.sites.map((s) => ({
						id: s.id,
						name: s.name,
						kind: s.kind,
						country: s.country,
						city: s.city,
						employees: s.employees,
						critical: s.critical,
					}))}
					defaultCountry={entity.country ?? "DE"}
					nextHref={nextHref}
				/>
			)}
			{schritt === "taetigkeit" && (
				<ActivityStep
					initial={{
						sector: profile.profile.sector,
						licenceStage: profile.profile.licenceStage,
						caspServices: [...profile.profile.caspServices],
						issuesTokens: profile.profile.issuesTokens,
						digitalProducts: entity.digitalProducts ?? false,
					}}
					nextHref={nextHref}
				/>
			)}
			{schritt === "it-daten" && "providerNames" in data && (
				<ItDataStep
					initial={entity}
					aiMaxClass={"aiMaxClass" in data ? data.aiMaxClass : "none"}
					existingProviders={data.providerNames}
					nextHref={nextHref}
				/>
			)}
			{schritt === "rahmenwerke" && (
				<FrameworksStep
					suggestions={suggestFrameworks({
						sector: profile.profile.sector,
						licenceStage: profile.profile.licenceStage,
						caspServices: [...profile.profile.caspServices],
						issuesTokens: profile.profile.issuesTokens,
						hasProducts: entity.digitalProducts ?? false,
						entity,
					})}
					all={CATALOG_FRAMEWORKS.map((f) => ({
						slug: f.slug,
						name: f.name,
						description: f.description,
					}))}
					active={profile.frameworks}
					profile={{
						sector: profile.profile.sector,
						licenceStage: profile.profile.licenceStage,
						caspServices: [...profile.profile.caspServices],
					}}
					names={fwNames}
					shortNames={Object.fromEntries(
						CATALOG_FRAMEWORKS.map((f) => [f.slug, shortFrameworkName(f.slug)]),
					)}
					simple={Object.fromEntries(
						Object.entries(FRAMEWORK_PROFILES).map(([k, p]) => [k, p.simple]),
					)}
					nextHref={nextHref}
				/>
			)}
			{schritt === "gap-analyse" && (
				<GapStep
					frameworks={profile.frameworks.map((slug) => ({
						slug,
						name: fwNames[slug] ?? slug,
					}))}
				/>
			)}

			<StepFooter
				prevHref={nav.prev ? stepHref(nav.prev) : null}
				showLater={!state.completed}
			/>
		</div>
	);
}
