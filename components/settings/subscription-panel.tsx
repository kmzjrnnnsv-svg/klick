import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RequestServiceDialog } from "@/components/settings/request-service-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { Recommendation } from "@/lib/marketing/recommend";
import { SERVICES } from "@/lib/marketing/services";
import { PRICE_ITEMS } from "@/lib/pricing/items";
import { formatPrice, type PriceTable } from "@/lib/pricing/resolve";
import { cn } from "@/lib/utils";

const PLAN_ITEM: Record<string, "plan:start" | "plan:growth" | "plan:licence"> =
	{ start: "plan:start", growth: "plan:growth", licence: "plan:licence" };

// Einstellungen → Abo & Leistungen (nur Owner): aktuelles Abo und die
// Preise der eigenen Preisgruppe. Der Gruppenname bleibt intern.
export async function SubscriptionPanel({
	plan,
	prices,
	email,
	recommendations = [],
}: {
	plan: string;
	prices: PriceTable;
	email: string;
	// „Für dich empfohlen“ (lib/marketing/recommend.ts)
	recommendations?: Recommendation[];
}) {
	const t = await getTranslations("Settings");
	const reason = (r: Recommendation) =>
		t(`reco_${r.reason.key}`, r.reason as never);
	const planItem = PLAN_ITEM[plan];
	const planLabel = planItem
		? (PRICE_ITEMS.find((i) => i.key === planItem)?.label ?? plan)
		: plan;
	return (
		<div className="flex flex-col gap-8">
			<section aria-labelledby="sub-plan" className="flex flex-col gap-2">
				<h2 id="sub-plan" className="font-serif-display text-xl text-primary">
					{t("subscriptionPlan")}
				</h2>
				<p className="text-sm">
					<span className="font-medium">{planLabel}</span>
					{planItem && (
						<span className="text-muted-foreground tabular-nums">
							{" "}
							· {formatPrice(prices[planItem])}
						</span>
					)}
				</p>
				<p className="max-w-2xl text-muted-foreground text-sm">
					{t("subscriptionLead")}
				</p>
			</section>
			{recommendations.length > 0 && (
				<section aria-labelledby="sub-reco" className="flex flex-col gap-3">
					<h2 id="sub-reco" className="font-serif-display text-xl text-primary">
						{t("recommendedTitle")}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{t("recommendedLead")}
					</p>
					<ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
						{recommendations.map((r) => {
							const svc = SERVICES.find((s) => s.key === r.service);
							const priceKey = `svc:${r.service}` as keyof PriceTable;
							return (
								<li
									key={r.service}
									className="flex flex-col gap-2 rounded-md border p-4"
								>
									<p className="font-medium">{svc?.name ?? r.service}</p>
									<p className="text-sm">{reason(r)}</p>
									{svc && (
										<p className="text-muted-foreground text-xs">
											{svc.duration}
											{prices[priceKey]
												? ` · ${formatPrice(prices[priceKey])}`
												: ""}
										</p>
									)}
									<div className="mt-auto pt-1">
										<RequestServiceDialog
											email={email}
											defaultService={`svc:${r.service}`}
											defaultMessage={reason(r)}
											triggerLabel={t("recoRequest")}
											triggerVariant="outline"
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			)}
			<section aria-labelledby="sub-services" className="flex flex-col gap-3">
				<h2
					id="sub-services"
					className="font-serif-display text-xl text-primary"
				>
					{t("subscriptionServices")}
				</h2>
				<p className="max-w-2xl text-muted-foreground text-sm">
					{t("subscriptionServicesLead")}
				</p>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("subscriptionColService")}</TableHead>
							<TableHead className="text-right">
								{t("subscriptionColPrice")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{PRICE_ITEMS.map((item) => (
							<TableRow key={item.key}>
								<TableCell>{item.label}</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatPrice(prices[item.key])}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<p className="text-muted-foreground text-xs">{t("subscriptionNote")}</p>
				<div className="flex flex-wrap gap-2">
					<RequestServiceDialog email={email} />
					<Link
						href="/leistungen"
						className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
					>
						{t("subscriptionViewServices")}
					</Link>
				</div>
			</section>
		</div>
	);
}
