import {
	IssueMandateDialog,
	RevokeMandateButton,
} from "@wallet/components/wallet/mandates";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { currentAccessPolicy } from "@wallet/lib/orgs/access";
import { allowedAssetsOn } from "@wallet/lib/orgs/access-policy";
import { listMembers } from "@wallet/lib/orgs/members";
import {
	effectiveStatus,
	listAddressBook,
} from "@wallet/lib/wallet/address-book";
import { listMandates } from "@wallet/lib/wallet/mandates";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { amountText } from "@/lib/wallet/display";

export const metadata: Metadata = { title: "Vollmachten" };

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

// /mandates — Vollmachten (Härtung W): Inhaber:innen stellen sie per
// Sicherheitsschlüssel aus und widerrufen sie, die Bedienung sieht ihre
// eigenen mit Restbetrag. Ob Auszahlungen eine brauchen, steht unter
// Einstellungen > Zugang.
export default async function MandatesPage() {
	const ctx = await requireUnlockedPage("/mandates", "wallet:initiate");
	const owner = roleAllows(ctx.role, "wallet:manage");
	const t = await getTranslations("Mandates");
	const now = new Date();
	const policy = await currentAccessPolicy(ctx.orgId);
	const [data, members] = await Promise.all([
		readOrg(toOrgCtx(ctx), async (tx) => ({
			mandates: await listMandates(
				tx,
				ctx.orgId,
				owner ? undefined : ctx.userId,
			),
			book: owner
				? (await listAddressBook(tx, ctx.orgId)).filter(
						(r) => effectiveStatus(r, now) === "active",
					)
				: [],
		})),
		owner ? listMembers(toOrgCtx(ctx)) : Promise.resolve([]),
	]);
	const operators = members
		.filter((m) => m.role === "operator")
		.map((m) => ({ id: m.userId, name: m.name || m.email }));
	const networks = [...new Set(data.book.map((b) => b.network))]
		.map((key: WalletNetwork) => ({
			key,
			label: NETWORKS[key].label,
			assets: allowedAssetsOn(policy, key),
		}))
		.filter((n) => n.assets.length > 0);
	const active = data.mandates.filter(
		(m) => !m.revokedAt && m.validUntil > now,
	);
	const ended = data.mandates.filter((m) => m.revokedAt || m.validUntil <= now);
	const row = (m: (typeof data.mandates)[number], live: boolean) => (
		<ListRow
			key={m.id}
			title={
				owner
					? t("rowOwner", {
							grantee: m.grantee,
							total: amountText(m.network, m.asset, m.total),
						})
					: t("rowOwn", { total: amountText(m.network, m.asset, m.total) })
			}
			subtitle={t("rowDetail", {
				used: amountText(m.network, m.asset, m.used),
				perPayout: amountText(m.network, m.asset, m.perPayout),
				count: m.destinations,
				until: fmt.format(m.validUntil),
				network: NETWORKS[m.network].label,
			})}
			accessory={
				live ? (
					owner ? (
						<RevokeMandateButton id={m.id} />
					) : (
						<Badge variant="success">{t("statusActive")}</Badge>
					)
				) : (
					<Badge variant="muted">
						{m.revokedAt ? t("statusRevoked") : t("statusExpired")}
					</Badge>
				)
			}
		/>
	);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={owner ? t("leadOwner") : t("leadOperator")}
				actions={
					owner ? (
						<IssueMandateDialog
							operators={operators}
							networks={networks}
							destinations={data.book.map((b) => ({
								id: b.id,
								label: b.label,
								address: b.address,
								network: b.network,
							}))}
						/>
					) : undefined
				}
			/>
			{!policy.mandatesRequired && (
				<p className="mb-6 max-w-2xl rounded-2xl bg-muted p-4 text-subhead">
					{t("off")}{" "}
					{owner && (
						<Link href="/settings/access" className="text-primary">
							{t("offLink")}
						</Link>
					)}
				</p>
			)}
			{owner && operators.length === 0 && (
				<p className="mb-6 max-w-2xl text-muted-foreground text-subhead">
					{t("noOperators")}
				</p>
			)}
			{data.mandates.length === 0 ? (
				<EmptyState title={t("emptyTitle")} lead={t("emptyLead")} />
			) : (
				<ListGroup className="max-w-3xl">
					<ListSection title={t("activeTitle")} footer={t("activeFooter")}>
						{active.length === 0 && <ListRow subtitle={t("noneActive")} />}
						{active.map((m) => row(m, true))}
					</ListSection>
					{ended.length > 0 && (
						<ListSection title={t("endedTitle")}>
							{ended.map((m) => row(m, false))}
						</ListSection>
					)}
				</ListGroup>
			)}
		</>
	);
}
