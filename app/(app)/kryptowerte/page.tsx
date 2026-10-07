import { getTranslations } from "next-intl/server";
import {
	ApplyCryptoSeedButton,
	CryptoAssetForm,
} from "@/components/casp/crypto-asset-form";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listCryptoAssets } from "@/lib/compliance/queries-p4";
import { readOrg } from "@/lib/db/with-org";

const eur = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
	maximumFractionDigits: 0,
});

// /kryptowerte — Kryptowerte, auf die sich die Dienste beziehen (MiCAR
// Art. 62(2)(r)); Annahme nur mit zugelassenem EMT-Emittenten (Art. 48)
// oder bei nativen Werten ohne Emittent.
export default async function CryptoAssetsPage() {
	const ctx = await requireOrg({ crypto_asset: ["read"] });
	const t = await getTranslations("CryptoAssets");
	const canEdit = roleAllows(ctx.orgRole, { crypto_asset: ["update"] });
	const rows = await readOrg(toOrgCtx(ctx), (tx) =>
		listCryptoAssets(tx, ctx.orgId),
	);
	const accepted = rows.filter((r) => r.accepted).length;
	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						<span className="flex flex-wrap gap-2">
							<ApplyCryptoSeedButton />
							<CryptoAssetForm />
						</span>
					) : undefined
				}
			/>
			<p className="mb-4 text-sm">
				<Badge variant="outline">
					{t("acceptedCount", { n: accepted, total: rows.length })}
				</Badge>
			</p>
			{rows.length === 0 ? (
				<EmptyState
					title={t("empty")}
					lead={t("emptyLead")}
					requiredBy={t("requiredBy")}
					actions={
						canEdit ? (
							<>
								<ApplyCryptoSeedButton />
								<CryptoAssetForm />
							</>
						) : undefined
					}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-24">{t("symbol")}</TableHead>
							<TableHead>{t("name")}</TableHead>
							<TableHead className="w-20">{t("type")}</TableHead>
							<TableHead className="w-36">{t("micarStatus")}</TableHead>
							<TableHead className="w-40">{t("networks")}</TableHead>
							<TableHead className="w-28">{t("perTxLimit")}</TableHead>
							<TableHead className="w-28">{t("reviewedAt")}</TableHead>
							<TableHead className="w-32">{t("accepted")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow key={r.id}>
								<TableCell className="font-mono text-xs">{r.symbol}</TableCell>
								<TableCell>
									<p className="font-medium">{r.name}</p>
									{r.issuer && (
										<p className="text-muted-foreground text-xs">
											{r.issuer}
											{r.issuerAuthorisation
												? ` · ${r.issuerAuthorisation}`
												: ""}
										</p>
									)}
									{r.notes && (
										<p className="line-clamp-2 text-muted-foreground text-xs">
											{r.notes}
										</p>
									)}
								</TableCell>
								<TableCell>
									<Badge variant="outline">{t(`type_${r.type}`)}</Badge>
								</TableCell>
								<TableCell>
									<Badge
										variant={
											r.micarStatus === "authorised"
												? "success"
												: r.micarStatus === "pending"
													? "warning"
													: "destructive"
										}
									>
										{t(`status_${r.micarStatus}`)}
									</Badge>
									{r.whitepaperRef && (
										<p className="text-[0.65rem] text-muted-foreground">
											{r.whitepaperRef}
										</p>
									)}
								</TableCell>
								<TableCell className="text-xs">
									{(r.networks ?? []).join(", ") || "—"}
								</TableCell>
								<TableCell className="text-xs">
									{r.perTxLimit ? eur.format(Number(r.perTxLimit)) : "—"}
								</TableCell>
								<TableCell className="text-xs">
									{r.reviewedAt
										? fmtDate.format(new Date(`${r.reviewedAt}T00:00:00Z`))
										: "—"}
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<Badge variant={r.accepted ? "success" : "muted"}>
											{r.accepted ? t("yes") : t("no")}
										</Badge>
										{canEdit && (
											<CryptoAssetForm
												initial={{
													id: r.id,
													symbol: r.symbol,
													name: r.name,
													issuer: r.issuer,
													type: r.type,
													issuerAuthorisation: r.issuerAuthorisation,
													whitepaperRef: r.whitepaperRef,
													micarStatus: r.micarStatus,
													networks: (r.networks ?? []).join(", "),
													accepted: r.accepted,
													acceptedFrom: r.acceptedFrom,
													perTxLimit: r.perTxLimit,
													reviewedAt: r.reviewedAt,
													notes: r.notes,
												}}
											/>
										)}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			<p className="mt-4 text-muted-foreground text-xs">{t("disclaimer")}</p>
		</>
	);
}
