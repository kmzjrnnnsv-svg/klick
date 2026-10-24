import { auditLabel } from "@wallet/lib/audit-labels";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { auditTrail } from "@wallet/lib/orgs/members";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Protokoll" };

export default async function AuditPage() {
	const t = await getTranslations("Audit");
	const ctx = await requireOrgPage("/audit", "audit:read");
	const { rows, chain } = await auditTrail({
		orgId: ctx.orgId,
		userId: ctx.userId,
	});
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<div className="flex flex-col gap-6">
			<div className="flex max-w-2xl flex-col gap-2">
				<h1 className="font-serif-display text-3xl">{t("title")}</h1>
				<p className="text-muted-foreground">
					{t("lead", { org: ctx.orgName })}
				</p>
			</div>
			<p
				role={chain.ok ? undefined : "alert"}
				className={
					chain.ok ? "text-sm" : "font-medium text-destructive text-sm"
				}
			>
				{chain.ok
					? t("chainOk", { count: chain.checked })
					: t("chainBroken", { seq: chain.brokenAtSeq })}
			</p>
			{rows.length === 0 ? (
				<p className="text-muted-foreground">{t("empty")}</p>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("when")}</TableHead>
								<TableHead>{t("who")}</TableHead>
								<TableHead>{t("what")}</TableHead>
								<TableHead>{t("target")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => (
								<TableRow key={String(r.seq)}>
									<TableCell className="whitespace-nowrap tabular-nums">
										{fmt.format(r.at)}
									</TableCell>
									<TableCell>{r.actor ?? t("system")}</TableCell>
									<TableCell>{auditLabel(r.action)}</TableCell>
									<TableCell
										className="whitespace-nowrap font-mono text-xs"
										translate="no"
									>
										{r.target?.split(":")[0] ?? ""}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			<p className="text-muted-foreground text-xs">
				{t("shown", { count: rows.length })}
			</p>
		</div>
	);
}
