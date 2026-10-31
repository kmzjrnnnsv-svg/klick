import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VerifyChainButton } from "@/components/admin/verify-chain-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { buildInfo } from "@/lib/admin/build-info";
import type { Level } from "@/lib/admin/overview";
import {
	anchorLevel,
	chainLevel,
	countEvents,
	groupOf,
	lockboxSummary,
	releaseLabel,
	SECURITY_WINDOW_DAYS,
} from "@/lib/admin/security";
import { deviceLabel } from "@/lib/admin/users";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import {
	lastChainCheck,
	securityEvents,
	securityNames,
} from "@/lib/db/admin-security";
import { latestAnchor } from "@/lib/db/ledger";
import { allGrants } from "@/lib/db/platform-access";
import { withPlatform } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { PROD_RISKS, type ProdRisk } from "@/lib/env-checks";

const LEVEL_BADGE: Record<
	Level,
	"success" | "warning" | "destructive" | "muted"
> = {
	ok: "success",
	warn: "warning",
	bad: "destructive",
	unknown: "muted",
};

// Admin > Sicherheit (Admin-Portal, Teil 4): Ereignisse der letzten 7 Tage
// aus dem Plattform-Protokoll, Zugriffe durch Klick (Lockbox), Prüfung der
// Ketten, Verlauf-Anker, hingenommene Risiken und Release-Stand. Nur
// Plattform-Metadaten; Ereignisse in der Kette einer Org bleiben dort.
export default async function AdminSecurityPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("AdminSecurity");
	const ta = await getTranslations("Admin");
	const now = new Date();
	const since = new Date(
		now.getTime() - SECURITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);
	const [{ events, chain }, grants, anchor] = await Promise.all([
		withPlatform(
			{
				userId: admin.userId,
				ip: admin.ip,
				userAgent: admin.userAgent,
				reason: "Admin: Sicherheit (Ereignisse und Kettenprüfung)",
			},
			async (tx) => ({
				events: await securityEvents(tx, since),
				chain: await lastChainCheck(tx),
			}),
		),
		allGrants(500),
		latestAnchor({}),
	]);
	const counts = countEvents(events, now);
	const lockbox = lockboxSummary(grants, now);
	const chainState = chainLevel(chain, now);
	const anchorState = anchorLevel(anchor, now);
	const build = buildInfo();
	const release = releaseLabel(build);
	const production = env().NODE_ENV === "production";
	const accepted = production
		? env().PROD_ACCEPT_RISKS.filter((k): k is ProdRisk => k in PROD_RISKS)
		: [];
	const recent = events
		.filter(
			(e) =>
				!(groupOf(e.action) === "failed_signin" && e.outcome === "success"),
		)
		.slice(0, 15);
	const names = await securityNames(
		[
			...new Set(
				recent
					.flatMap((e) => [
						e.actorUserId,
						e.target?.startsWith("user:") ? e.target.slice(5) : null,
					])
					.filter((x): x is string => Boolean(x)),
			),
		],
		chain?.broken.filter((b) => b !== "platform") ?? [],
	);

	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const when = (d: Date | null | undefined) => (d ? fmt.format(d) : "—");
	const levelBadge = (level: Level, text: string) => (
		<Badge variant={LEVEL_BADGE[level]}>{text}</Badge>
	);
	const subjectOf = (e: (typeof recent)[number]) => {
		const target = e.target?.startsWith("user:") ? e.target.slice(5) : null;
		const id = target ?? e.actorUserId;
		return id ? { id, name: names.users.get(id) ?? id.slice(0, 8) } : null;
	};

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader title={ta("security")} lead={t("lead")} />
			<ListGroup>
				<ListSection
					title={t("sectionEvents", { days: SECURITY_WINDOW_DAYS })}
					footer={t("eventsFooter")}
				>
					{counts.map((c) => (
						<ListRow
							key={c.key}
							title={t(`group_${c.key}`)}
							subtitle={t(`groupHint_${c.key}`)}
							accessory={
								c.n > 0 ? (
									levelBadge(c.level, String(c.n))
								) : (
									<span className="text-muted-foreground tabular-nums">0</span>
								)
							}
						/>
					))}
				</ListSection>

				<ListSection title={t("sectionRecent")}>
					{recent.length === 0 ? (
						<ListRow title={t("recentEmpty")} />
					) : (
						recent.map((e) => {
							const g = groupOf(e.action);
							const who = subjectOf(e);
							return (
								<ListRow
									key={e.id}
									href={who ? `/admin/users/${who.id}` : undefined}
									title={g ? t(`group_${g}`) : e.action}
									subtitle={[when(e.at), who?.name, deviceLabel(e.userAgent)]
										.filter(Boolean)
										.join(" · ")}
								/>
							);
						})
					)}
				</ListSection>

				<ListSection title={t("sectionLockbox")} footer={t("lockboxFooter")}>
					<ListRow
						href="/admin/zugriffe"
						title={t("lockboxActive")}
						value={String(lockbox.active)}
					/>
					<ListRow
						title={t("lockboxEmergencies")}
						accessory={
							lockbox.emergencies > 0
								? levelBadge("warn", String(lockbox.emergencies))
								: undefined
						}
						value={lockbox.emergencies > 0 ? undefined : "0"}
					/>
					<ListRow
						href={lockbox.reportsOverdue > 0 ? "/admin/zugriffe" : undefined}
						title={t("lockboxReports")}
						accessory={
							lockbox.reportsOverdue > 0
								? levelBadge("bad", String(lockbox.reportsOverdue))
								: undefined
						}
						value={lockbox.reportsOverdue > 0 ? undefined : "0"}
					/>
					<ListRow
						title={t("lockboxRequested")}
						value={String(lockbox.requested)}
					/>
				</ListSection>

				<ListSection title={t("sectionChain")} footer={t("chainFooter")}>
					<ListRow
						title={t("chainLast")}
						subtitle={
							chain
								? t("chainChecked", {
										date: when(chain.at),
										n: chain.checked,
									})
								: t("chainNever")
						}
						accessory={levelBadge(
							chainState.level,
							t(`chainState_${chainState.state}`),
						)}
					/>
					{chain?.broken.map((b) => (
						<ListRow
							key={b}
							href={b === "platform" ? "/admin/audit" : `/admin/orgs/${b}`}
							title={
								b === "platform"
									? t("chainPlatform")
									: (names.orgs.get(b) ?? b.slice(0, 8))
							}
							destructive
						/>
					))}
				</ListSection>
				<div>
					<VerifyChainButton />
				</div>

				<ListSection title={t("sectionAnchor")} footer={t("anchorFooter")}>
					<ListRow
						title={t("anchorLast")}
						subtitle={anchor ? when(anchor.createdAt) : t("anchorNever")}
						accessory={levelBadge(
							anchorState.level,
							t(`anchorState_${anchorState.state}`),
						)}
					/>
				</ListSection>

				<ListSection title={t("sectionRisks")} footer={t("risksFooter")}>
					{!production ? (
						<ListRow title={t("risksDev")} />
					) : accepted.length === 0 ? (
						<ListRow title={t("risksNone")} />
					) : (
						accepted.map((k) => (
							<ListRow
								key={k}
								title={PROD_RISKS[k]}
								subtitle={
									<span translate="no" className="font-mono">
										PROD_ACCEPT_RISKS={k}
									</span>
								}
								accessory={levelBadge("warn", t("riskAccepted"))}
							/>
						))
					)}
				</ListSection>

				<ListSection title={t("sectionRelease")} footer={t("releaseFooter")}>
					<ListRow
						title={t("releaseVersion")}
						subtitle={
							release ? (
								<span translate="no" className="font-mono">
									{release}
								</span>
							) : (
								t("releaseUnknown")
							)
						}
						accessory={
							build.tag
								? levelBadge("ok", t("releaseTagged"))
								: levelBadge(
										production ? "warn" : "unknown",
										t("releaseUntagged"),
									)
						}
					/>
					<ListRow title={t("releaseBuiltAt")} value={when(build.builtAt)} />
				</ListSection>
			</ListGroup>
			<p className="text-subhead text-muted-foreground">
				{t("auditHint")}{" "}
				<Link href="/admin/audit" className="underline">
					{ta("audit")}
				</Link>
			</p>
		</div>
	);
}
