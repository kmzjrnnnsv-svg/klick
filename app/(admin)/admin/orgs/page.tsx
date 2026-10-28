import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	type AccountState,
	accountState,
	feeState,
} from "@/lib/admin/contract";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { listOrganizationsWithCounts } from "@/lib/db/global";
import { orgAccounts } from "@/lib/db/org-accounts";
import { orgProfilesForAdmin } from "@/lib/db/org-profiles";
import { listPriceGroups, orgPriceGroupIds } from "@/lib/db/pricing";
import { withPlatform } from "@/lib/db/with-org";

const STATE_BADGE: Record<
	AccountState,
	"success" | "warning" | "destructive" | "secondary"
> = {
	active: "success",
	trial: "secondary",
	cancelled: "warning",
	ended: "secondary",
	suspended: "destructive",
};
const FILTERS = [
	"all",
	"active",
	"trial",
	"cancelled",
	"suspended",
	"fee_due",
] as const;
type Filter = (typeof FILTERS)[number];

// Admin > Organisationen (Admin-Portal, Teil 2): Liste mit Suche und Filter
// über die URL; Details, Vertrag, Preisgruppe und Sperre auf der Detailseite.
export default async function AdminOrgsPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string }>;
}) {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("AdminOrgs");
	const ta = await getTranslations("Admin");
	const ts = await getTranslations("Setup");
	const sp = await searchParams;
	const q = (sp.q ?? "").trim().toLowerCase();
	const filter: Filter = (FILTERS as readonly string[]).includes(
		sp.status ?? "",
	)
		? (sp.status as Filter)
		: "all";
	const ctx = {
		userId: admin.userId,
		ip: admin.ip,
		userAgent: admin.userAgent,
	};
	const [orgs, accounts, groups, assignments, profiles] = await Promise.all([
		listOrganizationsWithCounts(),
		orgAccounts(),
		listPriceGroups(),
		withPlatform(
			{ ...ctx, reason: "Admin: Organisationen mit Preisgruppen" },
			(tx) => orgPriceGroupIds(tx),
		),
		withPlatform(
			{
				...ctx,
				reason: "Admin: Organisationen mit Profil aus der Einrichtung",
			},
			(tx) => orgProfilesForAdmin(tx),
		),
	]);
	const now = new Date();
	const defaultGroup = groups.find((r) => r.group.isDefault)?.group ?? null;
	const groupName = new Map(groups.map((r) => [r.group.id, r.group.name]));
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});

	const rows = orgs
		.map((o) => {
			const acc = accounts.get(o.id) ?? null;
			return {
				...o,
				state: accountState(acc, now),
				fee: feeState(acc, now),
				group:
					groupName.get(assignments.get(o.id) ?? "") ??
					defaultGroup?.name ??
					"—",
				onboarded: assignments.has(o.id),
				profile: profiles.get(o.id),
			};
		})
		.filter(
			(r) =>
				!q ||
				r.name.toLowerCase().includes(q) ||
				r.slug.toLowerCase().includes(q),
		)
		.filter((r) =>
			filter === "all"
				? true
				: filter === "fee_due"
					? r.fee.kind === "due"
					: r.state === filter,
		);

	const href = (f: Filter) => {
		const p = new URLSearchParams();
		if (q) p.set("q", q);
		if (f !== "all") p.set("status", f);
		const s = p.toString();
		return s ? `/admin/orgs?${s}` : "/admin/orgs";
	};

	return (
		<div className="flex flex-col gap-6">
			<PageHeader title={ta("orgs")} lead={t("listLead")} />
			<form className="flex max-w-md gap-2">
				<label htmlFor="org-q" className="sr-only">
					{t("search")}
				</label>
				<Input
					id="org-q"
					name="q"
					type="search"
					defaultValue={sp.q ?? ""}
					placeholder={t("searchPlaceholder")}
					autoComplete="off"
				/>
				{filter !== "all" && (
					<input type="hidden" name="status" value={filter} />
				)}
			</form>
			<nav aria-label={t("filter")} className="flex flex-wrap gap-2">
				{FILTERS.map((f) => (
					<Link
						key={f}
						href={href(f)}
						aria-current={filter === f ? "page" : undefined}
						className={`inline-flex h-(--control-h-sm) items-center rounded-full px-3 text-subhead transition-colors ${
							filter === f
								? "bg-foreground text-background"
								: "bg-muted text-foreground hover:bg-muted/70"
						}`}
					>
						{t(`filter_${f}`)}
					</Link>
				))}
			</nav>
			{rows.length === 0 ? (
				<p className="text-muted-foreground">{t("listEmpty")}</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("colName")}</TableHead>
							<TableHead>{t("field_status")}</TableHead>
							<TableHead>{t("colMembers")}</TableHead>
							<TableHead>{ta("orgProfile")}</TableHead>
							<TableHead>{ta("priceGroup")}</TableHead>
							<TableHead>{t("fee")}</TableHead>
							<TableHead>{t("colCreated")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((o) => (
							<TableRow key={o.id}>
								<TableCell>
									<Link
										href={`/admin/orgs/${o.id}`}
										className="font-medium hover:underline"
									>
										{o.name}
									</Link>
									<span
										className="block whitespace-nowrap font-mono text-footnote text-muted-foreground"
										translate="no"
									>
										{o.slug}
									</span>
								</TableCell>
								<TableCell>
									<Badge variant={STATE_BADGE[o.state]}>
										{t(`state_${o.state}`)}
									</Badge>
								</TableCell>
								<TableCell className="tabular-nums">{o.members}</TableCell>
								<TableCell className="text-footnote">
									{o.profile ? (
										<>
											{o.profile.classification.size
												? ts(`size_${o.profile.classification.size}`)
												: ts("sizeUnknown")}
											{o.profile.employees != null
												? ` · ${o.profile.employees} MA`
												: ""}
										</>
									) : (
										"—"
									)}
								</TableCell>
								<TableCell className="text-footnote">
									{o.onboarded ? o.group : t("onboardingOpen")}
								</TableCell>
								<TableCell className="text-footnote">
									{o.fee.kind === "due" ? (
										<Badge variant="warning">{t("feeDueShort")}</Badge>
									) : o.fee.kind === "invoiced" ? (
										t("feeInvoicedShort")
									) : o.fee.kind === "before_audit" ? (
										t("feeBeforeAuditShort")
									) : (
										"—"
									)}
								</TableCell>
								<TableCell className="whitespace-nowrap text-muted-foreground">
									{fmt.format(o.createdAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
