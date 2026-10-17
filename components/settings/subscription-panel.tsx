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
}: {
	plan: string;
	prices: PriceTable;
	email: string;
}) {
	const t = await getTranslations("Settings");
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
