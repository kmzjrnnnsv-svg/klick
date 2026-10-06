import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { VerifyChainButton } from "@/components/admin/verify-chain-button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { auditLog } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { withPlatform } from "@/lib/db/with-org";

export default async function AdminAuditPage() {
	const admin = await requirePlatformAdmin();
	const t = await getTranslations("Admin");
	// Jeder mandantenübergreifende Zugriff wird mit Begründung protokolliert.
	const rows = await withPlatform(
		{
			userId: admin.userId,
			reason: "Admin: Audit-Log-Ansicht",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		(tx) => tx.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(200),
	);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<h1 className="font-serif-display text-3xl text-primary">
					{t("audit")}
				</h1>
				<VerifyChainButton />
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>#</TableHead>
						<TableHead>{t("colWhen")}</TableHead>
						<TableHead>{t("colOrg")}</TableHead>
						<TableHead>{t("colActor")}</TableHead>
						<TableHead>{t("colAction")}</TableHead>
						<TableHead>{t("colTarget")}</TableHead>
						<TableHead>{t("colOutcome")}</TableHead>
						<TableHead>IP</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => (
						<TableRow key={r.id}>
							<TableCell className="font-mono text-xs">
								{String(r.seq)}
							</TableCell>
							<TableCell className="whitespace-nowrap text-xs">
								{fmt.format(r.at)}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.organizationId
									? r.organizationId.slice(0, 8)
									: t("platform")}
							</TableCell>
							<TableCell className="font-mono text-xs">
								{r.actorUserId?.slice(0, 8) ?? "—"}
							</TableCell>
							<TableCell className="font-medium text-xs">{r.action}</TableCell>
							<TableCell className="font-mono text-xs">
								{r.target ?? "—"}
							</TableCell>
							<TableCell>
								<Badge
									variant={
										r.outcome === "success"
											? "success"
											: r.outcome === "denied"
												? "destructive"
												: "warning"
									}
								>
									{r.outcome}
								</Badge>
							</TableCell>
							<TableCell className="font-mono text-xs">{r.ip ?? "—"}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}
