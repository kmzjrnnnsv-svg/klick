import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EntityLayout } from "@/components/entity/entity-layout";
import { withMessages } from "@/components/i18n/with-messages";
import {
	ExceptionForm,
	LeftToggle,
	MatchForm,
	RevokeExceptionButton,
} from "@/components/identity/account-actions";
import { Badge } from "@/components/ui/badge";
import { ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { accountFlags } from "@/lib/identity/accounts";
import {
	identityAccountDetail,
	identityMatchOptions,
	identityPolicyFor,
} from "@/lib/identity/queries";
import {
	addMonthsIso,
	EXCEPTION_ADMIN_MAX_MONTHS,
	EXCEPTION_MAX_MONTHS,
} from "@/lib/identity/rules";

const fmtDay = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ein Konto aus Entra ID (Teil D, I1b): Stand beim letzten Abruf, Person in
// Klick, „ausgeschieden“ und Ausnahmen. Klick ändert nie etwas im Tenant.
async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
	const ctx = await requireOrgPage({ identity: ["read"] });
	const { id } = await params;
	if (!UUID.test(id)) notFound();
	const t = await getTranslations("IdentityAccounts");
	const now = new Date();
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const detail = await identityAccountDetail(tx, ctx.orgId, id, now);
		if (!detail) return null;
		return {
			...detail,
			policy: await identityPolicyFor(tx, ctx.orgId),
			options: await identityMatchOptions(tx, ctx.orgId),
		};
	});
	if (!data) notFound();
	const a = data.account;
	const flags = accountFlags(a, now, data.policy);
	const canEdit = allows(ctx, { identity: ["update"] });
	const isAdmin = a.isAdmin || a.isTopAdmin;
	const today = now.toISOString().slice(0, 10);
	const maxDate = addMonthsIso(
		today,
		isAdmin ? EXCEPTION_ADMIN_MAX_MONTHS : EXCEPTION_MAX_MONTHS,
	) as string;
	// Ausnahme gilt mindestens bis morgen (heute wäre schon abgelaufen)
	const minDate = new Date(now.getTime() + 86_400_000)
		.toISOString()
		.slice(0, 10);
	const active = data.exceptions.find(
		(e) => e.revokedAt === null && e.expiresAt >= today,
	);
	const yesNo = (v: boolean | null) =>
		v === null ? t("unknown") : v ? t("yes") : t("no");

	const facts: [string, string][] = [
		[t("factSource"), "Microsoft Entra ID"],
		[t("colKind"), a.kind === "guest" ? t("guest") : t("member")],
		[t("factEnabled"), a.enabled ? t("yes") : t("no")],
		[t("colMfa"), yesNo(a.mfaRegistered)],
		[
			t("colSignIn"),
			a.lastSignInAt ? fmtDay.format(a.lastSignInAt) : t("never"),
		],
		[
			t("factCreated"),
			a.createdAtSource ? fmtDay.format(a.createdAtSource) : t("unknown"),
		],
		[t("factLeave"), a.leaveAt ? fmtDay.format(a.leaveAt) : "–"],
		[t("factFirstSeen"), fmtDay.format(a.firstSeenAt)],
		[t("factLastSeen"), fmtDay.format(a.lastSeenAt)],
	];

	return (
		<EntityLayout
			back={{ href: "/team/konten", label: t("title") }}
			eyebrow={t("eyebrow")}
			title={a.displayName}
			subtitle={a.email ?? undefined}
			status={
				<span className="flex flex-wrap gap-1">
					{isAdmin && (
						<Badge variant={a.isTopAdmin ? "destructive" : "default"}>
							{t("admin")}
						</Badge>
					)}
					{a.kind === "guest" && <Badge variant="warning">{t("guest")}</Badge>}
					{!a.enabled && <Badge variant="muted">{t("disabled")}</Badge>}
					{flags.left && <Badge variant="destructive">{t("left")}</Badge>}
					{flags.inactive && <Badge variant="warning">{t("inactive")}</Badge>}
					{flags.neverSignedIn && (
						<Badge variant="warning">{t("neverSignedIn")}</Badge>
					)}
					{flags.missing && <Badge variant="muted">{t("missing")}</Badge>}
				</span>
			}
			aside={
				<dl className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead">
					{facts.map(([k, v]) => (
						<div key={k} className="flex justify-between gap-3">
							<dt className="text-muted-foreground">{k}</dt>
							<dd className="text-right tabular-nums">{v}</dd>
						</div>
					))}
				</dl>
			}
		>
			<div className="flex flex-col gap-8">
				{isAdmin && (
					<section className="flex flex-col gap-2">
						<h2 className="font-semibold text-title-3">{t("rolesTitle")}</h2>
						<ul className="flex flex-wrap gap-1">
							{a.adminRoles.map((r) => (
								<li key={r}>
									<Badge variant="outline" translate="no">
										{r}
									</Badge>
								</li>
							))}
						</ul>
					</section>
				)}

				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-title-3">{t("personTitle")}</h2>
					<p className="text-muted-foreground text-subhead">
						{a.matchedName
							? t("personIs", { name: a.matchedName })
							: t("personNone")}
					</p>
					{canEdit && (
						<MatchForm
							accountId={a.id}
							value={
								a.matchMode === "manual" ? (a.matchedUserId ?? "none") : "auto"
							}
							options={data.options}
						/>
					)}
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-title-3">{t("leftTitle")}</h2>
					<p className="text-muted-foreground text-subhead">
						{a.markedLeftAt
							? t("leftSince", { date: fmtDay.format(a.markedLeftAt) })
							: t("leftLead", { days: data.policy.leaverGraceDays })}
					</p>
					{canEdit && (
						<LeftToggle accountId={a.id} left={a.markedLeftAt !== null} />
					)}
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="font-semibold text-title-3">{t("exceptionTitle")}</h2>
					<p className="text-muted-foreground text-subhead">
						{active
							? t("exceptionActive", {
									kind: t(`kind_${active.kind}`),
									date: fmtDay.format(new Date(active.expiresAt)),
								})
							: t("exceptionLead")}
					</p>
					{canEdit && !active && (
						<ExceptionForm
							accountId={a.id}
							maxDate={maxDate}
							minDate={minDate}
							ownAccount={a.matchedUserId === ctx.userId}
						/>
					)}
					{data.exceptions.length > 0 && (
						<ListSection>
							{data.exceptions.map((e) => (
								<ListRow
									key={e.id}
									title={`${t(`kind_${e.kind}`)} · ${t("exceptionUntil", {
										date: fmtDay.format(new Date(e.expiresAt)),
									})}`}
									subtitle={
										<>
											<span className="block break-words">{e.reason}</span>
											<span className="block">
												{t("exceptionBy", {
													name: e.createdByName ?? t("unknownPerson"),
													date: fmtDay.format(e.createdAt),
												})}
												{e.revokedAt &&
													` · ${t("exceptionRevokedAt", { date: fmtDay.format(e.revokedAt) })}`}
											</span>
										</>
									}
									accessory={
										canEdit && e.id === active?.id ? (
											<RevokeExceptionButton exceptionId={e.id} />
										) : undefined
									}
								/>
							))}
						</ListSection>
					)}
				</section>
				<p className="text-footnote text-muted-foreground">{t("readOnly")}</p>
			</div>
		</EntityLayout>
	);
}

export default withMessages(AccountPage, [
	"Auth",
	"Common",
	"IdentityAccounts",
]);
