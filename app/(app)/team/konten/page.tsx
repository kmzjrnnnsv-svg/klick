import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { ExportLink } from "@/components/entity/export-link";
import { type Column, RegisterPage } from "@/components/entity/register-page";
import { SummaryCard, SummaryGrid } from "@/components/entity/summary-card";
import { withMessages } from "@/components/i18n/with-messages";
import { CheckBadge } from "@/components/identity/check-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import {
	type AccountChip,
	accountFilterOf,
	accountFlags,
	accountsHref,
} from "@/lib/identity/accounts";
import {
	type AccountRow,
	identityAccountCounts,
	identityCheckViews,
	identityPolicyFor,
	identitySourceViews,
	pageIdentityAccounts,
} from "@/lib/identity/queries";
import { IDENTITY_CHECKS, type IdentityCheckKey } from "@/lib/identity/types";
import { PAGE_SIZE, pageParam, pageWindow } from "@/lib/paging";

type Search = Record<string, string | string[] | undefined>;

const CHECK_ORDER: IdentityCheckKey[] = [
	"mfa",
	"privileged",
	"leavers",
	"recert",
];

const fmtDay = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

// Konten aus Entra ID (Teil D, I1b): nur lesend, ohne eigenen Menüeintrag
// (Karte auf /team, Links vom Control). Liste seitenweise, Filter in SQL.
async function AccountsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ identity: ["read"] });
	const sp = await searchParams;
	const t = await getTranslations("IdentityAccounts");
	const filter = accountFilterOf(sp);
	const page = pageParam(sp.seite);
	const now = new Date();
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const policy = await identityPolicyFor(tx, ctx.orgId);
		const [sources, checks, counts, list] = await Promise.all([
			identitySourceViews(tx, ctx.orgId, now),
			identityCheckViews(tx, ctx.orgId),
			identityAccountCounts(tx, ctx.orgId, now, policy),
			pageIdentityAccounts(tx, ctx.orgId, {
				filter,
				...pageWindow(page),
				now,
				policy,
			}),
		]);
		return { policy, sources, checks, counts, list };
	});
	const connected = data.sources.filter((s) => s.status !== "pending_consent");
	const isOwner = ctx.orgRole === "owner";
	const canExport = allows(ctx, { export: ["create"] });
	const back = { href: "/team", label: t("backTeam") };

	if (connected.length === 0)
		return (
			<RegisterPage<AccountRow>
				back={back}
				title={t("title")}
				lead={t("lead")}
				filters={[]}
				columns={[]}
				rows={[]}
				rowHref={() => "/team/konten"}
				empty={
					<EmptyState
						title={t("emptyTitle")}
						lead={isOwner ? t("emptyOwner") : t("emptyOther")}
						actions={
							isOwner ? (
								<Button asChild>
									<Link href="/einstellungen?tab=integrationen">
										{t("connect")}
									</Link>
								</Button>
							) : undefined
						}
					/>
				}
			/>
		);

	const byKey = new Map(data.checks.map((c) => [c.key, c]));
	const chipCount: Record<AccountChip, number> = {
		ohne_mfa: data.counts.withoutMfa,
		admins: data.counts.admins,
		gaeste: data.counts.guests,
		inaktiv: data.counts.inactive,
		ausgeschieden: data.counts.left,
		ausnahmen: data.counts.exceptions,
	};
	const lastSync = connected
		.map((s) => s.lastSyncAt)
		.filter(Boolean)
		.sort((a, b) => (a as Date).getTime() - (b as Date).getTime())[0] as
		| Date
		| undefined;

	const summary = (
		<SummaryGrid>
			<SummaryCard title={t("summaryChecks")}>
				<ul className="flex flex-col gap-2 text-subhead">
					{CHECK_ORDER.map((key) => {
						const c = byKey.get(key);
						return (
							<li
								key={key}
								className="flex flex-wrap items-center justify-between gap-2"
							>
								<Link
									href={`/controls/${IDENTITY_CHECKS[key]}#automatisch`}
									className="hit-area underline-offset-4 hover:underline"
								>
									{t(`check_${key}`)}
								</Link>
								<span className="flex items-center gap-2">
									<CheckBadge result={c?.result ?? "not_assessable"} />
									{c && c.affectedCount > 0 && (
										<Link
											href={accountsHref({ check: key })}
											className="hit-area text-footnote text-muted-foreground underline-offset-4 hover:underline"
										>
											{t("affected", { n: c.affectedCount })}
										</Link>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			</SummaryCard>
			<SummaryCard title={t("summaryAccounts")}>
				<p className="mb-3 flex items-baseline gap-2">
					<span className="font-semibold text-large-title tabular-nums">
						{data.counts.all}
					</span>
					<span className="text-footnote text-muted-foreground">
						{lastSync
							? t("syncedAt", { at: fmtDay.format(lastSync) })
							: t("syncedNever")}
					</span>
				</p>
				<ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-subhead">
					{(Object.keys(chipCount) as AccountChip[]).map((chip) => (
						<li key={chip}>
							<Link
								href={accountsHref({ chips: [chip] })}
								className="hit-area flex justify-between gap-2 underline-offset-4 hover:underline"
							>
								<span>{t(`chip_${chip}`)}</span>
								<span className="tabular-nums text-muted-foreground">
									{chipCount[chip]}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</SummaryCard>
		</SummaryGrid>
	);

	const yesNo = (v: boolean | null) =>
		v === null ? t("unknown") : v ? t("yes") : t("no");

	const columns: Column<AccountRow>[] = [
		{
			key: "account",
			header: t("colAccount"),
			className: "max-w-56",
			cell: (r) => (
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium">{r.displayName}</span>
					{r.email && (
						<span className="truncate text-footnote text-muted-foreground">
							{r.email}
						</span>
					)}
				</span>
			),
		},
		{
			key: "admin",
			header: t("colAdmin"),
			cell: (r) =>
				r.isAdmin || r.isTopAdmin ? (
					<span className="flex flex-wrap gap-1">
						<Badge variant={r.isTopAdmin ? "destructive" : "default"}>
							{r.adminRoles[0] ?? t("admin")}
						</Badge>
						{r.adminRoles.length > 1 && (
							<span className="text-footnote text-muted-foreground">
								{t("moreRoles", { n: r.adminRoles.length - 1 })}
							</span>
						)}
					</span>
				) : (
					<span className="text-muted-foreground">–</span>
				),
		},
		{
			key: "mfa",
			header: t("colMfa"),
			cell: (r) => (
				<Badge
					variant={
						r.mfaRegistered === false
							? "destructive"
							: r.mfaRegistered
								? "success"
								: "muted"
					}
				>
					{yesNo(r.mfaRegistered)}
				</Badge>
			),
		},
		{
			key: "signIn",
			header: t("colSignIn"),
			className: "whitespace-nowrap",
			cell: (r) => {
				const f = accountFlags(r, now, data.policy);
				return (
					<span className="flex flex-col items-start gap-1">
						<span className="tabular-nums">
							{r.lastSignInAt ? fmtDay.format(r.lastSignInAt) : t("never")}
						</span>
						{f.inactive && <Badge variant="warning">{t("inactive")}</Badge>}
						{f.neverSignedIn && (
							<Badge variant="warning">{t("neverSignedIn")}</Badge>
						)}
					</span>
				);
			},
		},
		{
			key: "person",
			header: t("colPerson"),
			mobile: false,
			className: "max-xl:hidden",
			cell: (r) =>
				r.matchedName ? (
					<span className="block max-w-44 truncate" title={r.matchedName}>
						{r.matchedName}
					</span>
				) : (
					<span className="text-muted-foreground">–</span>
				),
		},
		{
			key: "notes",
			header: t("colNotes"),
			cell: (r) => {
				const f = accountFlags(r, now, data.policy);
				return (
					<span className="flex flex-wrap gap-1">
						{r.kind === "guest" && (
							<Badge variant="warning">{t("guest")}</Badge>
						)}
						{!r.enabled && <Badge variant="muted">{t("disabled")}</Badge>}
						{f.missing && <Badge variant="muted">{t("missing")}</Badge>}
						{f.left && <Badge variant="destructive">{t("left")}</Badge>}
						{r.exceptionUntil && (
							<Badge variant="outline">
								{t("exceptionUntil", {
									date: fmtDay.format(new Date(r.exceptionUntil)),
								})}
							</Badge>
						)}
					</span>
				);
			},
		},
	];

	const query = new URLSearchParams();
	for (const [k, v] of Object.entries(sp))
		if (typeof v === "string" && k !== "seite") query.set(k, v);
	const csvHref = `/api/export/konten.csv${query.size > 0 ? `?${query}` : ""}`;

	return (
		<RegisterPage<AccountRow>
			back={back}
			title={t("title")}
			lead={t("lead")}
			actions={
				<span className="flex flex-wrap gap-2">
					<Button asChild variant="secondary">
						<Link href="/team/zugriffspruefung">{t("toReview")}</Link>
					</Button>
					{canExport && (
						<Button asChild variant="secondary">
							<ExportLink href={csvHref}>{t("csv")}</ExportLink>
						</Button>
					)}
				</span>
			}
			summary={summary}
			filters={[
				{
					key: "status",
					label: t("filterState"),
					options: [
						{ value: "aktiv", label: t("state_aktiv") },
						{ value: "deaktiviert", label: t("state_deaktiviert") },
						{ value: "verschwunden", label: t("state_verschwunden") },
					],
				},
				{
					key: "person",
					label: t("filterPerson"),
					options: [
						{ value: "zugeordnet", label: t("person_zugeordnet") },
						{ value: "ohne", label: t("person_ohne") },
					],
				},
				{
					key: "pruefung",
					label: t("filterCheck"),
					options: CHECK_ORDER.filter((k) => k !== "recert").map((k) => ({
						value: k,
						label: t(`check_${k}`),
					})),
				},
			]}
			chips={(Object.keys(chipCount) as AccountChip[]).map((c) => ({
				key: c,
				label: t(`chip_${c}`),
			}))}
			searchPlaceholder={t("search")}
			columns={columns}
			rows={data.list.rows}
			rowHref={(r) => `/team/konten/${r.id}`}
			empty={<EmptyState title={t("noMatch")} lead={t("noMatchHint")} />}
			paging={{
				page,
				total: data.list.total,
				pageSize: PAGE_SIZE,
				path: "/team/konten",
				query: sp,
			}}
		/>
	);
}

export default withMessages(AccountsPage, ["Auth", "Common", "Entity"]);
