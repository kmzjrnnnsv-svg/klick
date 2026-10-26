import { desc, inArray, isNull, or } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { VerifyChainButton } from "@/components/admin/verify-chain-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { auditLog } from "@/db/schema";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { withPlatform } from "@/lib/db/with-org";
import { viewableOrgs } from "@/lib/platform-access/service";

export default async function AdminAuditPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	// Plattform-Protokoll immer; das Protokoll einer Org nur mit deren
	// Freigabe „Protokoll einsehen“ (Lockbox, Härtung A3) — jede Einsicht
	// steht dann auch in der Kette der Org.
	const orgs = await viewableOrgs(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		"Audit-Log in Admin > Audit-Log angesehen",
	);
	const rows = await withPlatform(
		{
			userId: admin.userId,
			reason: "Admin: Audit-Log-Ansicht",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		(tx) =>
			tx
				.select()
				.from(auditLog)
				.where(
					orgs.length > 0
						? or(
								isNull(auditLog.organizationId),
								inArray(auditLog.organizationId, orgs),
							)
						: isNull(auditLog.organizationId),
				)
				.orderBy(desc(auditLog.seq))
				.limit(200),
	);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-bold text-title-1">{t("audit")}</h1>
					<p className="max-w-2xl text-muted-foreground text-subhead">
						{t("auditLockboxHint")}
					</p>
				</div>
				<div className="flex flex-wrap items-start gap-3">
					<Button
						asChild
						variant="outline"
						size="sm"
						title={t("exportCsvHint")}
					>
						<a href="/api/admin/audit.csv" download>
							{t("exportCsv")}
						</a>
					</Button>
					<VerifyChainButton />
				</div>
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
							<TableCell className="whitespace-nowrap font-mono text-footnote">
								{String(r.seq)}
							</TableCell>
							<TableCell className="whitespace-nowrap text-footnote">
								{fmt.format(r.at)}
							</TableCell>
							<TableCell className="whitespace-nowrap font-mono text-footnote">
								{r.organizationId
									? r.organizationId.slice(0, 8)
									: t("platform")}
							</TableCell>
							<TableCell className="whitespace-nowrap font-mono text-footnote">
								{r.actorUserId?.slice(0, 8) ?? "—"}
							</TableCell>
							<TableCell className="font-medium text-footnote">
								{r.action}
							</TableCell>
							<TableCell className="font-mono text-footnote">
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
							<TableCell className="whitespace-nowrap font-mono text-footnote">
								{r.ip ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}
