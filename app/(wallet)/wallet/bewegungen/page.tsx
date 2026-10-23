import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TransferList } from "@/components/wallet/transfer-list";
import { requireWalletPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { readOrg } from "@/lib/db/with-org";
import { cn } from "@/lib/utils";
import { listTransfers, listWalletAccounts } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: "Bewegungen" };

const PAGE = 30;
const DIRECTIONS = ["in", "out"] as const;

// /wallet/bewegungen — alle Bewegungen, Filter über die URL (?richtung=,
// ?konto=, ?seite=), CSV mit Export-Recht.
export default async function WalletMovementsPage({
	searchParams,
}: {
	searchParams: Promise<{ richtung?: string; konto?: string; seite?: string }>;
}) {
	const sp = await searchParams;
	const ctx = await requireWalletPage("/wallet/bewegungen");
	const t = await getTranslations("Wallet");
	const direction = DIRECTIONS.find((d) => d === sp.richtung) ?? null;
	const page = Math.max(1, Number.parseInt(sp.seite ?? "1", 10) || 1);
	const { accounts, list } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const accounts = await listWalletAccounts(tx, ctx.orgId, {
			includeRetired: true,
		});
		const accountId = accounts.some((a) => a.id === sp.konto) ? sp.konto : null;
		return {
			accounts,
			list: await listTransfers(tx, ctx.orgId, {
				accountId,
				direction,
				limit: PAGE,
				offset: (page - 1) * PAGE,
			}),
		};
	});
	const pages = Math.max(1, Math.ceil(list.total / PAGE));
	const href = (over: Record<string, string | null>) => {
		const q = new URLSearchParams();
		const merged = {
			richtung: direction,
			konto: sp.konto ?? null,
			seite: null as string | null,
			...over,
		};
		for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
		const s = q.toString();
		return `/wallet/bewegungen${s ? `?${s}` : ""}`;
	};
	const filters = [
		{ key: null, label: t("filterAll") },
		{ key: "in", label: t("filterIn") },
		{ key: "out", label: t("filterOut") },
	] as const;
	return (
		<>
			<PageHeader
				title={t("movementsTitle")}
				lead={t("movementsLead")}
				actions={
					allows(ctx, { export: ["create"] }) &&
					list.total > 0 && (
						<Button asChild variant="outline" size="sm">
							<a href="/api/export/wallet-bewegungen.csv" download>
								<Download aria-hidden />
								{t("exportCsv")}
							</a>
						</Button>
					)
				}
			/>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				{filters.map((f) => (
					<Link
						key={f.label}
						href={href({ richtung: f.key })}
						aria-current={direction === f.key ? "page" : undefined}
						className={cn(
							"rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary",
							direction === f.key
								? "border-foreground/40 bg-muted font-medium"
								: "border-border/60 hover:bg-muted/60",
						)}
					>
						{f.label}
					</Link>
				))}
				{accounts.length > 1 &&
					accounts.map((a) => (
						<Link
							key={a.id}
							href={href({ konto: sp.konto === a.id ? null : a.id })}
							aria-current={sp.konto === a.id ? "page" : undefined}
							className={cn(
								"rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary",
								sp.konto === a.id
									? "border-foreground/40 bg-muted font-medium"
									: "border-border/60 hover:bg-muted/60",
							)}
						>
							{a.name}
						</Link>
					))}
			</div>
			<TransferList rows={list.rows} />
			{pages > 1 && (
				<nav
					aria-label={t("pageOf", { page, pages })}
					className="mt-6 flex items-center justify-between gap-2 text-sm"
				>
					{page > 1 ? (
						<Link
							href={href({ seite: String(page - 1) })}
							className="text-primary hover:underline"
						>
							{t("prev")}
						</Link>
					) : (
						<span />
					)}
					<span className="text-muted-foreground">
						{t("pageOf", { page, pages })}
					</span>
					{page < pages ? (
						<Link
							href={href({ seite: String(page + 1) })}
							className="text-primary hover:underline"
						>
							{t("next")}
						</Link>
					) : (
						<span />
					)}
				</nav>
			)}
		</>
	);
}
