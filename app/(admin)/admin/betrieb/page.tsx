import { getTranslations } from "next-intl/server";
import { RetryJobButton, TestMailButton } from "@/components/admin/ops-actions";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { type HostCheck, hostChecks } from "@/lib/admin/host-status";
import { readHostStatus } from "@/lib/admin/host-status-file";
import type { Level } from "@/lib/admin/overview";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import {
	failedJobs,
	jobQueues,
	stuckImmediateMails,
} from "@/lib/db/admin-jobs";
import { withPlatform } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { diagnoseMailConfig } from "@/lib/mail/send";

const LEVEL_BADGE: Record<
	Level,
	"success" | "warning" | "destructive" | "muted"
> = {
	ok: "success",
	warn: "warning",
	bad: "destructive",
	unknown: "muted",
};

// Admin > Betrieb (Admin-Portal, Teil 5): Server-Status aus der Statusdatei
// von klick-health (die App hat kein root), Hintergrundaufgaben (pg-boss) mit
// „erneut starten“ und Mailversand mit Testmail. Keine Inhalte einer Org.
async function AdminOpsPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("AdminOps");
	const ta = await getTranslations("Admin");
	const now = new Date();
	const [host, queues, failed, mail, stuck] = await Promise.all([
		readHostStatus(),
		jobQueues(),
		failedJobs(),
		diagnoseMailConfig(),
		withPlatform(
			{
				userId: admin.userId,
				ip: admin.ip,
				userAgent: admin.userAgent,
				reason: "Admin: Betrieb (hängende Sofort-Mails, nur Zähler)",
			},
			(tx) => stuckImmediateMails(tx, now),
		),
	]);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const when = (d: Date | null | undefined) => (d ? fmt.format(d) : "—");
	const badge = (level: Level, text: string) => (
		<Badge variant={LEVEL_BADGE[level]}>{text}</Badge>
	);
	const checks = host.ok ? hostChecks(host.status, now) : [];
	const checkText = (c: HostCheck): string => {
		const v = c.values;
		switch (c.key) {
			case "fresh":
				return t("check_fresh_value", { date: when(v.at as Date) });
			case "disk":
				return v.mount
					? t("check_disk_value", {
							mount: String(v.mount),
							pct: Number(v.pct),
						})
					: t("unknown");
			case "memory":
				return v.total
					? t("check_memory_value", {
							available: Number(v.available),
							total: Number(v.total),
						})
					: t("unknown");
			case "updates":
				return v.total !== undefined
					? t("check_updates_value", {
							total: Number(v.total),
							security: Number(v.security),
						})
					: t("unknown");
			case "reboot":
				return c.level === "ok" ? t("check_reboot_no") : t("check_reboot_yes");
			case "certs":
				return v.name
					? t("check_certs_value", {
							name: String(v.name),
							days: Number(v.days),
						})
					: t("unknown");
			case "services":
				return v.total
					? v.down
						? t("check_services_down", { down: String(v.down) })
						: t("check_services_value", {
								running: Number(v.running),
								total: Number(v.total),
							})
					: t("unknown");
			case "backup":
			case "aide":
				return v.at
					? t("check_last_run", { date: when(v.at as Date) })
					: t("unknown");
			case "crowdsec":
				return v.bans !== undefined
					? t("check_crowdsec_value", { bans: Number(v.bans) })
					: t("unknown");
		}
	};
	const queueLevel = (q: NonNullable<typeof queues>[number]): Level =>
		q.failed24h > 0 ? "bad" : q.queued > 50 ? "warn" : "ok";

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader title={ta("operations")} lead={t("lead")} />
			<ListGroup>
				<ListSection title={t("sectionServer")} footer={t("serverFooter")}>
					{!host.ok ? (
						<ListRow
							title={
								host.reason === "missing" ? t("hostMissing") : t("hostInvalid")
							}
							subtitle={
								<span translate="no" className="font-mono">
									{env().HOST_STATUS_FILE}
								</span>
							}
						/>
					) : (
						<>
							{checks.map((c) => (
								<ListRow
									key={c.key}
									title={t(`check_${c.key}`)}
									subtitle={checkText(c)}
									accessory={badge(c.level, t(`level_${c.level}`))}
								/>
							))}
							{host.status.problems.map((p) => (
								<ListRow key={p} title={p} destructive />
							))}
						</>
					)}
				</ListSection>

				<ListSection title={t("sectionJobs")} footer={t("jobsFooter")}>
					{queues === null ? (
						<ListRow title={t("jobsUnreadable")} />
					) : queues.length === 0 ? (
						<ListRow title={t("jobsNone")} />
					) : (
						queues.map((q) => (
							<ListRow
								key={q.name}
								title={
									<span translate="no" className="font-mono">
										{q.name}
									</span>
								}
								subtitle={[
									q.cron ? t("jobCron", { cron: q.cron }) : null,
									t("jobLastSuccess", { date: when(q.lastSuccess) }),
									q.queued > 0 ? t("jobQueued", { n: q.queued }) : null,
									q.active > 0 ? t("jobActive", { n: q.active }) : null,
								]
									.filter(Boolean)
									.join(" · ")}
								accessory={
									q.failed24h > 0
										? badge("bad", t("jobFailed", { n: q.failed24h }))
										: badge(queueLevel(q), t("level_ok"))
								}
							/>
						))
					)}
				</ListSection>

				{failed && failed.length > 0 && (
					<ListSection title={t("sectionFailed")} footer={t("failedFooter")}>
						{failed.map((f) => (
							<ListRow
								key={f.id}
								title={
									<span translate="no" className="font-mono">
										{f.name}
									</span>
								}
								subtitle={
									<>
										{when(f.at)} · {t("jobRetries", { n: f.retries })}
										{f.message && (
											<span className="block break-words font-mono text-footnote">
												{f.message}
											</span>
										)}
									</>
								}
								accessory={<RetryJobButton name={f.name} id={f.id} />}
							/>
						))}
					</ListSection>
				)}

				<ListSection title={t("sectionMail")} footer={t("mailFooter")}>
					<ListRow
						title={t("mailPath")}
						accessory={badge(
							mail.likelyPath === "console" ? "bad" : "ok",
							mail.likelyPath === "console" ? t("mailNone") : mail.likelyPath,
						)}
					/>
					<ListRow
						title={t("mailFrom")}
						subtitle={
							<span translate="no" className="break-all">
								{mail.mailFrom}
							</span>
						}
					/>
					<ListRow
						title={t("mailStuck")}
						accessory={stuck > 0 ? badge("warn", String(stuck)) : undefined}
						value={stuck > 0 ? undefined : "0"}
					/>
				</ListSection>
				<TestMailButton />
			</ListGroup>
		</div>
	);
}

export default withMessages(AdminOpsPage, ["AdminOps", "Common"]);
